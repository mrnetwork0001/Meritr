"""
Meritr DeAI risk engine — the decision layer of the autonomous underwriter.

This module holds the part of the agent that actually *thinks*: it turns a raw position into a
risk classification, projects how long that position has before liquidation, estimates the loss
a restructuring would avert, and ranks a portfolio so that a finite reserve is spent where it
does the most good.

Why the agent needs judgement at all, given the vault re-derives every economic term on-chain:
the contract answers "what relief is this borrower entitled to?", but it has no view of the
portfolio and no memory of price dynamics. Choosing *whom to rescue first* when three positions
are stressed and the reserve can only carry one is exactly the decision that belongs off-chain,
where it can be revised without a redeploy. The chain remains the authority on amounts; the
agent is the authority on attention.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from . import scoring
from .scoring import BPS, WAD


class RiskState(str, Enum):
    """Where a position sits relative to the vault's health bands."""

    NO_LOAN = "no_loan"
    HEALTHY = "healthy"
    WATCH = "watch"          # above the stress band, but close enough to track
    STRESSED = "stressed"    # inside [1.00, 1.15) — the restructuring window
    LIQUIDATABLE = "liquidatable"


#: Above the stress band but below this, a position is worth monitoring closely.
WATCH_HF = 130 * WAD // 100

#: Assumed annualised volatility of the collateral asset, used to project time-to-liquidation.
#: A deployment with a real price feed should estimate this from realised returns instead; it is
#: a tunable prior, not a claim about any particular market.
DEFAULT_ANNUAL_VOL_BPS = 6_000  # 60%


@dataclass
class Position:
    """A borrower's vault position, as returned by ``MeritrVault.positionOf``."""

    borrower: str
    active: bool
    principal: int
    interest_owed: int
    collateral: int
    debt: int
    rate_bps: int
    health_factor: int
    score: int
    market_rate_bps: int
    collateral_value_e8: int
    debt_value_e8: int
    restructure_count: int
    last_restructure_at: int
    stressed_since: int
    maturity: int
    in_stress_band: bool
    liquidatable: bool
    restructurable: bool

    @classmethod
    def from_chain(cls, borrower: str, view) -> "Position":
        """Build from the ``PositionView`` tuple the vault returns."""
        loan = view[0]
        return cls(
            borrower=borrower,
            active=bool(loan[0]),
            restructure_count=int(loan[1]),
            rate_bps=int(loan[3]),
            maturity=int(loan[6]),
            last_restructure_at=int(loan[7]),
            stressed_since=int(loan[8]),
            principal=int(loan[9]),
            interest_owed=int(loan[10]),
            collateral=int(loan[11]),
            debt=int(view[1]),
            health_factor=int(view[2]),
            score=int(view[3]),
            market_rate_bps=int(view[4]),
            collateral_value_e8=int(view[5]),
            debt_value_e8=int(view[6]),
            in_stress_band=bool(view[7]),
            liquidatable=bool(view[8]),
            restructurable=bool(view[9]),
        )

    @property
    def hf(self) -> float:
        """Health factor as a float, for display only — never for decisions."""
        if self.health_factor > 10**30:
            return float("inf")
        return self.health_factor / WAD


@dataclass
class Assessment:
    """The agent's full, explainable verdict on one position."""

    position: Position
    state: RiskState
    #: Fractional collateral drawdown that would push this position to liquidation.
    buffer_to_liquidation: float
    #: Rough days until liquidation under the assumed volatility. ``inf`` when safe.
    days_to_liquidation: float
    #: Debt at risk, in whole USD, if this position liquidates.
    debt_at_risk_usd: float
    #: Expected loss averted by intervening now, in whole USD.
    expected_loss_averted_usd: float
    should_restructure: bool
    rationale: str

    def to_dict(self) -> dict:
        return {
            "borrower": self.position.borrower,
            "state": self.state.value,
            "healthFactor": round(self.position.hf, 4),
            "score": self.position.score,
            "tier": scoring.tier_of(self.position.score),
            "rateBps": self.position.rate_bps,
            "marketRateBps": self.position.market_rate_bps,
            "debtUsd": round(self.position.debt_value_e8 / scoring.E8, 2),
            "collateralUsd": round(self.position.collateral_value_e8 / scoring.E8, 2),
            "bufferToLiquidation": round(self.buffer_to_liquidation, 4),
            "daysToLiquidation": (
                None if math.isinf(self.days_to_liquidation) else round(self.days_to_liquidation, 2)
            ),
            "debtAtRiskUsd": round(self.debt_at_risk_usd, 2),
            "expectedLossAvertedUsd": round(self.expected_loss_averted_usd, 2),
            "shouldRestructure": self.should_restructure,
            "restructureCount": self.position.restructure_count,
            "rationale": self.rationale,
        }


def classify(pos: Position) -> RiskState:
    """Bucket a position into a risk band."""
    if not pos.active:
        return RiskState.NO_LOAN
    if pos.liquidatable:
        return RiskState.LIQUIDATABLE
    if pos.in_stress_band:
        return RiskState.STRESSED
    if pos.health_factor < WATCH_HF:
        return RiskState.WATCH
    return RiskState.HEALTHY


