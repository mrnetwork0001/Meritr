"use client";

import { Power, Wallet } from "lucide-react";
import { useWallet } from "../lib/wallet";
import { chainName, CHAINS } from "../lib/chains";
import { short } from "../lib/format";

/**
 * Connect / network control.
 *
 * Creditcoin ships in no wallet by default, so "connected" is not sufficient — the button walks
 * the reader all the way to the right chain, adding the network when the wallet has never heard
 * of it. Anything short of that leaves a judge stuck on Ethereum wondering why nothing works.
 */
export function ConnectButton({
  expectedChainId,
  compact = false,
}: {
  expectedChainId: number | null;
  compact?: boolean;
}) {
  const { available, account, chainId, connecting, error, connect, disconnect, ensureChain } =
    useWallet();

  // Detection has not run yet: render a neutral placeholder rather than a wrong answer.
  if (available === null) {
    return <span className="btn-ghost cursor-default opacity-40">Wallet…</span>;
  }

  if (!available) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="btn-ghost"
        title="No injected wallet detected"
      >
        <Wallet size={15} aria-hidden className="mr-1.5 inline" />
        Get a wallet
      </a>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={connect} disabled={connecting} className="btn-primary">
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <span className="font-mono text-[10px] text-down">{error.slice(0, 70)}</span>}
      </div>
    );
  }

  const wrongChain = expectedChainId !== null && chainId !== expectedChainId;

  if (wrongChain) {
    const target = CHAINS[expectedChainId!];
    return (
      <button
        type="button"
        onClick={() => ensureChain(expectedChainId!)}
        className="rounded border border-down/40 bg-down/10 px-3 py-2 font-mono text-[12px] font-semibold text-down transition hover:bg-down/20"
        title={`Connected to ${chainName(chainId)} — Meritr is deployed on ${target?.name ?? expectedChainId}`}
      >
        Switch to {target?.name ?? `chain ${expectedChainId}`}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded border border-[var(--color-line)] bg-ink-900 px-3 py-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-up" aria-hidden />
      <span className="mono text-[12px] text-gray-200">{short(account)}</span>
      {!compact && (
        <span className="font-mono text-[10px] text-gray-600">{chainName(chainId)}</span>
      )}
      <button
        type="button"
        onClick={disconnect}
        aria-label="Disconnect"
        title="Forget this account"
        className="shrink-0 rounded p-0.5 text-gray-600 transition hover:bg-ink-800 hover:text-down"
      >
        <Power size={13} aria-hidden />
      </button>
    </div>
  );
}
