"use client";

import type { RestructureEvent } from "../lib/api";
import { short, usd } from "../lib/format";

/**
 * The protocol's public record of every autonomous intervention.
 *
 * Read straight from `LoanRestructured` logs, so it cannot drift from what actually happened —
 * an autonomous agent that acts on user debt should be auditable by anyone with an RPC endpoint.
 */
export function AgentFeed({ events }: { events: RestructureEvent[] }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-mist-100">Restructuring history</h2>
        <span className="text-[11px] text-mist-500">on-chain audit trail</span>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-mist-500">
          No interventions yet. The agent acts only when a position enters the stress band
          between a health factor of 1.00 and 1.15.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((e) => {
            const rateCut = e.oldRatePct - e.newRatePct;
            return (
              <li
                key={e.txHash}
                className="animate-slide-up rounded-xl border border-ink-600 bg-ink-700/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-mist-300">{short(e.borrower)}</span>
                  <span className="text-[10px] text-mist-500">block {e.blockNumber}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="label">Health</p>
                    <p className="mt-1 font-mono tabular-nums">
                      <span className="text-stress">{e.hfBefore.toFixed(3)}</span>
                      <span className="mx-1 text-mist-500">→</span>
                      <span className="text-healthy">{e.hfAfter.toFixed(3)}</span>
                    </p>
                  </div>
                  <div>
                    <p className="label">Rate</p>
                    <p className="mt-1 font-mono tabular-nums text-mist-200">
                      {rateCut > 0 ? (
                        <>
                          <span className="text-mist-500">{e.oldRatePct.toFixed(2)}%</span>
                          <span className="mx-1 text-mist-500">→</span>
                          <span className="text-healthy">{e.newRatePct.toFixed(2)}%</span>
                        </>
                      ) : (
                        <span className="text-mist-400">{e.newRatePct.toFixed(2)}% held</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="label">Debt retired</p>
                    <p className="mt-1 font-mono tabular-nums text-credit">
                      {usd(e.debtRetiredUsd, 2)}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-[10px] leading-relaxed text-mist-500">
                  No collateral seized. Relief funded from the protocol reserve; retired principal
                  returned to the lendable pool.
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
