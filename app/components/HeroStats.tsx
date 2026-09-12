"use client";

import { useEffect, useState } from "react";
import { api, type RestructureEvent } from "../lib/api";

/**
 * The outcome strip, read from the vault's own record of every intervention.
 *
 * The evidence section further down counts what Attestcoin has *proven*. This counts what the
 * agent then *did* with it, because the provenance numbers do not by themselves say that a
 * distressed borrower kept their collateral - and that is the claim the protocol exists to make.
 *
 * "0 collateral seized" is structural rather than lucky: `restructure` has no path that moves
 * COLLATERAL at all. Seizure lives only in the liquidation backstop.
 */

const FALLBACK: RestructureEvent[] = [
  { hfBefore: 1.07, hfAfter: 1.35, debtRetiredUsd: 1722.48 } as RestructureEvent,
  { hfBefore: 1.07, hfAfter: 1.35, debtRetiredUsd: 717.7 } as RestructureEvent,
];

const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;

export function HeroStats() {
  const [events, setEvents] = useState<RestructureEvent[] | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let dead = false;
    const tick = async () => {
      try {
        const r = await api.restructurings();
        if (dead) return;
        setEvents(r.events);
        setLive(true);
      } catch {
        if (!dead) setEvents((e) => e ?? FALLBACK);
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  const ev = events ?? FALLBACK;
  const retired = ev.reduce((s, e) => s + (e.debtRetiredUsd ?? 0), 0);
  const latest = ev[0];

  const cells: Array<[string, string, string]> = [
    [String(ev.length), "autonomous interventions", "text-[#f2f4f8]"],
    [usd(retired), "debt retired for borrowers", "text-[#f2f4f8]"],
    [latest ? `${latest.hfBefore} → ${latest.hfAfter}` : "-", "health factor restored", "text-up"],
    ["0", "collateral seized", "text-up"],
  ];

  return (
    <div className="wrap py-5">
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map(([n, l, tone], i) => (
          <div key={l} style={{ ["--n" as string]: i }}>
            <div className="panel panel-hover h-full px-3 py-3.5 text-center">
              <p className={`mono text-[18px] font-semibold leading-none ${tone}`}>{n}</p>
              <p className="eyebrow mt-1.5 text-[8.5px]">{l}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mono mt-2.5 text-center text-[10px] text-[#5d6474]">
        {live ? (
          <>
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-up align-middle anim-breathe" />
            read live from the vault - the agent chose whom, the chain computed how much
          </>
        ) : (
          "last verified record - start the risk API for the live figure"
        )}
      </p>
    </div>
  );
}
