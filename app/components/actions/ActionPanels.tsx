"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type FaucetStatus, type MeritrConfig } from "../../lib/api";
import { useWallet } from "../../lib/wallet";
import {
  ensureAllowance,
  erc20,
  fromUnits,
  passport as passportAt,
  toUnits,
  vault as vaultAt,
} from "../../lib/contracts";
import { AmountField } from "../Field";
import { useTx } from "../TxModal";
import { ConnectButton } from "../ConnectButton";
import { pct } from "../../lib/format";

const EXPLORER = "https://creditcoin-testnet.blockscout.com";

/**
 * Wallet-driven actions against the deployed contracts.
 *
 * Everything here is a write path. Reads still come from the risk API, which is the single
 * source the rest of the console trusts; these panels only need balances and allowances, which
 * are per-wallet and therefore not something a shared backend should be answering.
 */

type Balances = {
  asset: bigint;
  collateral: bigint;
  shares: bigint;
  debt: bigint;
  assetSymbol: string;
  collateralSymbol: string;
  hasPassport: boolean;
  score: number;
  rateBps: number;
  maxLtvBps: number;
  /** Native CTC, in wei. Gas for every action on this page. */
  gas: bigint;
};

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
      <div className="border-b border-[var(--color-line)] px-5 py-3">
        <h3 className="text-[13px] font-semibold text-gray-200">{title}</h3>
        {subtitle && <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">{subtitle}</p>}
      </div>
      <div className="space-y-3 px-5 py-4">{children}</div>
    </div>
  );
}

