"use client";

import type { ProtocolStats, Health } from "../lib/api";
import { compactUsd, usd } from "../lib/format";

export function ProtocolPanel({
  stats,
  health,
}: {
  stats: ProtocolStats | null;
  health: Health | null;
}) {
  const cells = [
    { label: "Total supplied", value: stats ? compactUsd(stats.totalSupplied) : "—" },
    { label: "Borrowed", value: stats ? compactUsd(stats.totalBorrowed) : "—" },
    { label: "Utilisation", value: stats ? `${stats.utilizationPct.toFixed(1)}%` : "—" },
    {
      label: "Restructuring reserve",
      value: stats ? compactUsd(stats.reserve) : "—",
      hint: "Funds relief. Never drawn from lender principal.",
      accent: true,
    },
    { label: "Passports issued", value: stats ? String(stats.passportsIssued) : "—" },
    {
      label: "Collateral mark",
      value: stats ? usd(stats.collateralPrice, 2) : "—",
    },
  ];

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-mist-100">Protocol</h2>
        {health?.status === "ok" ? (
          <span className="chip border-healthy/30 bg-healthy/10 text-healthy">
            <span className="h-1.5 w-1.5 rounded-full bg-healthy animate-pulse-soft" />
            {health.network} · block {health.blockNumber?.toLocaleString()}
          </span>
        ) : (
          <span className="chip border-danger/30 bg-danger/10 text-danger">offline</span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="label">{c.label}</dt>
            <dd
              className={`stat mt-1.5 ${c.accent ? "text-credit" : ""}`}
              title={c.hint}
            >
              {c.value}
            </dd>
            {c.hint && <p className="mt-1 text-[10px] leading-snug text-mist-500">{c.hint}</p>}
          </div>
        ))}
      </dl>

      {health?.status === "ok" && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-600 pt-4 text-[11px] text-mist-500">
          <span
            className={`chip ${
              health.attestcoinAvailable
                ? "border-credit/30 bg-credit/10 text-credit"
                : "border-watch/30 bg-watch/10 text-watch"
            }`}
          >
            Attestcoin {health.attestcoinAvailable ? "online" : "unavailable"}
          </span>
          <span
            className={`chip ${
              health.agentConfigured
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-ink-500 bg-ink-700 text-mist-400"
            }`}
          >
            Risk agent {health.agentConfigured ? "armed" : "not configured"}
          </span>
        </div>
      )}
    </div>
  );
}
