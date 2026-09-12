/** Shared display helpers. Presentation only - never used in a decision path. */

export const usd = (n: number, digits = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const compactUsd = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return usd(n, 2);
};

export const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/** Health-factor bands, matching the vault's own thresholds. */
export type Band = "healthy" | "watch" | "stress" | "danger";

export function band(hf: number | null): Band {
  if (hf === null) return "healthy";
  if (hf < 1.0) return "danger";
  if (hf < 1.15) return "stress";
  if (hf < 1.3) return "watch";
  return "healthy";
}

/** Health-band colours, drawn from the shared palette so gauges and badges never drift. */
export const bandColor: Record<Band, string> = {
  healthy: "rgb(52 211 153)", // up
  watch: "rgb(129 140 248)", // model
  stress: "rgb(251 146 60)",
  danger: "rgb(251 113 133)", // down
};

export const bandLabel: Record<Band, string> = {
  healthy: "Healthy",
  watch: "Watch",
  stress: "Stressed",
  danger: "Liquidatable",
};

export const tierColor: Record<string, string> = {
  Diamond: "rgb(129 140 248)",
  Platinum: "rgb(203 213 225)",
  Gold: "rgb(232 179 60)",
  Silver: "rgb(148 163 184)",
  Bronze: "rgb(184 115 51)",
};

export const relTime = (unix: number) => {
  if (!unix) return "-";
  const days = Math.floor((Date.now() / 1000 - unix) / 86400);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
};

/**
 * Render a health factor for a fixed-width column.
 *
 * A position with no debt has no meaningful health factor - the contract returns a number near
 * the top of uint256 and the API narrows it to something like 31,638,659.737, which is not a
 * ratio anyone should read. Printed with toFixed(3) it also overflows its column and collides
 * with the score beside it, which is how this was noticed.
 *
 * Anything above this bound is a debt-free position rather than an extraordinarily safe one:
 * the vault caps LTV at 69.5% for the best score, so a real open loan cannot reach a health
 * factor in the hundreds, let alone the millions.
 */
const HF_EFFECTIVELY_INFINITE = 1_000;

export const formatHf = (hf: number | null | undefined): string => {
  if (hf === null || hf === undefined || !Number.isFinite(hf)) return "∞";
  if (hf >= HF_EFFECTIVELY_INFINITE) return "∞";
  return hf.toFixed(3);
};
