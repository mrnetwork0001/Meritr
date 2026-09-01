/**
 * Client for the Meritr risk API (`backend/main.py`).
 *
 * Every figure the dashboard shows is derived from chain state by the backend at request time —
 * there is no cache to go stale and no second source of truth to disagree with the contracts.
 */

const BASE = process.env.NEXT_PUBLIC_MERITR_API || "http://localhost:8000";

export type Health = {
  status: "ok" | "degraded";
  network?: string;
  chainId?: number;
  blockNumber?: number;
  attestcoinPrecompile?: string;
  attestcoinAvailable?: boolean;
  agentConfigured?: boolean;
  agentAddress?: string | null;
  error?: string;
};

export type ProtocolStats = {
  totalSupplied: number;
  totalBorrowed: number;
  available: number;
  reserve: number;
  utilizationPct: number;
  assetPrice: number;
  collateralPrice: number;
  passportsIssued: number;
};

export type ScoreComponent = {
  name: string;
  earned: number;
  available: number;
  pct: number;
};

export type CreditProfile = {
  address: string;
  score: number;
  tier: string;
  aprBps: number;
  maxLtvBps: number;
  hasAttestations: boolean;
  components: ScoreComponent[];
  facts: {
    totalRepaidUsd: number;
    totalCollateralUsd: number;
    firstActivityAt: number;
    lastActivityAt: number;
    repaymentCount: number;
    liquidationCount: number;
    chainCount: number;
    attestationCount: number;
  };
};

export type Assessment = {
  borrower: string;
  state: "no_loan" | "healthy" | "watch" | "stressed" | "liquidatable";
  healthFactor: number | null;
  score: number;
  tier: string;
  rateBps: number;
  marketRateBps: number;
  debtUsd: number;
  collateralUsd: number;
  bufferToLiquidation: number;
  daysToLiquidation: number | null;
  debtAtRiskUsd: number;
  expectedLossAvertedUsd: number;
  shouldRestructure: boolean;
  restructureCount: number;
  rationale: string;
};

export type Portfolio = {
  count: number;
  positions: Assessment[];
  actionQueue: string[];
  totalDebtAtRiskUsd: number;
  totalLossAvertableUsd: number;
};

export type RestructureEvent = {
  borrower: string;
  triggeredBy: string;
  oldRatePct: number;
  newRatePct: number;
  newMaturity: number;
  debtRetiredUsd: number;
  hfBefore: number;
  hfAfter: number;
  blockNumber: number;
  txHash: string;
};

export type MeritrConfig = {
  network: string;
  chainId: number;
  contracts: Record<string, string>;
  decimals: { asset: number; collateral: number };
  attestcoinPrecompile: string;
  sourceChains: Array<{
    chainKey: string;
    name: string;
    protocol: string;
    pool: string;
    assets: Array<{ symbol: string; address: string; decimals: number }>;
  }>;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<Health>("/health"),
  config: () => get<MeritrConfig>("/api/config"),
  protocol: () => get<ProtocolStats>("/api/protocol"),
  portfolio: () => get<Portfolio>("/api/portfolio"),
  restructurings: () => get<{ count: number; events: RestructureEvent[] }>("/api/restructurings"),
  borrower: (addr: string) =>
    get<{ credit: CreditProfile; position: any; assessment: Assessment }>(`/api/borrower/${addr}`),
  score: (addr: string) => get<CreditProfile>(`/api/borrower/${addr}/score`),
};
