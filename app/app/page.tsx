"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Health,
  type MeritrConfig,
  type Portfolio,
  type ProtocolStats,
  type RestructureEvent,
} from "../lib/api";
import { usd } from "../lib/format";
import { ProtocolPanel } from "../components/ProtocolPanel";
import { PortfolioTable } from "../components/PortfolioTable";
import { BorrowerPanel } from "../components/BorrowerPanel";
import { AgentFeed } from "../components/AgentFeed";
import { AttestationFlow } from "../components/AttestationFlow";

const REFRESH_MS = 12_000;

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<MeritrConfig | null>(null);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [events, setEvents] = useState<RestructureEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
      if (h.status !== "ok") {
        setApiError(h.error ?? "The risk API is not connected to a deployment.");
        return;
      }
      setApiError(null);

      const [cfg, st, pf, rs] = await Promise.all([
        api.config(),
        api.protocol(),
        api.portfolio(),
        api.restructurings(),
      ]);
      setConfig(cfg);
      setStats(st);
      setPortfolio(pf);
      setEvents(rs.events);

      // Land on whatever the agent is most concerned about, so the demo opens on the story.
      setSelected((cur) => cur ?? pf.actionQueue[0] ?? pf.positions[0]?.borrower ?? null);
    } catch (e: any) {
      setApiError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 group">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-credit font-mono text-sm font-bold text-ink-900">
                M
              </span>
              <h1 className="text-2xl font-semibold tracking-tight text-mist-100 group-hover:text-white transition-colors">
                Meritr
              </h1>
            </Link>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-400">
              Autonomous DeAI debt restructuring and cross-chain credit risk memory, built natively
              on Creditcoin. Credit is scored only from transactions proven through the Attestcoin
              native query verifier precompile — and stressed loans are restructured before they
              can be liquidated.
            </p>
          </div>

          {portfolio && (
            <div className="flex gap-6">
              <div className="text-right">
                <p className="label">Debt at risk</p>
                <p className="stat mt-1">{usd(portfolio.totalDebtAtRiskUsd)}</p>
              </div>
              <div className="text-right">
                <p className="label">Loss avertable</p>
                <p className="stat mt-1 text-healthy">
                  {usd(portfolio.totalLossAvertableUsd)}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {apiError && (
        <div className="card card-pad mb-6 border-watch/30 bg-watch/[0.06]">
          <p className="text-sm font-medium text-watch">Risk API unavailable</p>
          <p className="mt-1.5 text-xs text-mist-400">{apiError}</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-900/60 p-3 text-[11px] text-mist-400">
{`npx hardhat node                                        # terminal 1
npx hardhat run scripts/deploy.js --network localhost    # terminal 2
npx hardhat run scripts/seedLocal.js --network localhost
MERITR_NETWORK=localhost npm run backend                 # terminal 3`}
          </pre>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <ProtocolPanel stats={stats} health={health} />
          <PortfolioTable
            positions={portfolio?.positions ?? []}
            actionQueue={portfolio?.actionQueue ?? []}
            onSelect={setSelected}
            selected={selected}
          />
          <BorrowerPanel address={selected} />
        </div>

        <div className="space-y-4 lg:col-span-5">
          <AttestationFlow config={config} />
          <AgentFeed events={events} />
        </div>
      </div>

      <footer className="mt-10 border-t border-ink-600 pt-6 text-[11px] text-mist-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            Meritr · Apache 2.0 · BUIDL CTC 2026 Fall Hackathon
            {config && <> · {config.network} (chain {config.chainId})</>}
          </p>
          {config && (
            <p className="font-mono">
              Vault {config.contracts.MeritrVault?.slice(0, 10)}… · Attestcoin{" "}
              {config.attestcoinPrecompile.slice(0, 10)}…
            </p>
          )}
        </div>
      </footer>
    </main>
  );
}