def buffer_to_liquidation(pos: Position) -> float:
    """Fractional collateral price drop this position can absorb before HF reaches 1.

    ``HF`` is linear in collateral price, so a position at HF = 1.20 survives a 1 - 1/1.20 =
    16.7% drawdown. Returns 0 for a position already at or below the liquidation threshold.
    """
    if not pos.active or pos.health_factor == 0:
        return 0.0
    if pos.health_factor > 10**30:
        return 1.0
    hf = pos.health_factor / WAD
    if hf <= 1.0:
        return 0.0
    return 1.0 - (1.0 / hf)


def days_to_liquidation(pos: Position, annual_vol_bps: int = DEFAULT_ANNUAL_VOL_BPS) -> float:
    """Expected days until the collateral drawdown reaches the liquidation buffer.

    Treats the collateral price as a driftless random walk: an asset with annualised volatility
    ``sigma`` typically moves ``sigma * sqrt(t)`` over a horizon ``t`` in years. Inverting for
    the horizon at which the typical move equals the position's buffer gives
    ``t = (buffer / sigma)^2``.

    This is a triage heuristic that ranks positions, not a risk model that prices them. It
    deliberately ignores drift, fat tails and correlation; its only job is to answer "which of
    these stressed borrowers runs out of room first?" — and for that, monotonicity in the buffer
    is the property that matters.
    """
    buffer = buffer_to_liquidation(pos)
    if buffer <= 0:
        return 0.0
    if buffer >= 1.0:
        return float("inf")
    sigma = annual_vol_bps / BPS
    if sigma <= 0:
        return float("inf")
    years = (buffer / sigma) ** 2
    return years * 365.0


def expected_loss_averted(pos: Position, state: RiskState) -> float:
    """Estimated USD loss avoided by restructuring this position now.

    Losses from a liquidation are not the whole debt: the protocol recovers most of it by
    seizing collateral. What is actually destroyed is the liquidation bonus paid away to the
    liquidator plus the borrower's forfeited equity — the part restructuring genuinely saves.
    Weighting that by the probability of reaching liquidation within the next week turns a
    dollar figure into a ranking signal.
    """
    if state not in (RiskState.STRESSED, RiskState.WATCH):
        return 0.0

    debt_usd = pos.debt_value_e8 / scoring.E8
    # 5% liquidation bonus is pure deadweight to the borrower-protocol pair.
    deadweight = debt_usd * 0.05

    days = days_to_liquidation(pos)
    if math.isinf(days):
        probability = 0.0
    else:
        # Saturating hazard over a one-week horizon: sooner means likelier.
        probability = min(1.0, 7.0 / max(days, 0.5))

    return deadweight * probability


def assess(pos: Position) -> Assessment:
    """Produce the agent's full verdict, including a human-readable rationale."""
    state = classify(pos)
    buffer = buffer_to_liquidation(pos)
    days = days_to_liquidation(pos)
    debt_usd = pos.debt_value_e8 / scoring.E8
    averted = expected_loss_averted(pos, state)

    should = False
    if state is RiskState.STRESSED and pos.restructurable:
        should = True
        rationale = (
            f"Health factor {pos.hf:.3f} sits inside the restructuring band; "
            f"{buffer:.1%} of collateral cushion remains (~{days:.1f}d at assumed volatility). "
            f"Intervening averts an estimated ${averted:,.0f} of deadweight liquidation cost "
            f"on ${debt_usd:,.0f} of debt. Score {pos.score} "
            f"({scoring.tier_of(pos.score)}) earns {pos.market_rate_bps / 100:.2f}% APR versus "
            f"{pos.rate_bps / 100:.2f}% currently charged."
        )
    elif state is RiskState.STRESSED:
        reason = (
            "restructuring limit reached"
            if pos.restructure_count >= 3
            else "cooldown still active"
        )
        rationale = (
            f"Health factor {pos.hf:.3f} is inside the restructuring band but the vault will "
            f"reject the call: {reason}. Monitoring for liquidation instead."
        )
    elif state is RiskState.LIQUIDATABLE:
        rationale = (
            f"Health factor {pos.hf:.3f} is already below 1.0. Restructuring is deliberately "
            "unavailable here — absorbing an underwater position would socialise bad debt into "
            "the reserve. Liquidation is the correct path."
        )
    elif state is RiskState.WATCH:
        rationale = (
            f"Health factor {pos.hf:.3f} is above the restructuring band but within watch "
            f"range; {buffer:.1%} cushion, ~{days:.1f}d of headroom. No action yet."
        )
    elif state is RiskState.NO_LOAN:
        rationale = "No active loan."
    else:
        rationale = (
            f"Health factor {pos.hf:.3f} is comfortably healthy "
            f"({buffer:.1%} collateral cushion). No action."
        )

    return Assessment(
        position=pos,
        state=state,
        buffer_to_liquidation=buffer,
        days_to_liquidation=days,
        debt_at_risk_usd=debt_usd,
        expected_loss_averted_usd=averted,
        should_restructure=should,
        rationale=rationale,
    )


def triage(assessments: list[Assessment]) -> list[Assessment]:
    """Order actionable positions by the value of acting on them.

    The restructuring reserve is finite and each intervention draws it down, so the order the
    agent works the queue in changes the outcome. Ranking by expected loss averted — most
    urgent and most valuable first — beats first-come ordering whenever the reserve binds.
    """
    actionable = [a for a in assessments if a.should_restructure]
    return sorted(
        actionable,
        key=lambda a: (-a.expected_loss_averted_usd, a.days_to_liquidation, -a.debt_at_risk_usd),
    )
