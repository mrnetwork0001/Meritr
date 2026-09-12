"use client";

import { Contract, JsonRpcSigner, MaxUint256, formatUnits, parseUnits } from "ethers";

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
] as const;

export const PASSPORT_ABI = [
  "function mint() returns (uint256)",
  "function refresh(address holder) returns (uint16)",
  "function passportOf(address) view returns (uint256)",
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
