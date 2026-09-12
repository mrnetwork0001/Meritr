"use client";

import {
  Contract,
  JsonRpcProvider,
  JsonRpcSigner,
  MaxUint256,
  formatUnits,
  parseUnits,
} from "ethers";
import { CHAINS } from "./chains";

/**
 * Contract bindings for the browser.
 *
 * Human-readable ABI fragments rather than imported artifact JSON: the UI touches a dozen
 * functions out of three contracts, and shipping the full compiled ABIs would add far more
 * bytes than it earns. Addresses always come from the backend's /api/config, so a redeploy
 * propagates without a frontend change.
 */

export const VAULT_ABI = [
  // lender
  "function deposit(uint256 assets) returns (uint256)",
  "function withdraw(uint256 shares) returns (uint256)",
  "function fundReserve(uint256 amount)",
  "function sharesOf(address) view returns (uint256)",
  "function previewWithdraw(uint256 shares) view returns (uint256)",
  "function totalIdle() view returns (uint256)",
  // borrower
  "function openLoan(uint256 collateralAmount, uint256 borrowAmount)",
  "function addCollateral(uint256 amount)",
  "function repay(uint256 amount) returns (uint256)",
  "function debtOf(address) view returns (uint256)",
  "function quote(address) view returns (uint16 score, uint256 rateBps, uint256 maxLtvBps)",
  // keeper / agent
  "function restructure(address borrower) returns (uint256, uint256, uint256)",
  "function flagStress(address borrower) returns (bool)",
  "function liquidate(address borrower, uint256 repayAmount) returns (uint256)",
  "function healthFactorOf(address) view returns (uint256)",
  // wiring
  "function ASSET() view returns (address)",
  "function COLLATERAL() view returns (address)",
  // Custom errors. Without these fragments ethers cannot decode a revert and every failure
  // reaches the user as "execution reverted (unknown custom error)", which is the least
  // actionable message the UI is capable of producing.
  "error ZeroAmount()",
  "error InsufficientShares()",
  "error InsufficientLiquidity(uint256 requested, uint256 available)",
  "error LoanAlreadyOpen(address borrower)",
  "error NoActiveLoan(address borrower)",
  "error ExceedsMaxLtv(uint256 requestedLtvBps, uint256 maxLtvBps)",
  "error NotStressed(uint256 healthFactor)",
  "error NotLiquidatable(uint256 healthFactor)",
  "error CooldownActive(uint64 readyAt)",
  "error RestructureLimitReached()",
  "error NotAuthorizedYet(uint64 openAt)",
  "error PriceNotSet()",
] as const;

export const PASSPORT_ABI = [
  "function mint() returns (uint256)",
  "function refresh(address holder) returns (uint16)",
  "function passportOf(address) view returns (uint256)",
  // See the note on VAULT_ABI: these make a refusal readable.
  "error NoAttestationsYet(address holder)",
  "error PassportAlreadyIssued(address holder)",
  "error NoPassport(address holder)",
  "error SoulboundTransferDisabled()",
] as const;

export const ERC20_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  // MockERC20 only - the demo tokens have an open mint so a reviewer can try the flows.
  "function mint(address to, uint256 amount)",
] as const;

export const ATTESTOR_ABI = [
  "function hasAttestations(address) view returns (bool)",
] as const;

export const vault = (address: string, signer: JsonRpcSigner) =>
  new Contract(address, VAULT_ABI, signer);
export const passport = (address: string, signer: JsonRpcSigner) =>
  new Contract(address, PASSPORT_ABI, signer);
export const erc20 = (address: string, signer: JsonRpcSigner) =>
  new Contract(address, ERC20_ABI, signer);
export const attestor = (address: string, signer: JsonRpcSigner) =>
  new Contract(address, ATTESTOR_ABI, signer);

/**
 * Ensure `spender` may move `amount` of `token` on the owner's behalf.
 *
 * Returns the approval transaction hash when one was needed, or null when the existing
 * allowance already covers it - which the transaction modal renders as a skipped step rather
 * than hiding. An approval is a real transaction the user signs; it should never be invisible.
 *
 * Approves the exact amount rather than MaxUint256: silently opting someone into an unlimited
 * allowance on unaudited contracts is not a defensible default.
 */

/**
 * Run a write call read-only first, so a refusal arrives decoded.
 *
 * MetaMask estimates gas before sending, and when that estimation reverts it hands ethers a
 * CALL_EXCEPTION with no `data`. Ethers can only report "missing revert data" - the least
 * useful string the UI is capable of showing, and the one a reviewer would have seen when
 * minting a passport without attestations.
 *
 * The chain is not the problem: an `eth_call` against a plain JSON-RPC provider returns the
 * selector and arguments intact, and with the error fragments in the ABI ethers decodes them
 * into `err.revert.name`. So every write is rehearsed against that provider first. If the
 * rehearsal reverts, the caller gets the real custom error; if it passes, the transaction is
 * sent through the wallet as normal.
 *
 * Read-only and free - `eth_call` executes nothing and costs no gas. The cost is one extra
 * round trip before each write, which is worth paying to never show a hex selector again.
 */
export async function preflight(
  address: string,
  abi: readonly string[],
  method: string,
  args: unknown[],
  from: string,
  chainId: number | null
): Promise<void> {
  const rpc = chainId !== null ? CHAINS[chainId]?.rpcUrls?.[0] : undefined;
  if (!rpc) return; // unknown network: let the wallet try, rather than block a real action
  try {
    const reader = new JsonRpcProvider(rpc);
    const probe = new Contract(address, abi, reader);
    await probe[method].staticCall(...args, { from });
  } catch (err: any) {
    // A decoded revert is the whole point of this rehearsal; rethrow it for the modal.
    if (err?.revert?.name || err?.data) throw err;
    // Anything else - the read RPC being unreachable, a transport hiccup - must not block a
    // transaction that would have succeeded. Fall through and let the wallet decide.
  }
}

export async function ensureAllowance(
  tokenAddress: string,
  spender: string,
  amount: bigint,
  signer: JsonRpcSigner,
  unlimited = false
): Promise<string | null> {
  const token = erc20(tokenAddress, signer);
  const owner = await signer.getAddress();
  const current: bigint = await token.allowance(owner, spender);
  if (current >= amount) return null;
  const tx = await token.approve(spender, unlimited ? MaxUint256 : amount);
  await tx.wait();
  return tx.hash as string;
}

/** Parse a user-typed amount, tolerating empty input and stray whitespace. */
export function toUnits(value: string, decimals: number): bigint {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return 0n;
  return parseUnits(trimmed, decimals);
}

export function fromUnits(value: bigint, decimals: number, places = 4): string {
  const s = formatUnits(value, decimals);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("en-US", { maximumFractionDigits: places });
}
