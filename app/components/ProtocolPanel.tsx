"use client";

import type { Health, ProtocolStats } from "../lib/api";
import { compactUsd, usd } from "../lib/format";

export function ProtocolPanel({ stats, health }: { stats: ProtocolStats | null; health: Health | null }) {
  const cells: Array<[string, string, boolean?]> = [
    ["supplied", stats ? compactUsd(stats.totalSupplied) : "—"],
    ["borrowed", stats ? compactUsd(stats.totalBorrowed) : "—"],
    ["utilisation", stats ? `${stats.utilizationPct.toFixed(1)}%` : "—"],
    ["reserve", stats ? compactUsd(stats.reserve) : "—", true],
    ["passports", stats ? String(stats.passportsIssued) : "—"],
    ["collateral mark", stats ? usd(stats.collateralPrice, 2) : "—"],
  ];

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-5 py-3">
        <h2 className="text-[13px] font-semibold text-gray-200">Protocol</h2>
        {health?.status === "ok" ? (
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-gray-500">
            <span className="hero-pulse h-1.5 w-1.5 rounded-full bg-up" />
            {health.network} · block {health.blockNumber?.toLocaleString()}
          </span>
        ) : (
          <span className="font-mono text-[10.5px] text-down">offline</span>
        )}
      </div>

      <dl className="grid grid-cols-2 divide-x divide-y divide-ink-700 sm:grid-cols-3">
        {cells.map(([label, value, accent]) => (
          <div key={label} className="px-5 py-3.5">
            <dd className={`mono text-[17px] font-semibold ${accent ? "text-model" : "text-gray-100"}`}>{value}</dd>
            <dt className="mt-1 font-mono text-[10px] uppercase tracking-wider text-gray-600">{label}</dt>
          </div>
        ))}
      </dl>

      {health?.status === "ok" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-700 px-5 py-3 font-mono text-[10.5px]">
          <span className={health.attestcoinAvailable ? "text-model" : "text-gray-600"}>
            attestcoin {health.attestcoinAvailable ? "online" : "unavailable"}
          </span>
          <span className="text-gray-700">·</span>
          <span className={health.agentConfigured ? "text-up" : "text-gray-600"}>
            risk agent {health.agentConfigured ? "armed" : "not configured"}
          </span>
        </div>
      )}
    </div>
  );
}
