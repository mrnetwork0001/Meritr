"use client";

import { useEffect, useState } from "react";
import { api, type CreditProfile } from "../lib/api";
import { ComponentBar, HealthBar, ScoreArc } from "./Gauges";
import { pct, relTime, short, usd } from "../lib/format";

/**
 * The borrower's-eye view: what the chain has proven about them, what that earns, and where
 * their position stands.
 */
export function BorrowerPanel({ address }: { address: string | null }) {
  const [data, setData] = useState<{ credit: CreditProfile; position: any; assessment: any } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .borrower(address)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) {
    return (
      <div className="card card-pad flex min-h-[320px] items-center justify-center text-center">
        <div>
          <p className="text-sm text-mist-400">Select a borrower</p>
          <p className="mt-1.5 text-xs text-mist-500">
            Their cross-chain credit memory and live position appear here.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card card-pad">
        <p className="text-sm text-danger">Could not load {short(address)}</p>
        <p className="mt-2 text-xs text-mist-500">{error}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="card card-pad min-h-[320px] animate-pulse-soft">
        <div className="h-4 w-32 rounded bg-ink-600" />
        <div className="mt-6 h-40 rounded bg-ink-700/60" />
      </div>
    );
  }

  const { credit, position, assessment } = data;
  const f = credit.facts;

  return (
    <div className="space-y-4">
      {/* Credit passport */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-mist-100">Credit passport</h2>
            <p className="addr mt-1 text-mist-500">{address}</p>
          </div>
          {!credit.hasAttestations && (
            <span className="chip border-watch/30 bg-watch/10 text-watch">no proofs yet</span>
          )}
        </div>

        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ScoreArc score={credit.score} tier={credit.tier} />

          <div className="w-full flex-1 space-y-3">
            {credit.components.map((c) => (
              <ComponentBar
                key={c.name}
                name={c.name}
                earned={c.earned}
                available={c.available}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink-600 pt-5 sm:grid-cols-4">
          <div>
            <p className="label">Earned APR</p>
            <p className="mt-1 font-mono text-lg text-healthy tabular-nums">
              {pct(credit.aprBps)}
            </p>
          </div>
          <div>
            <p className="label">Max LTV</p>
            <p className="mt-1 font-mono text-lg text-mist-200 tabular-nums">
              {pct(credit.maxLtvBps)}
            </p>
          </div>
          <div>
            <p className="label">Chains proven</p>
            <p className="mt-1 font-mono text-lg text-mist-200 tabular-nums">{f.chainCount}</p>
          </div>
          <div>
            <p className="label">Proofs ingested</p>
            <p className="mt-1 font-mono text-lg text-mist-200 tabular-nums">
              {f.attestationCount}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-ink-700/40 p-4 text-xs sm:grid-cols-4">
          <div>
            <p className="label">Lifetime repaid</p>
            <p className="mt-1 font-mono text-mist-200">{usd(f.totalRepaidUsd)}</p>
          </div>
          <div>
            <p className="label">Collateral attested</p>
            <p className="mt-1 font-mono text-mist-200">{usd(f.totalCollateralUsd)}</p>
          </div>
          <div>
            <p className="label">First activity</p>
            <p className="mt-1 font-mono text-mist-200">{relTime(f.firstActivityAt)}</p>
          </div>
          <div>
            <p className="label">Liquidations</p>
            <p
              className={`mt-1 font-mono ${
                f.liquidationCount > 0 ? "text-danger" : "text-mist-200"
              }`}
            >
              {f.liquidationCount}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-mist-500">
          Every figure above originates from a source-chain transaction verified by the Attestcoin
          native query verifier precompile. None of it is self-reported.
        </p>
      </div>

      {/* Position */}
      <div className="card card-pad">
        <h2 className="text-sm font-semibold text-mist-100">Position</h2>

        {!position.active ? (
          <p className="mt-3 text-sm text-mist-500">No active loan.</p>
        ) : (
          <>
            <div className="mt-4">
              <HealthBar hf={position.healthFactor} />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <div>
                <dt className="label">Debt</dt>
                <dd className="mt-1 font-mono text-mist-100 tabular-nums">
                  {usd(position.debtValueUsd, 2)}
                </dd>
              </div>
              <div>
                <dt className="label">Collateral</dt>
                <dd className="mt-1 font-mono text-mist-100 tabular-nums">
                  {usd(position.collateralValueUsd, 2)}
                </dd>
              </div>
              <div>
                <dt className="label">Rate charged</dt>
                <dd className="mt-1 font-mono text-mist-100 tabular-nums">
                  {pct(position.rateBps)}
                </dd>
              </div>
              <div>
                <dt className="label">Restructurings</dt>
                <dd className="mt-1 font-mono text-mist-100 tabular-nums">
                  {position.restructureCount}
                  <span className="text-mist-500">/3</span>
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-xl border border-ink-600 bg-ink-700/40 p-4">
              <p className="label">Agent assessment</p>
              <p className="mt-2 text-xs leading-relaxed text-mist-400">{assessment.rationale}</p>
              {assessment.shouldRestructure && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip border-accent/40 bg-accent/10 text-accent">
                    queued for restructuring
                  </span>
                  <span className="chip border-ink-500 bg-ink-800 text-mist-400">
                    averts ~{usd(assessment.expectedLossAvertedUsd)}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
