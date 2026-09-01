"use client";

import { bandColor, bandLabel, band, tierColor } from "../lib/format";

/**
 * Credit-score arc, 300-900.
 *
 * Drawn as an SVG arc rather than a chart library: it is one number on one scale, and shipping a
 * plotting dependency to render it would cost more bytes than the whole dashboard.
 */
export function ScoreArc({
  score,
  tier,
  size = 190,
}: {
  score: number;
  tier: string;
  size?: number;
}) {
  const MIN = 300;
  const MAX = 900;
  const pct = Math.max(0, Math.min(1, (score - MIN) / (MAX - MIN)));

  const stroke = 12;
  const r = (size - stroke) / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  // 240° sweep starting at 150°, leaving a readable gap at the bottom.
  const START = 150;
  const SWEEP = 240;

  const polar = (angleDeg: number) => {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const arc = (fromDeg: number, toDeg: number) => {
    const s = polar(fromDeg);
    const e = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const color = tierColor[tier] ?? "#818CF8";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} role="img" aria-label={`Credit score ${score}, ${tier} tier`}>
        <path
          d={arc(START, START + SWEEP)}
          fill="none"
          stroke="#1B2434"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={arc(START, START + SWEEP * Math.max(pct, 0.001))}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ transition: "all 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-bold text-mist-100 tabular-nums">{score}</span>
        <span className="mt-0.5 text-xs tracking-[0.2em] uppercase" style={{ color }}>
          {tier}
        </span>
        <span className="mt-1 text-[10px] text-mist-500">ZK-Credit · 300–900</span>
      </div>
    </div>
  );
}

/**
 * Health-factor bar with the vault's real thresholds marked.
 *
 * The band boundaries (1.00 liquidation, 1.15 stress, 1.35 restructuring target) are drawn in
 * because the whole thesis of Meritr lives between them — a bare number hides the mechanism.
 */
export function HealthBar({ hf }: { hf: number | null }) {
  if (hf === null) {
    return <div className="text-sm text-mist-500">No debt — health factor undefined.</div>;
  }

  const MAXV = 2.0;
  const clamp = (v: number) => Math.max(0, Math.min(100, (v / MAXV) * 100));
  const b = band(hf);
  const color = bandColor[b];

  const marks = [
    { v: 1.0, label: "1.00 liquidation" },
    { v: 1.15, label: "1.15 stress" },
    { v: 1.35, label: "1.35 target" },
  ];

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color }}>
          {hf >= 100 ? "∞" : hf.toFixed(3)}
        </span>
        <span
          className="chip"
          style={{ color, borderColor: `${color}44`, background: `${color}14` }}
        >
          {bandLabel[b]}
        </span>
      </div>

      <div className="relative mt-4 h-2.5 w-full rounded-full bg-ink-700">
        {/* Zone tints, so the bands read even without the labels. */}
        <div
          className="absolute inset-y-0 left-0 rounded-l-full bg-danger/25"
          style={{ width: `${clamp(1.0)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-stress/25"
          style={{ left: `${clamp(1.0)}%`, width: `${clamp(1.15) - clamp(1.0)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-watch/20"
          style={{ left: `${clamp(1.15)}%`, width: `${clamp(1.3) - clamp(1.15)}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 rounded-r-full bg-healthy/20"
          style={{ left: `${clamp(1.3)}%` }}
        />

        {marks.map((m) => (
          <div
            key={m.v}
            className="absolute -top-1 h-4.5 w-px bg-mist-500/60"
            style={{ left: `${clamp(m.v)}%`, height: "18px", top: "-4px" }}
            title={m.label}
          />
        ))}

        <div
          className="absolute -top-1 h-4.5 w-1.5 rounded-full shadow-lg"
          style={{
            left: `calc(${clamp(hf)}% - 3px)`,
            height: "18px",
            top: "-4px",
            background: color,
            transition: "left 700ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-mist-500">
        {marks.map((m) => (
          <span key={m.v}>{m.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal component bar used in the score breakdown. */
export function ComponentBar({
  name,
  earned,
  available,
}: {
  name: string;
  earned: number;
  available: number;
}) {
  const pct = available ? (earned / available) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-mist-400">{name}</span>
        <span className="font-mono text-mist-300 tabular-nums">
          {earned}
          <span className="text-mist-500">/{available}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent/70 to-credit/70"
          style={{ width: `${pct}%`, transition: "width 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </div>
    </div>
  );
}
