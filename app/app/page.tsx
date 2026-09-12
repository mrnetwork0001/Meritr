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
import { pct, usd } from "../lib/format";
import { AppRail, type ViewId } from "../components/AppRail";
import { ProtocolPanel } from "../components/ProtocolPanel";
import { PortfolioTable } from "../components/PortfolioTable";
import { BorrowerPanel } from "../components/BorrowerPanel";
import { AgentFeed } from "../components/AgentFeed";
import { AttestationFlow } from "../components/AttestationFlow";
import { ActionPanels } from "../components/actions/ActionPanels";
import { ConnectButton } from "../components/ConnectButton";

const REFRESH_MS = 12_000;

const HEADINGS: Record<ViewId, { title: string; lede: string }> = {
  overview: {
    title: "Overview",
    lede: "Pool state and the live risk book. Positions the agent intends to act on are pinned to the top, with the reasoning for the one it chose first.",
  },
  positions: {
    title: "Positions",
    lede: "Per-borrower credit memory and loan state. Every figure derives from a transaction proven through the Attestcoin precompile.",
  },
  actions: {
    title: "Actions",
    lede: "Supply liquidity, open a credit line priced by your own attested history, repay, or trigger the restructuring mechanism yourself. Everything else in this console stays readable with no wallet attached.",
  },
  attestations: {
    title: "Attestations",
    lede: "How source-chain history reaches Creditcoin, and which protocols the attestor is currently configured to read.",
  },
  interventions: {
    title: "Interventions",
    lede: "Every restructuring the protocol has performed, read straight from LoanRestructured logs so it cannot drift from what happened.",
  },
  model: {
    title: "Model",
    lede: "The scoring components and the pricing curve they feed. Deterministic and public — same facts in, same terms out, on-chain and off.",
  },
};