export function ActionPanels({ config }: { config: MeritrConfig | null }) {
  const { account, chainId, getSigner, nonce } = useWallet();
  const [bal, setBal] = useState<Balances | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const aDec = config?.decimals.asset ?? 6;
  const cDec = config?.decimals.collateral ?? 18;
  const ready = Boolean(config && account && chainId === config.chainId);

  const load = useCallback(async () => {
    if (!config || !account) return;
    try {
      const signer = await getSigner();
      const v = vaultAt(config.contracts.MeritrVault, signer);
      const a = erc20(config.contracts.asset, signer);
      const c = erc20(config.contracts.collateral, signer);
      const p = passportAt(config.contracts.MeritrPassport, signer);

      const [assetBal, collBal, shares, debt, aSym, cSym, pid, quote, gas] = await Promise.all([
        a.balanceOf(account),
        c.balanceOf(account),
        v.sharesOf(account),
        v.debtOf(account),
        a.symbol().catch(() => "ASSET"),
        c.symbol().catch(() => "COLL"),
        p.passportOf(account).catch(() => 0n),
        v.quote(account),
        // Native CTC. Every action below needs it for gas, and a wallet holding none is the
        // most likely state a first-time visitor arrives in.
        signer.provider.getBalance(account),
      ]);

      setBal({
        asset: assetBal,
        collateral: collBal,
        shares,
        debt,
        assetSymbol: aSym,
        collateralSymbol: cSym,
        hasPassport: pid > 0n,
        score: Number(quote[0]),
        rateBps: Number(quote[1]),
        maxLtvBps: Number(quote[2]),
        gas: gas as bigint,
      });
      setErr(null);
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message ?? "Could not read balances");
    }
  }, [config, account, getSigner]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load, nonce]);

  if (!config) {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88 px-5 py-10 text-center">
        <p className="font-mono text-[11px] text-gray-600">waiting for deployment config…</p>
      </div>
    );
  }

  if (!account || chainId !== config.chainId) {
    return (
      <div className="rounded-lg border border-model/25 bg-model/[0.06] px-5 py-8 text-center">
        <h3 className="text-[14px] font-semibold text-gray-100">
          {account ? "Wrong network" : "Connect a wallet to act"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-gray-400">
          {account
            ? `Meritr is deployed on ${config.network} (chain ${config.chainId}). Switch networks to supply, borrow or trigger the agent.`
            : "Everything else in this console is read-only and stays exactly as it is with no wallet attached. Connect one to supply liquidity, open a credit line, or trigger a restructuring yourself."}
        </p>
        <div className="mt-5 flex justify-center">
          <ConnectButton expectedChainId={config.chainId} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err && (
        <p className="rounded border border-down/30 bg-down/[0.06] px-4 py-2 font-mono text-[11px] text-down">
          {err}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {bal && bal.gas === 0n && <GasFaucet onDone={load} />}

        <FaucetPanel config={config} bal={bal} aDec={aDec} cDec={cDec} onDone={load} />
        <LendPanel config={config} bal={bal} aDec={aDec} onDone={load} />
        <BorrowPanel config={config} bal={bal} aDec={aDec} cDec={cDec} onDone={load} />
        <KeeperPanel config={config} aDec={aDec} onDone={load} />
      </div>
    </div>
  );
}


/* ── Native CTC faucet ───────────────────────────────────────────────────── */

/**
 * Gives an empty wallet the gas to try anything at all.
 *
 * Gasless by necessity rather than preference: a wallet holding zero CTC cannot pay for a
 * transaction, so it cannot ask for one either. The visitor signs a *message* - free, off-chain,
 * moves nothing - and the backend, which holds a key with no roles on any Meritr contract, pays
 * the gas to send 0.1 CTC.
 *
 * Creditcoin's own testnet faucet is a Discord bot, so without this a reviewer must join a
 * server and talk to a bot before they can sign a single thing here.
 */
function GasFaucet({ onDone }: { onDone: () => void }) {
  const { account, getSigner } = useWallet();
  const [state, setState] = useState<FaucetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let dead = false;
    api.faucet(account).then((s) => !dead && setState(s)).catch(() => {});
    return () => { dead = true; };
  }, [account]);

  const claim = async () => {
    if (!account) return;
    setBusy(true); setMsg(null); setHash(null);
    try {
      const signer = await getSigner();
      const issuedAt = Math.floor(Date.now() / 1000);
      // Must match backend/faucet.py:message_for byte for byte.
      const text =
        `Meritr testnet faucet\n` +
        `Address: ${account}\n` +
        `Issued: ${issuedAt}\n\n` +
        `Signing this proves you control this address. It is not a transaction, ` +
        `costs no gas, and moves nothing.`;
      const signature = await signer.signMessage(text);
      const res = await api.faucetClaim({ address: account, issuedAt, signature });
      setHash(res.txHash);
      setMsg(`Sent ${res.amountCtc} CTC. It may take a few seconds to appear.`);
      setTimeout(onDone, 4000);
    } catch (e: any) {
      setMsg(e?.shortMessage ?? e?.message ?? "The faucet could not serve that request.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = state && state.available === false;

  return (
    <div className="mb-4 rounded-[var(--radius-panel)] border border-warn/40 bg-warn/10 p-4">
      <p className="text-[14px] font-semibold text-warn">
        This wallet holds no CTC, so it cannot pay gas.
      </p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#b8bfcd]">
        Everything on this console is readable without gas - the positions, the proven credit
        facts and the agent&apos;s reasoning are all public. Only signing needs CTC, and
        Creditcoin testnet has no web faucet of its own.
      </p>

      {!blocked && (
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="mt-3 rounded bg-warn px-3.5 py-2 font-mono text-[12px] font-bold text-ink-950 transition hover:bg-warn/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Sending…" : "Request 0.1 CTC"}
        </button>
      )}

      <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-[#8b93a5]">
        You sign a message, not a transaction - it costs nothing. One claim per address every 24
        hours, for wallets holding under 0.1 CTC.
      </p>

      {msg && <p className="mt-2 text-[12.5px] text-[#d5d9e2]">{msg}</p>}
      {hash && (
        <a
          href={`${EXPLORER}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="mono mt-1 block text-[11px] text-model hover:underline"
        >
          {hash.slice(0, 22)}… ↗
        </a>
      )}
      {blocked && (
        <a
          href="https://docs.creditcoin.org/wallets/using-testnet-faucet"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block font-mono text-[12px] text-model hover:underline"
        >
          Get CTC from the Creditcoin Discord faucet →
        </a>
      )}
    </div>
  );
}

/* ── Faucet ─────────────────────────────────────────────────────────────── */

function FaucetPanel({
  config,
  bal,
  aDec,
  cDec,
  onDone,
}: {
  config: MeritrConfig;
  bal: Balances | null;
  aDec: number;
  cDec: number;
  onDone: () => void;
}) {
  const { account, getSigner } = useWallet();
  const tx = useTx();

  const mint = (label: string, token: string, decimals: number, amount: string, symbol: string) =>
    tx.run({
      title: `Mint ${Number(amount).toLocaleString()} ${symbol}`,
      description:
        "These are Meritr's own demo tokens, not a Creditcoin asset. Their mint is open to " +
        "anyone so the flows can be tried without asking for funds - they carry no value.",
      facts: [
        ["Token", `${symbol} · ${token.slice(0, 10)}…`],
        ["Amount", `${Number(amount).toLocaleString()} ${symbol}`],
        ["To", account ? `${account.slice(0, 10)}…${account.slice(-4)}` : "-"],
      ],
      steps: [
        {
          label: `Mint ${symbol}`,
          run: async () => {
            const signer = await getSigner();
            const t = erc20(token, signer);
            const sent = await t.mint(account, toUnits(amount, decimals));
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: () => onDone(),
    });

  return (
    <Card
      title="Demo tokens"
      subtitle="The vault's asset and collateral are demo ERC-20s with an open mint, so anyone can try the flows without asking for tokens."
    >
      <div className="grid grid-cols-2 gap-3 rounded border border-[var(--color-line)] bg-ink-950 px-3 py-2.5">
        <div>
          <p className="mono text-[14px] text-gray-100">
            {bal ? fromUnits(bal.asset, aDec, 2) : "-"}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            {bal?.assetSymbol ?? "asset"}
          </p>
        </div>
        <div>
          <p className="mono text-[14px] text-gray-100">
            {bal ? fromUnits(bal.collateral, cDec, 4) : "-"}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
            {bal?.collateralSymbol ?? "collateral"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => mint("asset", config.contracts.asset, aDec, "50000", bal?.assetSymbol ?? "")}
        >
          + 50,000 {bal?.assetSymbol ?? ""}
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() =>
            mint("collateral", config.contracts.collateral, cDec, "25", bal?.collateralSymbol ?? "")
          }
        >
          + 25 {bal?.collateralSymbol ?? ""}
        </button>
      </div>
    </Card>
  );
}

/* ── Lend ───────────────────────────────────────────────────────────────── */

function LendPanel({
  config,
  bal,
  aDec,
  onDone,
}: {
  config: MeritrConfig;
  bal: Balances | null;
  aDec: number;
  onDone: () => void;
}) {
  const { getSigner } = useWallet();
  const tx = useTx();
  const [supply, setSupply] = useState("");
  const [reserve, setReserve] = useState("");
  const sym = bal?.assetSymbol ?? "";

  const supplyFlow = (fn: "deposit" | "fundReserve", amount: string) => {
    const amt = toUnits(amount, aDec);
    if (amt === 0n) return;
    tx.run({
      title: fn === "deposit" ? `Deposit ${amount} ${sym}` : `Fund the reserve with ${amount} ${sym}`,
      description:
        fn === "deposit"
          ? "Supplies liquidity to the vault. You receive shares and earn interest paid by borrowers; the shares can be redeemed while the pool holds idle liquidity."
          : "Capitalises the restructuring reserve. This is not lender equity and cannot be withdrawn - it is the buffer that retires debt for distressed borrowers.",
      facts: [
        ["Amount", `${Number(amount).toLocaleString()} ${sym}`],
        ["Vault", `${config.contracts.MeritrVault.slice(0, 12)}…`],
        ["Network", `${config.network} (${config.chainId})`],
      ],
      steps: [
        {
          label: `Approve ${sym} for the vault`,
          detail: "Exact amount only - never an unlimited allowance.",
          run: async () =>
            ensureAllowance(config.contracts.asset, config.contracts.MeritrVault, amt, await getSigner()),
        },
        {
          label: fn === "deposit" ? "Deposit into the vault" : "Transfer into the reserve",
          run: async () => {
            const v = vaultAt(config.contracts.MeritrVault, await getSigner());
            const sent = fn === "deposit" ? await v.deposit(amt) : await v.fundReserve(amt);
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: (ok) => {
        if (ok) fn === "deposit" ? setSupply("") : setReserve("");
        onDone();
      },
    });
  };

  const withdrawAll = () =>
    tx.run({
      title: "Withdraw your full position",
      description:
        "Redeems all your shares for the underlying asset, including accrued interest. Limited by the liquidity currently idle in the pool.",
      facts: [["Shares", bal ? fromUnits(bal.shares, aDec, 4) : "-"]],
      steps: [
        {
          label: "Redeem shares",
          run: async () => {
            const signer = await getSigner();
            const v = vaultAt(config.contracts.MeritrVault, signer);
            const shares = await v.sharesOf(await signer.getAddress());
            if (shares === 0n) throw new Error("No shares to withdraw");
            const sent = await v.withdraw(shares);
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: () => onDone(),
    });

  return (
    <Card
      title="Supply liquidity"
      subtitle="Deposits earn interest from borrowers. Funding the reserve instead capitalises the buffer that pays for restructuring - it is never counted as lender equity."
    >
      <AmountField
        label="deposit"
        value={supply}
        onChange={setSupply}
        suffix={bal?.assetSymbol}
        max={bal ? fromUnits(bal.asset, aDec, 2) : undefined}
        onMax={() => bal && setSupply(fromUnits(bal.asset, aDec, 6).replace(/,/g, ""))}
      />
      <button
        type="button"
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!supply}
        onClick={() => supplyFlow("deposit", supply)}
      >
        Deposit
      </button>

      <div className="!mt-4 border-t border-[var(--color-line)] pt-3">
        <AmountField
          label="fund the restructuring reserve"
          value={reserve}
          onChange={setReserve}
          suffix={bal?.assetSymbol}
          hint="open to anyone - grants, DAOs, sponsors"
        />
        <button
          type="button"
          className="btn-ghost mt-2 w-full disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!reserve}
          onClick={() => supplyFlow("fundReserve", reserve)}
        >
          Fund reserve
        </button>
      </div>

      {bal && bal.shares > 0n && (
        <div className="!mt-4 border-t border-[var(--color-line)] pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-gray-600">
            your position - {fromUnits(bal.shares, aDec, 4)} shares
          </p>
          <button type="button" className="btn-ghost w-full" onClick={withdrawAll}>
            Withdraw all
          </button>
        </div>
      )}
    </Card>
  );
}

/* ── Borrow ─────────────────────────────────────────────────────────────── */

function BorrowPanel({
  config,
  bal,
  aDec,
  cDec,
  onDone,
}: {
  config: MeritrConfig;
  bal: Balances | null;
  aDec: number;
  cDec: number;
  onDone: () => void;
}) {
  const { account, getSigner } = useWallet();
  const tx = useTx();
  const [coll, setColl] = useState("");
  const [draw, setDraw] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const aSym = bal?.assetSymbol ?? "";
  const cSym = bal?.collateralSymbol ?? "";

  const open = () => {
    const c = toUnits(coll, cDec);
    const d = toUnits(draw, aDec);
    if (c === 0n || d === 0n) return;
    tx.run({
      title: `Open a credit line for ${draw} ${aSym}`,
      description:
        "Locks your collateral and draws against it. The rate and the borrowing cap are not set " +
        "by governance - they are computed onchain from the credit history this address has " +
        "proven through Attestcoin.",
      facts: [
        ["Collateral posted", `${coll} ${cSym}`],
        ["Drawing", `${Number(draw).toLocaleString()} ${aSym}`],
        ["Your score", bal ? String(bal.score) : "-"],
        ["Rate you earned", bal ? pct(bal.rateBps) : "-"],
        ["LTV cap", bal ? pct(bal.maxLtvBps) : "-"],
      ],
      steps: [
        {
          label: `Approve ${cSym} for the vault`,
          detail: "Exact amount only - never an unlimited allowance.",
          run: async () =>
            ensureAllowance(config.contracts.collateral, config.contracts.MeritrVault, c, await getSigner()),
        },
        {
          label: "Post collateral and draw",
          run: async () => {
            const v = vaultAt(config.contracts.MeritrVault, await getSigner());
            const sent = await v.openLoan(c, d);
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: (ok) => {
        if (ok) { setColl(""); setDraw(""); }
        onDone();
      },
    });
  };

  const repay = () => {
    const amt = toUnits(repayAmt, aDec);
    if (amt === 0n) return;
    tx.run({
      title: `Repay ${repayAmt} ${aSym}`,
      description:
        "Repays interest first, then principal. Clearing the balance in full closes the loan and " +
        "releases all of your collateral in the same transaction.",
      facts: [
        ["Repaying", `${Number(repayAmt).toLocaleString()} ${aSym}`],
        ["Outstanding", bal ? `${fromUnits(bal.debt, aDec, 2)} ${aSym}` : "-"],
      ],
      steps: [
        {
          label: `Approve ${aSym} for the vault`,
          run: async () =>
            ensureAllowance(config.contracts.asset, config.contracts.MeritrVault, amt, await getSigner()),
        },
        {
          label: "Repay",
          run: async () => {
            const v = vaultAt(config.contracts.MeritrVault, await getSigner());
            const sent = await v.repay(amt);
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: (ok) => { if (ok) setRepayAmt(""); onDone(); },
    });
  };

  const mintPassport = () =>
    tx.run({
      title: "Mint your credit passport",
      description:
        "Issues a soulbound ERC-721 carrying your cross-chain credit memory. It cannot be " +
        "transferred or sold - a tradeable credit score would just be farmed on a clean wallet " +
        "and sold to a defaulter. Requires at least one Attestcoin-verified proof for this address.",
      facts: [
        ["Holder", account ? `${account.slice(0, 10)}…${account.slice(-4)}` : "-"],
        ["Score", bal ? String(bal.score) : "-"],
        ["Passport", `${config.contracts.MeritrPassport.slice(0, 12)}…`],
      ],
      steps: [
        {
          label: "Mint passport",
          run: async () => {
            const p = passportAt(config.contracts.MeritrPassport, await getSigner());
            const sent = await p.mint();
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: () => onDone(),
    });

  const hasDebt = bal ? bal.debt > 0n : false;

  return (
    <Card
      title="Borrow"
      subtitle="Your rate and borrowing capacity come from your Attestcoin-verified credit score - not from a governance parameter."
    >
      {bal && (
        <div className="grid grid-cols-3 gap-3 rounded border border-[var(--color-line)] bg-ink-950 px-3 py-2.5">
          <div>
            <p className="mono text-[14px] text-gray-100">{bal.score}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">score</p>
          </div>
          <div>
            <p className="mono text-[14px] text-up">{pct(bal.rateBps)}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">your apr</p>
          </div>
          <div>
            <p className="mono text-[14px] text-gray-100">{pct(bal.maxLtvBps)}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">max ltv</p>
          </div>
        </div>
      )}

      {!hasDebt ? (
        <>
          <AmountField
            label="collateral to post"
            value={coll}
            onChange={setColl}
            suffix={bal?.collateralSymbol}
            max={bal ? fromUnits(bal.collateral, cDec, 4) : undefined}
            onMax={() => bal && setColl(fromUnits(bal.collateral, cDec, 8).replace(/,/g, ""))}
          />
          <AmountField
            label="amount to draw"
            value={draw}
            onChange={setDraw}
            suffix={bal?.assetSymbol}
            hint={bal ? `capped at ${pct(bal.maxLtvBps)} of collateral value` : undefined}
          />
          <button
            type="button"
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!coll || !draw}
            onClick={open}
          >
            Open credit line
          </button>
        </>
      ) : (
        <>
          <div className="rounded border border-[var(--color-line)] bg-ink-950 px-3 py-2.5">
            <p className="mono text-[15px] text-gray-100">
              {fromUnits(bal!.debt, aDec, 2)} {bal?.assetSymbol}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
              outstanding debt
            </p>
          </div>
          <AmountField
            label="repay"
            value={repayAmt}
            onChange={setRepayAmt}
            suffix={bal?.assetSymbol}
            max={fromUnits(bal!.debt, aDec, 2)}
            onMax={() => setRepayAmt(fromUnits(bal!.debt, aDec, 8).replace(/,/g, ""))}
          />
          <button
            type="button"
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!repayAmt}
            onClick={repay}
          >
            Repay
          </button>
        </>
      )}

      {bal && !bal.hasPassport && (
        <div className="!mt-4 border-t border-[var(--color-line)] pt-3">
          <p className="mb-2 font-mono text-[10px] leading-relaxed text-gray-600">
            a soulbound passport requires at least one Attestcoin-verified proof for this address
          </p>
          <button type="button" className="btn-ghost w-full" onClick={mintPassport}>
            Mint credit passport
          </button>
        </div>
      )}
    </Card>
  );
}

/* ── Keeper ─────────────────────────────────────────────────────────────── */

function KeeperPanel({
  config,
  aDec,
  onDone,
}: {
  config: MeritrConfig;
  aDec: number;
  onDone: () => void;
}) {
  const { getSigner } = useWallet();
  const tx = useTx();
  const [target, setTarget] = useState("");
  const [liqAmt, setLiqAmt] = useState("");

  const valid = /^0x[0-9a-fA-F]{40}$/.test(target.trim());
  const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`;

  const call = (fn: "flagStress" | "restructure") =>
    tx.run({
      title: fn === "flagStress" ? "Flag a stressed position" : "Restructure a position",
      description:
        fn === "flagStress"
          ? "Records that this position has entered the stress band, which starts the six-hour clock after which anyone - not only the agent - may restructure it."
          : "Cuts the rate toward what this borrower has earned, extends the term, and retires debt from the reserve until the position is healthy. You supply only an address: every amount is recomputed onchain, so you cannot influence the terms.",
      facts: [
        ["Borrower", valid ? short(target.trim()) : "-"],
        ["Caller", "you"],
        ["Vault", `${config.contracts.MeritrVault.slice(0, 12)}…`],
      ],
      steps: [
        {
          label: fn === "flagStress" ? "Flag stress" : "Restructure",
          run: async () => {
            const v = vaultAt(config.contracts.MeritrVault, await getSigner());
            const sent =
              fn === "flagStress" ? await v.flagStress(target.trim()) : await v.restructure(target.trim());
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: () => onDone(),
    });

  const liquidate = () => {
    const amt = toUnits(liqAmt, aDec);
    if (amt === 0n) return;
    tx.run({
      title: "Liquidate a position",
      description:
        "Repays part of a borrower's debt and seizes collateral plus a 5% bonus. Only possible below a health factor of 1.00. Any collateral left over after the seizure is returned to the borrower.",
      facts: [
        ["Borrower", valid ? short(target.trim()) : "-"],
        ["Repaying", `${Number(liqAmt).toLocaleString()}`],
      ],
      steps: [
        {
          label: "Approve the repayment",
          run: async () =>
            ensureAllowance(config.contracts.asset, config.contracts.MeritrVault, amt, await getSigner()),
        },
        {
          label: "Liquidate",
          run: async () => {
            const v = vaultAt(config.contracts.MeritrVault, await getSigner());
            const sent = await v.liquidate(target.trim(), amt);
            await sent.wait();
            return sent.hash as string;
          },
        },
      ],
      onSettled: (ok) => { if (ok) setLiqAmt(""); onDone(); },
    });
  };

  return (
    <Card
      title="Keeper"
      subtitle="Restructuring is permissionless six hours after a position is flagged, so borrower protection never depends on the agent staying online. You can trigger the mechanism yourself."
    >
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-wider text-gray-600">borrower</span>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="0x…"
          className="mono mt-1 w-full rounded border border-[var(--color-line)] bg-ink-950 px-3 py-2 text-[12.5px] text-gray-100 outline-none placeholder:text-gray-700 focus:border-gray-600"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="btn-ghost w-full disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!valid}
          onClick={() => call("flagStress")}
        >
          Flag stress
        </button>
        <button
          type="button"
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!valid}
          onClick={() => call("restructure")}
        >
          Restructure
        </button>
      </div>

      <div className="!mt-4 border-t border-[var(--color-line)] pt-3">
        <AmountField
          label="liquidate - repay amount"
          value={liqAmt}
          onChange={setLiqAmt}
          hint="only possible below a health factor of 1.00"
        />
        <button
          type="button"
          className="mt-2 w-full rounded border border-down/40 bg-down/10 px-5 py-2.5 font-mono text-sm text-down transition hover:bg-down/20 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!valid || !liqAmt}
          onClick={liquidate}
        >
          Liquidate
        </button>
      </div>
    </Card>
  );
}
