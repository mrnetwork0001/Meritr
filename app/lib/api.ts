/**
 * Client for the Meritr risk API (`backend/main.py`).
 *
 * Every figure the dashboard shows is derived from chain state by the backend at request time -
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

export type Attestations = {
  facts: number;
  borrowers: number;
  sourceChains: number;
  valueProvenUsd: number;
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


export type FaucetStatus = {
  available: boolean;
  claimCtc: number;
  cooldownSeconds: number;
  eligibilityCeilingCtc: number;
  faucetAddress?: string;
  faucetBalanceCtc?: number;
  dry?: boolean;
  yourBalanceCtc?: number;
  eligible?: boolean;
  reason?: string;
  retryInSeconds?: number;
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
    throw new Error(`${res.status} ${path}${body ? ` - ${body.slice(0, 160)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) throw new Error(parsed?.detail ?? `${res.status} ${path}`);
  return parsed as T;
}

export const api = {
  health: () => get<Health>("/health"),
  config: () => get<MeritrConfig>("/api/config"),
  protocol: () => get<ProtocolStats>("/api/protocol"),
  portfolio: () => get<Portfolio>("/api/portfolio"),
  attestations: () => get<Attestations>("/api/attestations"),
  restructurings: () => get<{ count: number; events: RestructureEvent[] }>("/api/restructurings"),
  faucet: (address?: string) =>
    get<FaucetStatus>(`/api/faucet${address ? `?address=${address}` : ""}`),
  faucetClaim: (body: { address: string; issuedAt: number; signature: string }) =>
    post<{ txHash: string; amountCtc: number; to: string }>("/api/faucet/claim", body),
  borrower: (addr: string) =>
    get<{ credit: CreditProfile; position: any; assessment: Assessment }>(`/api/borrower/${addr}`),
  score: (addr: string) => get<CreditProfile>(`/api/borrower/${addr}/score`),
};
