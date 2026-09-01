/** Shared display helpers. Presentation only — never used in a decision path. */

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

export const bandColor: Record<Band, string> = {
  healthy: "#34D399",
  watch: "#FBBF24",
  stress: "#FB923C",
  danger: "#F87171",
};

export const bandLabel: Record<Band, string> = {
  healthy: "Healthy",
  watch: "Watch",
  stress: "Stressed",
  danger: "Liquidatable",
};

export const tierColor: Record<string, string> = {
  Diamond: "#7DF9FF",
  Platinum: "#C0C6D4",
  Gold: "#E8B33C",
  Silver: "#9AA3B2",
  Bronze: "#B87333",
};

export const relTime = (unix: number) => {
  if (!unix) return "—";
  const days = Math.floor((Date.now() / 1000 - unix) / 86400);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
};
