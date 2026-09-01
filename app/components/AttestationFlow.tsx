"use client";

import type { MeritrConfig } from "../lib/api";

/**
 * The Attestcoin data path, drawn as a pipeline.
 *
 * This is the part of Meritr judges and integrators most need to understand quickly: where the
 * credit data comes from, and why no oracle operator sits anywhere in it. The diagram names the
 * actual precompile and the actual contracts rather than generic boxes.
 */
export function AttestationFlow({ config }: { config: MeritrConfig | null }) {
  const stages = [
    {
      title: "Source chains",
      detail: "Aave V3 repayments, supplies and liquidations on Ethereum and Base",
      accent: "#818CF8",
    },
    {
      title: "Attestcoin precompile",
      detail: `Native query verifier at ${config?.attestcoinPrecompile ?? "0x…0FD2"} — Merkle inclusion + continuity, verified by the Creditcoin runtime`,
      accent: "#7DF9FF",
    },
    {
      title: "MeritrAttestor",
      detail: "Decodes proven logs against a registered event schema and folds them into cross-chain credit memory",
      accent: "#34D399",
    },
    {
      title: "MeritrVault",
      detail: "Recomputes rate, LTV and relief on-chain from the attested score, then restructures",
      accent: "#FBBF24",
    },
  ];

  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-mist-100">Attestcoin data path</h2>
        <span className="chip border-credit/30 bg-credit/10 text-credit">no oracle operator</span>
      </div>

      <ol className="mt-5 space-y-0">
        {stages.map((s, i) => (
          <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stages.length - 1 && (
              <span
                className="absolute left-[7px] top-5 h-full w-px bg-gradient-to-b from-ink-500 to-transparent"
                aria-hidden
              />
            )}
            <span
              className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2"
              style={{ borderColor: s.accent, background: "#05070D" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-mist-200">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-mist-500">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {config?.sourceChains?.length ? (
        <div className="mt-2 border-t border-ink-600 pt-4">
          <p className="label">Registered sources</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {config.sourceChains.map((c) => (
              <span
                key={c.chainKey}
                className="chip border-ink-500 bg-ink-700/60 text-mist-300"
                title={`${c.protocol} pool ${c.pool}`}
              >
                {c.name}
                <span className="text-mist-500">· {c.protocol}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
