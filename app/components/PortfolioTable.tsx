"use client";

import { useState } from "react";
import type { Assessment } from "../lib/api";
import { band, bandColor, bandLabel, pct, short, usd } from "../lib/format";

/**
 * The agent's live working set, ordered the way it actually works the queue.
 *
 * Positions the agent intends to act on are pinned to the top and carry their rationale, so the
 * dashboard shows not just *what* the agent will do but *why it chose that one first* — which is
 * the only part of an autonomous system a reviewer can meaningfully audit at a glance.
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
  const [showAll, setShowAll] = useState(false);

  const rank = (a: Assessment) => {
    const q = actionQueue.indexOf(a.borrower);
    if (q >= 0) return q;
    const order = { liquidatable: 100, stressed: 200, watch: 300, healthy: 400, no_loan: 500 };
    return order[a.state] ?? 900;
  };

  const sorted = [...positions].sort((a, b) => rank(a) - rank(b));
  const visible = showAll ? sorted : sorted.slice(0, 6);

  if (!positions.length) {
    return (
      <div className="card card-pad">
        <h2 className="text-sm font-semibold text-mist-100">Risk book</h2>
        <p className="mt-3 text-sm text-mist-500">
          No loans opened yet. Seed a local scenario with{" "}
          <code className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[11px] text-mist-300">
            npx hardhat run scripts/seedLocal.js --network localhost
          </code>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-mist-100">Risk book</h2>
        <span className="text-[11px] text-mist-500">
          {positions.length} position{positions.length === 1 ? "" : "s"} ·{" "}
          {actionQueue.length} queued for intervention
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-600 text-left">
              {["Borrower", "Health", "Score", "Debt", "Rate", "Status"].map((h) => (
                <th key={h} className="pb-2 pr-4 label font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const b = band(p.healthFactor);
              const color = bandColor[b];
              const queued = actionQueue.includes(p.borrower);
              const isSel = selected === p.borrower;

              return (
                <tr
                  key={p.borrower}
                  onClick={() => onSelect(p.borrower)}
                  className={`cursor-pointer border-b border-ink-700/60 transition-colors ${
                    isSel ? "bg-ink-700/70" : "hover:bg-ink-700/40"
                  }`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="font-mono text-xs text-mist-300">{short(p.borrower)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums" style={{ color }}>
                    {p.healthFactor === null ? "∞" : p.healthFactor.toFixed(3)}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-mono tabular-nums text-mist-200">{p.score}</span>
                    <span className="ml-1.5 text-[11px] text-mist-500">{p.tier}</span>
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-mist-300">
                    {usd(p.debtUsd)}
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-mist-300">
                    {pct(p.rateBps)}
                  </td>
                  <td className="py-3">
                    {queued ? (
                      <span className="chip border-accent/40 bg-accent/10 text-accent">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-soft" />
                        agent queued
                      </span>
                    ) : (
                      <span
                        className="chip"
                        style={{
                          color,
                          borderColor: `${color}33`,
                          background: `${color}12`,
                        }}
                      >
                        {bandLabel[b]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > 6 && (
        <button className="btn-ghost mt-4 w-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      )}

      {actionQueue.length > 0 && (
        <div className="mt-5 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
          <p className="text-xs font-medium text-accent">Agent decision</p>
          <p className="mt-1.5 text-xs leading-relaxed text-mist-400">
            {sorted.find((p) => p.borrower === actionQueue[0])?.rationale}
          </p>
        </div>
      )}
    </div>
  );
}
