"use client";

import { useEffect, useState } from "react";
import { api, type Health, type ProtocolStats } from "../lib/api";
import { compactUsd } from "../lib/format";

/**
 * Live protocol figures on the landing page.
 *
 * Degrades to a quiet "not connected" line rather than an error block: a marketing page whose
 * hero collapses because an RPC is slow is worse than one that simply shows less.
 */
export function LiveStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await api.health();
        if (cancelled) return;
        setHealth(h);
        if (h.status === "ok") {
          const s = await api.protocol();
          if (!cancelled) setStats(s);
        }
      } catch {
        /* landing page stays useful without the API */
      } finally {
        if (!cancelled) setTried(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tried) {
    return <div className="h-[92px] animate-pulse-soft rounded-2xl border border-ink-600/50" />;
  }

  if (!stats) {
    return (
      <div className="card card-pad text-center">
        <p className="text-xs text-mist-500">
          Live protocol data appears here when the risk API is reachable.
          <span className="ml-2 font-mono text-mist-600">npm run backend</span>
        </p>
      </div>
    );
  }

  const cells = [
    { label: "Supplied", value: compactUsd(stats.totalSupplied) },
    { label: "Borrowed", value: compactUsd(stats.totalBorrowed) },
    { label: "Restructuring reserve", value: compactUsd(stats.reserve), accent: true },
    { label: "Passports issued", value: String(stats.passportsIssued) },
  ];

  return (
    <div className="card card-pad">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="text-center">
            <p className={`font-mono text-2xl font-semibold tabular-nums ${c.accent ? "text-credit" : "text-mist-100"}`}>
              {c.value}
            </p>
            <p className="label mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      {health?.network && (
        <p className="mt-4 border-t border-ink-600 pt-3 text-center text-[11px] text-mist-500">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-healthy align-middle animate-pulse-soft" />
          live on {health.network} · block {health.blockNumber?.toLocaleString()}
          {health.attestcoinAvailable && " · Attestcoin verifier online"}
        </p>
      )}
    </div>
  );
}
