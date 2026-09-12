"use client";

import { band, bandColor, bandLabel, tierColor, formatHf } from "../lib/format";

/**
 * Credit-score arc, 300-900.
 *
 * Inline SVG rather than a charting library: this is one number on one scale, and a plotting
 * dependency would outweigh the entire dashboard.
 */
export function ScoreArc({ score, tier, size = 168 }: { score: number; tier: string; size?: number }) {
  const MIN = 300;
  const MAX = 900;
  const pct = Math.max(0, Math.min(1, (score - MIN) / (MAX - MIN)));

  const stroke = 10;
  const r = (size - stroke) / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const START = 150;
  const SWEEP = 240;

  const polar = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const s = polar(from);
    const e = polar(to);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
  };

  const color = tierColor[tier] ?? "rgb(129 140 248)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} role="img" aria-label={`Credit score ${score}, ${tier} tier`}>
        <path d={arc(START, START + SWEEP)} fill="none" stroke="rgb(31 41 55)" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={arc(START, START + SWEEP * Math.max(pct, 0.001))}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ transition: "all 700ms cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[34px] font-bold leading-none text-gray-50">{score}</span>
        <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color }}>
          {tier}
        </span>
        <span className="mt-1 font-mono text-[9px] text-gray-600">300–900</span>
      </div>
    </div>
  );
}

/**
 * Health-factor bar with the vault's real thresholds marked.
 *
 * The band boundaries are drawn in because Meritr's entire thesis lives between them - a bare
 * number hides the mechanism that makes restructuring possible.
 */
export function HealthBar({ hf }: { hf: number | null }) {
  if (hf === null) {
    return <p className="font-mono text-[12px] text-gray-600">no debt - health factor undefined</p>;
  }

  const MAXV = 2.0;
  const at = (v: number) => Math.max(0, Math.min(100, (v / MAXV) * 100));
  const b = band(hf);
  const color = bandColor[b];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="mono text-[28px] font-bold leading-none" style={{ color }}>
          {formatHf(hf)}
        </span>
        <span
          className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
          style={{ color, borderColor: `${color}55`, background: `${color}14` }}
        >
          {bandLabel[b]}
        </span>
      </div>

      <div className="relative mt-4 h-2 w-full rounded-sm bg-ink-800">
        <div className="absolute inset-y-0 left-0 rounded-l-sm bg-down/25" style={{ width: `${at(1.0)}%` }} />
        <div className="absolute inset-y-0 bg-orange-400/20" style={{ left: `${at(1.0)}%`, width: `${at(1.15) - at(1.0)}%` }} />
        <div className="absolute inset-y-0 bg-model/15" style={{ left: `${at(1.15)}%`, width: `${at(1.3) - at(1.15)}%` }} />
        <div className="absolute inset-y-0 right-0 rounded-r-sm bg-up/15" style={{ left: `${at(1.3)}%` }} />

        {[1.0, 1.15, 1.35].map((m) => (
          <span key={m} className="absolute w-px bg-gray-600" style={{ left: `${at(m)}%`, top: -3, height: 14 }} />
        ))}
        <span
          className="absolute w-1 rounded-sm"
          style={{
            left: `calc(${at(hf)}% - 2px)`,
            top: -3,
            height: 14,
            background: color,
            transition: "left 700ms cubic-bezier(0.2,0.7,0.2,1)",
          }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[9.5px] text-gray-600">
        <span>1.00 liquidation</span>
        <span>1.15 stress</span>
        <span>1.35 target</span>
      </div>
    </div>
  );
}

/** One row of the score breakdown. */
export function ComponentBar({ name, earned, available }: { name: string; earned: number; available: number }) {
  const pct = available ? (earned / available) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-gray-400">{name}</span>
        <span className="mono text-[11.5px] text-gray-300">
          {earned}
          <span className="text-gray-600">/{available}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-sm bg-ink-800">
        <div
          className="h-full rounded-sm bg-model"
          style={{ width: `${pct}%`, transition: "width 700ms cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </div>
    </div>
  );
}