export default function Console() {
  const [view, setView] = useState<ViewId>("overview");
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

  /** Selecting a borrower anywhere jumps to the position view. */
  const openBorrower = (addr: string) => {
    setSelected(addr);
    setView("positions");
  };

  const heading = HEADINGS[view];

  return (
    <AppRail
      view={view}
      onView={setView}
      health={health}
      stats={stats}
      expectedChainId={config?.chainId ?? null}
    >
      <main id="main" className="mx-auto max-w-app px-4 py-8 sm:px-6">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-100">{heading.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-400">{heading.lede}</p>
          </div>
          <div className="flex flex-wrap items-end gap-5">
            <ConnectButton expectedChainId={config?.chainId ?? null} compact />
          {portfolio && (
            <div className="flex gap-6">
              <div className="text-right">
                <p className="mono text-[17px] font-semibold text-gray-100">
                  {portfolio.actionQueue.length}
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-wider text-gray-600">queued</p>
              </div>
              <div className="text-right">
                <p className="mono text-[17px] font-semibold text-up">
                  {usd(portfolio.totalLossAvertableUsd)}
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-wider text-gray-600">avertable</p>
              </div>
            </div>
          )}
          </div>
        </header>

        {apiError && (
          <div className="mb-6 rounded-lg border border-down/30 bg-down/[0.06] p-5">
            <p className="text-[13px] font-semibold text-down">Risk API unavailable</p>
            <p className="mt-1.5 font-mono text-[11.5px] text-gray-400">{apiError}</p>
            <pre className="scroll-x mt-3 rounded border border-[var(--color-line)] bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-gray-400">
{`npx hardhat node                                        # terminal 1
npx hardhat run scripts/deploy.js --network localhost    # terminal 2
npx hardhat run scripts/seedLocal.js --network localhost
MERITR_NETWORK=localhost npm run backend                 # terminal 3`}
            </pre>
          </div>
        )}

        {view === "overview" && (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <ProtocolPanel stats={stats} health={health} />
              <PortfolioTable
                positions={portfolio?.positions ?? []}
                actionQueue={portfolio?.actionQueue ?? []}
                onSelect={openBorrower}
                selected={selected}
              />
            </div>
            <div className="space-y-4 lg:col-span-5">
              <AttestationFlow config={config} />
              <AgentFeed events={events.slice(0, 3)} />
            </div>
          </div>
        )}

        {view === "positions" && (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <PortfolioTable
                positions={portfolio?.positions ?? []}
                actionQueue={portfolio?.actionQueue ?? []}
                onSelect={setSelected}
                selected={selected}
              />
            </div>
            <div className="lg:col-span-7">
              <BorrowerPanel address={selected} />
            </div>
          </div>
        )}

        {view === "actions" && <ActionPanels config={config} />}

        {view === "attestations" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <AttestationFlow config={config} />
            <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
              <div className="border-b border-[var(--color-line)] px-5 py-3">
                <h2 className="text-[13px] font-semibold text-gray-200">Deployment</h2>
              </div>
              <ul className="divide-y divide-[var(--color-line)] text-[12px]">
                {[
                  ["network", config?.network ?? "—"],
                  ["chain id", config ? String(config.chainId) : "—"],
                  ["attestcoin precompile", config?.attestcoinPrecompile ?? "—"],
                  ["MeritrAttestor", config?.contracts.MeritrAttestor ?? "—"],
                  ["MeritrVault", config?.contracts.MeritrVault ?? "—"],
                  ["MeritrPassport", config?.contracts.MeritrPassport ?? "—"],
                ].map(([k, v]) => (
                  <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5">
                    <span className="text-gray-500">{k}</span>
                    <span className="mono break-all text-[11.5px] text-gray-300">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {view === "interventions" && (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <AgentFeed events={events} />
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
                <div className="border-b border-[var(--color-line)] px-5 py-3">
                  <h2 className="text-[13px] font-semibold text-gray-200">Guardrails</h2>
                </div>
                <ul className="divide-y divide-[var(--color-line)] text-[12px]">
                  {[
                    ["stress band", "1.00 – 1.15", "the only window the agent may act in"],
                    ["target", "1.35", "health restored to here, not to the edge"],
                    ["max per loan", "3", "forbearance cannot run forever"],
                    ["cooldown", "12 hours", "no draining via rapid re-triggering"],
                    ["reserve draw", "25% max", "one borrower cannot exhaust the reserve"],
                    ["agent grace", "6 hours", "after which anyone may restructure"],
                  ].map(([k, v, why]) => (
                    <li key={k} className="px-5 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-gray-400">{k}</span>
                        <span className="mono text-[12px] text-model">{v}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-600">{why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {view === "model" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
              <div className="border-b border-[var(--color-line)] px-5 py-3">
                <h2 className="text-[13px] font-semibold text-gray-200">Score components</h2>
              </div>
              <ul className="divide-y divide-[var(--color-line)] text-[12.5px]">
                {[
                  ["Repayment history", "35%", "$250k / 40 events"],
                  ["Cross-chain collateral", "25%", "$150k supplied"],
                  ["Wallet maturity", "15%", "730 days"],
                  ["Chain diversity", "10%", "4 chains"],
                  ["Liquidation safety", "15%", "−30% compounding"],
                ].map(([a, b, c]) => (
                  <li key={a} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5">
                    <span className="flex-1 text-gray-300">{a}</span>
                    <span className="mono w-12 text-[12px] text-model">{b}</span>
                    <span className="w-[8.5rem] text-right font-mono text-[11px] text-gray-600">{c}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-[var(--color-line)] px-5 py-3 font-mono text-[10.5px] leading-relaxed text-gray-600">
                a wallet with zero proofs scores exactly 300 — safety is withheld until something
                is proven, because no evidence is not proven safety
              </p>
            </div>

            <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
              <div className="border-b border-[var(--color-line)] px-5 py-3">
                <h2 className="text-[13px] font-semibold text-gray-200">What a score buys</h2>
              </div>
              <ul className="divide-y divide-[var(--color-line)] text-[12.5px]">
                {[300, 450, 600, 750, 900].map((s) => {
                  const apr = 2400 - ((2400 - 400) * (s - 300)) / 600;
                  const ltv = 3000 + ((8000 - 3000) * (s - 300)) / 600;
                  const here = portfolio?.positions.some(
                    (p) => Math.abs(p.score - s) < 75
                  );
                  return (
                    <li
                      key={s}
                      className={`flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 ${here ? "bg-model/[0.08]" : ""}`}
                    >
                      <span className={`mono w-[4.5rem] ${here ? "font-bold text-model" : "text-gray-300"}`}>
                        {s}
                      </span>
                      <span className="mono w-[5.5rem] text-[12px] text-gray-300">{pct(apr)}</span>
                      <span className="mono w-[5rem] text-[12px] text-gray-400">{pct(ltv)}</span>
                      <span className="text-[11px] text-gray-600">
                        {s === 300 ? "nothing proven" : s === 900 ? "fully saturated" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-[var(--color-line)] px-5 py-3 font-mono text-[10.5px] leading-relaxed text-gray-600">
                168 vectors generated from the deployed library assert the Python agent reproduces
                this curve exactly — integer truncation included
              </p>
            </div>
          </div>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-6 font-mono text-[10.5px] text-gray-600">
          <p>
            meritr · apache 2.0 · buidl ctc 2026
            {config && <> · {config.network} (chain {config.chainId})</>}
          </p>
          <Link href="/" className="transition hover:text-model">
            ← back to meritr.xyz
          </Link>
        </footer>
      </main>
    </AppRail>
  );
}
