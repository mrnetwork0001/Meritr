"use client";

import type { MeritrConfig } from "../lib/api";

/**
 * The Attestcoin data path.
 *
 * Names the actual precompile and contracts rather than generic boxes — where the credit data
 * comes from, and why no oracle operator sits anywhere in it, is what a reviewer needs first.
 */
export function AttestationFlow({ config }: { config: MeritrConfig | null }) {
  const stages = [
    ["01", "Source chain", "Aave V3 repayments, supplies and liquidations on Ethereum"],
    ["02", "Attestcoin 0xFD2", "Native query verifier — Merkle inclusion + continuity, checked by the Creditcoin runtime"],
    ["03", "MeritrAttestor", "Decodes proven logs against a registered event schema into cross-chain credit memory"],
    ["04", "MeritrVault", "Recomputes rate, LTV and relief on-chain from the attested score"],
  ];

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/88">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
        <h2 className="text-[13px] font-semibold text-gray-200">Attestcoin data path</h2>
        <span className="rounded border border-model/40 bg-model/[0.08] px-2 py-0.5 font-mono text-[10px] text-model">
          no oracle operator
        </span>
      </div>

      <ul className="divide-y divide-[var(--color-line)]">
        {stages.map(([n, title, detail]) => (
          <li key={n} className="flex gap-3 px-5 py-3.5">
            <span className="mono shrink-0 text-[11px] text-model">{n}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-gray-200">{title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">{detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {config?.sourceChains?.length ? (
        <div className="border-t border-[var(--color-line)] px-5 py-3.5">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-gray-600">registered sources</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {config.sourceChains.map((c) => (
              <span key={c.chainKey} className="chip" title={`${c.protocol} pool ${c.pool}`}>
                {c.name} · {c.protocol}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
