"use client";

import { useEffect, useState } from "react";
import { api, type CreditProfile } from "../lib/api";
import { ComponentBar, HealthBar, ScoreArc } from "./Gauges";
import { pct, relTime, short, usd } from "../lib/format";

/** What the chain has proven about a borrower, what that earns, and where their loan stands. */
export function BorrowerPanel({ address }: { address: string | null }) {
  const [data, setData] = useState<{ credit: CreditProfile; position: any; assessment: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    let dead = false;
    setLoading(true);
    setError(null);
    api
      .borrower(address)
      .then((d) => !dead && setData(d))
      .catch((e) => !dead && setError(String(e.message ?? e)))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [address]);

  if (!address) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-ink-700 bg-ink-900">
        <p className="font-mono text-[11px] text-gray-600">select a borrower</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-down/40 bg-ink-900 px-5 py-5">
        <p className="text-[13px] text-down">could not load {short(address)}</p>
        <p className="mt-2 font-mono text-[11px] text-gray-500">{error}</p>
      </div>
    );
  }
  if (loading || !data) {
    return <div className="hero-pulse min-h-[240px] rounded-lg border border-ink-700 bg-ink-900" />;
  }

  const { credit, position, assessment } = data;
  const f = credit.facts;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-ink-700 bg-ink-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-700 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-gray-200">Credit passport</h2>
          <span className="mono text-[10.5px] text-gray-600">{address}</span>
        </div>

        <div className="flex flex-col items-center gap-7 px-5 py-6 sm:flex-row">
          <ScoreArc score={credit.score} tier={credit.tier} />
          <div className="w-full flex-1 space-y-3">
            {credit.components.map((c) => (
              <ComponentBar key={c.name} name={c.name} earned={c.earned} available={c.available} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-ink-700 border-t border-ink-700 sm:grid-cols-4">
          {[
            ["earned apr", pct(credit.aprBps), "text-up"],
            ["max ltv", pct(credit.maxLtvBps), "text-gray-100"],
            ["chains proven", String(f.chainCount), "text-gray-100"],
            ["proofs ingested", String(f.attestationCount), "text-gray-100"],
          ].map(([k, v, cls]) => (
            <div key={k} className="px-5 py-3">
              <p className={`mono text-[15px] font-semibold ${cls}`}>{v}</p>
              <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-gray-600">{k}</p>
            </div>
          ))}
        </div>

        <ul className="divide-y divide-ink-700/70 border-t border-ink-700 text-[12px]">
          {[
            ["lifetime repaid", usd(f.totalRepaidUsd)],
            ["collateral attested", usd(f.totalCollateralUsd)],
            ["first activity", relTime(f.firstActivityAt)],
            ["liquidations", String(f.liquidationCount)],
          ].map(([k, v], i) => (
            <li key={k} className="flex items-baseline justify-between px-5 py-2">
              <span className="text-gray-500">{k}</span>
              <span className={`mono ${i === 3 && f.liquidationCount > 0 ? "text-down" : "text-gray-300"}`}>{v}</span>
            </li>
          ))}
        </ul>

        <p className="border-t border-ink-700 px-5 py-3 font-mono text-[10px] leading-relaxed text-gray-600">
          every figure above originates from a transaction verified by the Attestcoin precompile —
          none of it is self-reported
        </p>
      </div>

      <div className="rounded-lg border border-ink-700 bg-ink-900">
        <div className="border-b border-ink-700 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-gray-200">Position</h2>
        </div>

        {!position.active ? (
          <p className="px-5 py-8 font-mono text-[11px] text-gray-600">no active loan</p>
        ) : (
          <>
            <div className="px-5 py-5">
              <HealthBar hf={position.healthFactor} />
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-ink-700 border-t border-ink-700 sm:grid-cols-4">
              {[
                ["debt", usd(position.debtValueUsd, 2)],
                ["collateral", usd(position.collateralValueUsd, 2)],
                ["rate charged", pct(position.rateBps)],
                ["restructurings", `${position.restructureCount}/3`],
              ].map(([k, v]) => (
                <div key={k} className="px-5 py-3">
                  <p className="mono text-[14px] text-gray-100">{v}</p>
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-gray-600">{k}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-ink-700 px-5 py-4">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-model">agent assessment</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-gray-400">{assessment.rationale}</p>
              {assessment.shouldRestructure && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded border border-model/40 bg-model/[0.08] px-2 py-0.5 font-mono text-[10px] text-model">
                    queued for restructuring
                  </span>
                  <span className="chip">averts ~{usd(assessment.expectedLossAvertedUsd)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
