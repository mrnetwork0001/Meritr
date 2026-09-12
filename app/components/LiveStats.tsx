"use client";

import { useEffect, useState } from "react";
import { api, type Attestations } from "../lib/api";

/**
 * The evidence strip, counted from chain logs rather than written down.
 *
 * A relayer is continuously proving new Ethereum activity into this deployment, so any figure
 * typed into the page would be stale within the hour. Reading it live also means the numbers
 * visibly grow while someone is looking at them, which is a stronger claim than the numbers
 * themselves.
 *
 * Falls back to the last verified snapshot if the API is unreachable, labelled as such — a
 * hero that collapses on a slow RPC is worse than one that shows a known-good figure.
 */

const FALLBACK: Attestations = {
  facts: 170,
  borrowers: 85,
  sourceChains: 1,
  valueProvenUsd: 18_116_889,
};

const compactUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}k` : `$${n.toFixed(0)}`;

export function LiveStats() {
  const [data, setData] = useState<Attestations | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let dead = false;
    const tick = async () => {
      try {
        const a = await api.attestations();
        if (dead) return;
        setData(a);
        setLive(true);
      } catch {
        if (!dead) setData((d) => d ?? FALLBACK);
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  const d = data ?? FALLBACK;
  const cells: Array<[string, string]> = [
    [d.facts.toLocaleString(), "credit facts proven"],
    [d.borrowers.toLocaleString(), "real Ethereum borrowers"],
    [compactUsd(d.valueProvenUsd), "of credit activity proven"],
    ["0", "oracle operators"],
  ];

  return (
    <div>
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map(([n, l], i) => (
          <div key={l} style={{ ["--n" as string]: i }}>
            <div className="panel panel-hover h-full p-5 text-center">
              <p className="mono text-[26px] font-semibold text-[#f2f4f8]">{n}</p>
              <p className="eyebrow mt-2 text-[9.5px]">{l}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mono mt-3 text-center text-[10.5px] text-[#5d6474]">
        {live ? (
          <>
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-up align-middle anim-breathe" />
            counted live from chain logs · a relayer is still adding to this
          </>
        ) : (
          "last verified count — start the risk API for the live figure"
        )}
      </p>
    </div>
  );
}
