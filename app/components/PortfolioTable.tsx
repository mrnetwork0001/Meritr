"use client";

import type { Assessment } from "../lib/api";
import { band, bandColor, bandLabel, pct, short, usd } from "../lib/format";

/**
 * The agent's working set, ordered the way it actually works the queue.
 *
 * Positions the agent intends to act on are pinned to the top and carry their rationale, so the
 * dashboard shows not just what an autonomous system will do but why it picked that target
 * first — the only part of such a system a reviewer can meaningfully audit at a glance.
 */
export function PortfolioTable({
  positions,
  actionQueue,
  onSelect,
  selected,
}: {
  positions: Assessment[];
  actionQueue: string[];
  onSelect: (addr: string) => void;
  selected: string | null;
}) {
  const rank = (a: Assessment) => {
    const q = actionQueue.indexOf(a.borrower);
    if (q >= 0) return q;
    return { liquidatable: 100, stressed: 200, watch: 300, healthy: 400, no_loan: 500 }[a.state] ?? 900;
  };
  const sorted = [...positions].sort((x, y) => rank(x) - rank(y));
  const lead = sorted.find((p) => p.borrower === actionQueue[0]);

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] px-5 py-3">
        <h2 className="text-[13px] font-semibold text-gray-200">Risk book</h2>
        <span className="font-mono text-[10.5px] text-gray-600">
          {positions.length} position{positions.length === 1 ? "" : "s"} · {actionQueue.length} queued
        </span>
      </div>

      {positions.length === 0 ? (
        <p className="px-5 py-10 text-center font-mono text-[11px] text-gray-600">
          no loans opened yet
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {sorted.map((p) => {
            const b = band(p.healthFactor);
            const color = bandColor[b];
            const queued = actionQueue.includes(p.borrower);
            const sel = selected === p.borrower;
            return (
              <li key={p.borrower}>
                <button
                  onClick={() => onSelect(p.borrower)}
                  className={`w-full px-5 py-3 text-left transition ${sel ? "bg-ink-800" : "hover:bg-ink-800/60"}`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="mono w-[6.5rem] shrink-0 text-[12px] text-gray-400">
                      {short(p.borrower)}
                    </span>
                    <span className="mono w-[4.5rem] shrink-0 text-[13px] font-semibold" style={{ color }}>
                      {p.healthFactor === null ? "∞" : p.healthFactor.toFixed(3)}
                    </span>
                    <span className="mono w-[5.5rem] shrink-0 text-[12px] text-gray-300">
                      {p.score}
                      <span className="ml-1 text-[10.5px] text-gray-600">{p.tier}</span>
                    </span>
                    <span className="mono w-[5rem] shrink-0 text-[12px] text-gray-400">{usd(p.debtUsd)}</span>
                    <span className="mono w-[4rem] shrink-0 text-[11.5px] text-gray-500">{pct(p.rateBps)}</span>
                    {queued ? (
                      <span className="rounded border border-model/40 bg-model/[0.08] px-2 py-0.5 font-mono text-[10px] text-model">
                        agent queued
                      </span>
                    ) : (
                      <span className="font-mono text-[10.5px]" style={{ color }}>
                        {bandLabel[b].toLowerCase()}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lead && (
        <div className="border-t border-[var(--color-line)] bg-model/[0.06] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-model">agent decision</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-gray-400">{lead.rationale}</p>
        </div>
      )}
    </div>
  );
}
