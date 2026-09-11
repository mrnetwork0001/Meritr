"""
Meritr risk API.

    uvicorn backend.main:app --reload --port 8000

A thin, read-mostly HTTP layer over the deployed contracts and the DeAI risk engine. It holds no
database and no cached credit state: every score, position and assessment is derived from chain
data on request, so the API can never disagree with the contracts it reports on. Restart it, move
it, run ten copies — the answers are identical because the chain is the only source of truth.

The one write endpoint (`/api/agent/simulate/{address}`) is a dry run that broadcasts nothing;
restructuring is executed by `agents/underwriter.py` holding the risk-agent key, never by the
public API surface.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents import config, scoring
from agents.chain import ChainClient
from agents.risk import assess, triage

log = logging.getLogger("meritr.api")

state: dict[str, Any] = {"client": None, "config": None, "error": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect at startup, but stay up if the chain is unreachable.

    A risk dashboard that refuses to boot when an RPC blips is worse than one that boots and
    says so: `/health` reports the failure, and every data route returns a 503 that names it.
    """
    try:
        cfg = config.load()
        state["config"] = cfg
        client = ChainClient(cfg)
        if not client.connected():
            raise RuntimeError(f"RPC unreachable at {cfg.rpc_url}")
        state["client"] = client
        log.info("Connected to %s (chainId %s)", cfg.network, cfg.chain_id)
    except Exception as exc:
        state["error"] = str(exc)
        log.error("Startup failed: %s", exc)
    yield


app = FastAPI(
    title="Meritr Risk API",
    version="1.0.0",
    description=(
        "Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS on Creditcoin. "
        "Credit facts are ingested through the Attestcoin native query verifier precompile "
        "(0xFD2); every figure served here is derived from chain state at request time."
    ),
    lifespan=lifespan,
)

