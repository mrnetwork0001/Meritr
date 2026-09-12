"use client";

import { formatHf } from "../lib/format";
import { useEffect, useState } from "react";
import { api, type Health, type Portfolio, type ProtocolStats } from "../lib/api";

/**
 * Live protocol panel beside the hero headline.
 *
 * Mirrors the risk book the dashboard shows, so the landing page proves the thing it claims
 * rather than only describing it. Falls back to a quiet offline state - a hero that collapses
 * because an RPC is slow is worse than one that shows less.
 */

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : Math.abs(n) >= 1_000
      ? `$${(n / 1_000).toFixed(1)}k`
      : `$${n.toFixed(0)}`;

export function HeroPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [book, setBook] = useState<Portfolio | null>(null);
  const [state, setState] = useState<"loading" | "live" | "offline">("loading");

  useEffect(() => {
    let dead = false;
    const tick = async () => {
      try {
        const h = await api.health();
        if (dead) return;
        setHealth(h);
        if (h.status !== "ok") {
          setState("offline");
          return;
        }
        const [s, p] = await Promise.all([api.protocol(), api.portfolio()]);
        if (dead) return;
        setStats(s);
        setBook(p);
        setState("live");
      } catch {
        if (!dead) setState("offline");
      }
    };
    tick();
    const t = setInterval(tick, 12_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  const dotClass =
    state === "live" ? "bg-up" : state === "offline" ? "bg-gray-700" : "bg-gray-600";

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-ink-900/90">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`anim-breathe h-1.5 w-1.5 rounded-full ${dotClass}`} />
          <span className="font-mono text-[11px] text-gray-400">
            meritr · {state === "live" ? "live risk book" : state === "offline" ? "offline" : "connecting"}
          </span>
        </div>
        {health?.attestcoinAvailable && (
          <span className="font-mono text-[10px] text-model">0xFD2 online</span>
        )}
      </div>

      {state !== "live" ? (
        <div className="px-4 py-10 text-center font-mono text-[11px] text-gray-600">
          {state === "loading" ? "reading the book…" : "risk api unreachable"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-[var(--color-line)] border-b border-[var(--color-line)]">
            {[
              ["supplied", compact(stats?.totalSupplied ?? 0)],
              ["reserve", compact(stats?.reserve ?? 0)],
              ["passports", String(stats?.passportsIssued ?? 0)],
            ].map(([k, v]) => (
              <div key={k} className="px-4 py-3">
                <p className="mono text-[15px] text-gray-100">{v}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-gray-600">
                  {k}
                </p>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-[var(--color-line)]">
            {(book?.positions ?? []).slice(0, 4).map((p) => {
              const hf = p.healthFactor;
              const distressed = hf !== null && hf < 1.15;
              const queued = (book?.actionQueue ?? []).includes(p.borrower);
              return (
                <li key={p.borrower} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="mono w-[5.5rem] shrink-0 text-[11.5px] text-gray-500">
                    {p.borrower.slice(0, 6)}…{p.borrower.slice(-4)}
                  </span>
                  <span
                    className={`mono w-14 shrink-0 text-[12.5px] ${distressed ? "text-down" : "text-up"}`}
                  >
                    {formatHf(hf)}
                  </span>
                  <span className="mono w-10 shrink-0 text-[11.5px] text-gray-400">{p.score}</span>
                  <span
                    className={`truncate font-mono text-[10.5px] ${queued ? "text-model" : "text-gray-600"}`}
                  >
                    {queued ? "agent queued" : p.state}
                  </span>
                </li>
              );
            })}
            {(book?.positions ?? []).length === 0 && (
              <li className="px-4 py-8 text-center font-mono text-[11px] text-gray-600">
                no open positions
              </li>
            )}
          </ul>
        </>
      )}

      <p className="border-t border-[var(--color-line)] px-4 py-2.5 text-center font-mono text-[10px] text-gray-600">
        {state === "live" && health?.network
          ? `live from ${health.network} · block ${health.blockNumber?.toLocaleString()} · refreshed every 12s`
          : "start the risk api to see live positions"}
      </p>
    </div>
  );
}
