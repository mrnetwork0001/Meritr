"use client";

import type { RestructureEvent } from "../lib/api";
import { short, usd } from "../lib/format";

/**
 * The protocol's public record of every autonomous intervention.
 *
 * Read straight from `LoanRestructured` logs, so it cannot drift from what actually happened.
 * An agent acting on user debt should be auditable by anyone with an RPC endpoint.
 */
export function AgentFeed({ events }: { events: RestructureEvent[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
        <h2 className="text-[13px] font-semibold text-gray-200">Restructuring history</h2>
        <span className="font-mono text-[10.5px] text-gray-600">onchain audit trail</span>
      </div>

      {events.length === 0 ? (
        <p className="px-5 py-8 text-[12.5px] leading-relaxed text-gray-500">
          No interventions yet. The agent acts only when a position enters the stress band between
          a health factor of 1.00 and 1.15.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {events.map((e) => {
            const cut = e.oldRatePct - e.newRatePct;
            return (
              <li key={e.txHash} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="mono text-[12px] text-gray-300">{short(e.borrower)}</span>
                  <span className="font-mono text-[10px] text-gray-600">block {e.blockNumber}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="font-mono text-[9.5px] uppercase tracking-wider text-gray-600">health</p>
                    <p className="mono mt-1 text-[12px]">
                      <span className="text-down">{e.hfBefore.toFixed(3)}</span>
                      <span className="mx-1 text-gray-600">→</span>
                      <span className="text-up">{e.hfAfter.toFixed(3)}</span>
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9.5px] uppercase tracking-wider text-gray-600">rate</p>
                    <p className="mono mt-1 text-[12px]">
                      {cut > 0 ? (
                        <>
                          <span className="text-gray-600">{e.oldRatePct.toFixed(2)}%</span>
                          <span className="mx-1 text-gray-600">→</span>
                          <span className="text-up">{e.newRatePct.toFixed(2)}%</span>
                        </>
                      ) : (
                        <span className="text-gray-400">{e.newRatePct.toFixed(2)}% held</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9.5px] uppercase tracking-wider text-gray-600">retired</p>
                    <p className="mono mt-1 text-[12px] text-model">{usd(e.debtRetiredUsd, 2)}</p>
                  </div>
                </div>

                <p className="mt-3 font-mono text-[10px] leading-relaxed text-gray-600">
                  no collateral seized · funded from the reserve · principal returned to the pool
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