# Any localhost port, because `next dev` reassigns the port whenever 3000 is taken and a
# hardcoded allowlist turns that into a silent, browser-only failure the terminal never shows.
# Set MERITR_CORS_ORIGINS (comma-separated) to pin exact origins for a public deployment.
_explicit_origins = [
    o.strip() for o in os.getenv("MERITR_CORS_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=None if _explicit_origins else r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


def client() -> ChainClient:
    """Return a chain client bound to the *current* address book.

    Re-reads the deployment on every call (cheap — `config.load` caches on file mtime) and
    rebuilds the client when the addresses have changed. Without this, deploying while the API
    is running leaves it serving the previous deployment's contracts until someone notices and
    restarts it.
    """
    if state["client"] is None:
        raise HTTPException(
            status_code=503,
            detail=state["error"] or "Not connected to a Meritr deployment.",
        )

    try:
        fresh = config.load()
    except Exception:
        return state["client"]  # keep serving the last good config

    current = state.get("config")
    if current is None or fresh.vault != current.vault or fresh.chain_id != current.chain_id:
        log.info(
            "Deployment changed (%s -> %s); rebinding client.",
            getattr(current, "vault", None),
            fresh.vault,
        )
        state["config"] = fresh
        state["client"] = ChainClient(fresh)

    return state["client"]


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class ScoreComponent(BaseModel):
    name: str
    earned: int
    available: int
    pct: float


class CreditProfile(BaseModel):
    address: str
    score: int = Field(description="ZK-Credit score, 300-900")
    tier: str
    aprBps: int
    maxLtvBps: int
    hasAttestations: bool
    components: list[ScoreComponent]
    facts: dict


class ProtocolStats(BaseModel):
    totalSupplied: float
    totalBorrowed: float
    available: float
    reserve: float
    utilizationPct: float
    assetPrice: float
    collateralPrice: float
    passportsIssued: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Liveness plus a full picture of what the API is connected to."""
    if state["client"] is None:
        return {"status": "degraded", "error": state["error"]}

    c = client()
    cfg = state["config"]
    return {
        "status": "ok",
        "network": cfg.network,
        "chainId": cfg.chain_id,
        "blockNumber": c.block_number(),
        "attestcoinPrecompile": config.ATTESTCOIN_PRECOMPILE,
        "attestcoinAvailable": c.precompile_present(),
        "agentConfigured": c.account is not None,
        "agentAddress": c.account.address if c.account else None,
    }


@api.get("/config", tags=["meta"])
def get_config() -> dict:
    """Addresses and source-chain registry — the frontend's single bootstrap call."""
    cfg = state["config"]
    if cfg is None:
        raise HTTPException(status_code=503, detail=state["error"] or "Not configured.")
    return {
        "network": cfg.network,
        "chainId": cfg.chain_id,
        "contracts": {
            "MeritrVault": cfg.vault,
            "MeritrAttestor": cfg.attestor,
            "MeritrPassport": cfg.passport,
            "asset": cfg.asset,
            "collateral": cfg.collateral,
        },
        "decimals": {"asset": cfg.asset_decimals, "collateral": cfg.collateral_decimals},
        "attestcoinPrecompile": config.ATTESTCOIN_PRECOMPILE,
        "sourceChains": cfg.source_chains,
        "scoring": {
            "min": scoring.MIN_SCORE,
            "max": scoring.MAX_SCORE,
            "minAprBps": scoring.MIN_APR_BPS,
            "maxAprBps": scoring.MAX_APR_BPS,
            "liquidationHf": str(scoring.LIQUIDATION_HF),
            "stressHf": str(scoring.STRESS_HF),
            "targetHf": str(scoring.TARGET_HF),
        },
    }


@api.get("/protocol", response_model=ProtocolStats, tags=["protocol"])
def protocol() -> ProtocolStats:
    """Pool-level state: supply, borrows, utilisation and the restructuring reserve."""
    c = client()
    cfg = state["config"]
    s = c.vault_stats()
    dec = 10**cfg.asset_decimals

    try:
        issued = c.passport.functions.totalIssued().call()
    except Exception:
        issued = 0

    return ProtocolStats(
        totalSupplied=s["totalAssets"] / dec,
        totalBorrowed=s["totalPrincipal"] / dec,
        available=s["totalIdle"] / dec,
        reserve=s["reserveBalance"] / dec,
        utilizationPct=s["utilizationBps"] / 100,
        assetPrice=s["assetPriceE8"] / scoring.E8,
        collateralPrice=s["collateralPriceE8"] / scoring.E8,
        passportsIssued=issued,
    )


@api.get("/borrower/{address}", tags=["borrower"])
def borrower(address: str) -> dict:
    """Everything about one borrower: credit profile, position and the agent's verdict."""
    c = client()
    cfg = state["config"]

    try:
        pos = c.position(address)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid address or RPC error: {exc}")

    a = assess(pos)
    profile = _profile(c, address)
    dec = 10**cfg.asset_decimals
    cdec = 10**cfg.collateral_decimals

    return {
        "credit": profile.model_dump(),
        "position": {
            "active": pos.active,
            "principal": pos.principal / dec,
            "interestOwed": pos.interest_owed / dec,
            "debt": pos.debt / dec,
            "collateral": pos.collateral / cdec,
            "collateralValueUsd": pos.collateral_value_e8 / scoring.E8,
            "debtValueUsd": pos.debt_value_e8 / scoring.E8,
            "rateBps": pos.rate_bps,
            "marketRateBps": pos.market_rate_bps,
            "healthFactor": None if pos.hf == float("inf") else round(pos.hf, 4),
            "maturity": pos.maturity,
            "restructureCount": pos.restructure_count,
            "inStressBand": pos.in_stress_band,
            "liquidatable": pos.liquidatable,
            "restructurable": pos.restructurable,
        },
        "assessment": a.to_dict(),
    }


@api.get("/borrower/{address}/score", response_model=CreditProfile, tags=["borrower"])
def borrower_score(address: str) -> CreditProfile:
    """Credit profile alone — the explainable score breakdown."""
    return _profile(client(), address)


def _profile(c: ChainClient, address: str) -> CreditProfile:
    try:
        raw_facts = c.facts(address)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid address or RPC error: {exc}")

    facts = scoring.CreditFacts.from_chain(raw_facts)
    # Scored locally rather than re-read from chain: the parity suite pins the two
    # implementations together, and this keeps the endpoint to a single RPC round trip.
    breakdown = scoring.score(facts)

    components = [
        ScoreComponent(
            name=name,
            earned=earned,
            available=available,
            pct=round(100 * earned / available, 1) if available else 0.0,
        )
        for name, earned, available in breakdown.explain()
    ]

    return CreditProfile(
        address=address,
        score=breakdown.score,
        tier=scoring.tier_of(breakdown.score),
        aprBps=scoring.apr_bps(breakdown.score),
        maxLtvBps=scoring.max_ltv_bps(breakdown.score),
        hasAttestations=facts.attestation_count > 0,
        components=components,
        facts={
            "totalRepaidUsd": facts.total_repaid_e8 / scoring.E8,
            "totalCollateralUsd": facts.total_collateral_e8 / scoring.E8,
            "firstActivityAt": facts.first_activity_at,
            "lastActivityAt": facts.last_activity_at,
            "repaymentCount": facts.repayment_count,
            "liquidationCount": facts.liquidation_count,
            "chainCount": facts.chain_count,
            "attestationCount": facts.attestation_count,
        },
    )


@api.get("/portfolio", tags=["protocol"])
def portfolio() -> dict:
    """Every known borrower, assessed and triaged exactly as the agent would."""
    c = client()
    assessments = []
    for addr in c.discover_borrowers():
        try:
            assessments.append(assess(c.position(addr)))
        except Exception as exc:
            log.warning("Skipping %s: %s", addr, exc)

    queue = triage(assessments)
    return {
        "count": len(assessments),
        "positions": [a.to_dict() for a in assessments],
        "actionQueue": [a.position.borrower for a in queue],
        "totalDebtAtRiskUsd": round(
            sum(a.debt_at_risk_usd for a in assessments if a.should_restructure), 2
        ),
        "totalLossAvertableUsd": round(sum(a.expected_loss_averted_usd for a in assessments), 2),
    }


@api.get("/restructurings", tags=["protocol"])
def restructurings(limit: int = 50) -> dict:
    """The protocol's public record of every autonomous intervention."""
    c = client()
    cfg = state["config"]
    dec = 10**cfg.asset_decimals

    events = list(c.restructuring_history())[-limit:]
    return {
        "count": len(events),
        "events": [
            {
                **e,
                "debtRetiredUsd": e["debtRetired"] / dec,
                "oldRatePct": e["oldRateBps"] / 100,
                "newRatePct": e["newRateBps"] / 100,
                "hfBefore": round(e["healthFactorBefore"] / scoring.WAD, 4),
                "hfAfter": round(e["healthFactorAfter"] / scoring.WAD, 4),
            }
            for e in reversed(events)
        ],
    }


@api.post("/agent/simulate/{address}", tags=["agent"])
def simulate(address: str) -> dict:
    """Dry-run a restructuring. Broadcasts nothing; returns what the vault would do."""
    c = client()
    if c.account is None:
        raise HTTPException(
            status_code=503,
            detail="No agent key configured; simulation needs a caller with RISK_AGENT_ROLE.",
        )

    result = c.simulate_restructure(address)
    if result is None:
        return {
            "possible": False,
            "reason": "The vault would reject this call — position not in the stress band, "
            "cooling down, or at its restructuring limit.",
        }

    hf_before, hf_after, retired = result
    cfg = state["config"]
    return {
        "possible": True,
        "healthFactorBefore": round(hf_before / scoring.WAD, 4),
        "healthFactorAfter": round(hf_after / scoring.WAD, 4),
        "debtRetiredUsd": retired / (10**cfg.asset_decimals),
    }


app.include_router(api)


@app.get("/", tags=["meta"])
def root() -> dict:
    return {
        "name": "Meritr Risk API",
        "description": "Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS",
        "chain": "Creditcoin EVM",
        "attestcoin": config.ATTESTCOIN_PRECOMPILE,
        "docs": "/docs",
    }
