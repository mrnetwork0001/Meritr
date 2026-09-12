"""
Meritr ZK-Credit scoring - the Python mirror of ``contracts/libraries/CreditMath.sol``.

Every constant, weight and rounding step below matches the Solidity library exactly, including
its integer (floor) division. That parity is a design requirement, not a convenience:
``MeritrVault.restructure`` re-derives each economic term onchain from the borrower's attested
score, so the agent can only usefully act if it predicts the chain's own arithmetic bit for bit.
``tests/test_parity.py`` asserts the two implementations agree across a randomised sweep, and CI
should treat a divergence as a build failure rather than a rounding curiosity.

All arithmetic is on Python ``int``, which is arbitrary-precision, so the fixed-point scales
below never lose accuracy the way ``float`` would.

Fixed-point conventions:
    E8  -> USD values, 1e8
    BPS -> ratios and rates, 1e4
    WAD -> health factors, 1e18
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

BPS = 10_000
WAD = 10**18
E8 = 10**8

MIN_SCORE = 300
MAX_SCORE = 900
SCORE_SPAN = MAX_SCORE - MIN_SCORE

# Component weights, basis points. Must sum to BPS.
W_REPAYMENT = 3_500
W_COLLATERAL = 2_500
W_MATURITY = 1_500
W_DIVERSITY = 1_000
W_SAFETY = 1_500

# Saturation points: the value at which a component earns full marks.
SAT_REPAID_USD_E8 = 250_000 * E8
SAT_REPAY_COUNT = 40
SAT_COLLATERAL_USD_E8 = 150_000 * E8
SAT_MATURITY_SECONDS = 730 * 24 * 3600
SAT_CHAIN_COUNT = 4

LIQUIDATION_PENALTY_BPS = 3_000

MIN_APR_BPS = 400
MAX_APR_BPS = 2_400
MIN_LTV_BPS = 3_000
MAX_LTV_BPS = 8_000

LIQUIDATION_HF = WAD
STRESS_HF = 115 * WAD // 100
TARGET_HF = 135 * WAD // 100

DAY = 24 * 3600
YEAR = 365 * DAY


@dataclass(frozen=True)
class CreditFacts:
    """Cryptographically attested cross-chain inputs to a credit score.

    Mirrors ``CreditMath.CreditFacts``. Every field originates from a transaction proven
    through the Attestcoin native query verifier precompile at ``0xFD2``; nothing here is
    self-reported by a borrower.
    """

    total_repaid_e8: int = 0
    total_collateral_e8: int = 0
    first_activity_at: int = 0
    last_activity_at: int = 0
    repayment_count: int = 0
    liquidation_count: int = 0
    chain_count: int = 0
    attestation_count: int = 0

    @classmethod
    def from_chain(cls, tup) -> "CreditFacts":
        """Build from the tuple returned by ``MeritrAttestor.factsOf``."""
        return cls(
            total_repaid_e8=int(tup[0]),
            total_collateral_e8=int(tup[1]),
            first_activity_at=int(tup[2]),
            last_activity_at=int(tup[3]),
            repayment_count=int(tup[4]),
            liquidation_count=int(tup[5]),
            chain_count=int(tup[6]),
            attestation_count=int(tup[7]),
        )


@dataclass(frozen=True)
class ScoreBreakdown:
    """Per-component score contributions, for explainable underwriting."""

    score: int
    repayment_pts: int
    collateral_pts: int
    maturity_pts: int
    diversity_pts: int
    safety_pts: int

    def explain(self) -> list[tuple[str, int, int]]:
        """(component, points earned, points available) - drives the UI's score breakdown."""
        return [
            ("Repayment history", self.repayment_pts, W_REPAYMENT * SCORE_SPAN // BPS),
            ("Cross-chain collateral", self.collateral_pts, W_COLLATERAL * SCORE_SPAN // BPS),
            ("Wallet maturity", self.maturity_pts, W_MATURITY * SCORE_SPAN // BPS),
            ("Chain diversity", self.diversity_pts, W_DIVERSITY * SCORE_SPAN // BPS),
            ("Liquidation safety", self.safety_pts, W_SAFETY * SCORE_SPAN // BPS),
        ]


def _saturate(value: int, saturation: int) -> int:
    """Normalise ``value`` against ``saturation`` into [0, BPS], clamping at the top."""
    if saturation == 0:
        return 0
    if value >= saturation:
        return BPS
    return (value * BPS) // saturation


def score(facts: CreditFacts, now_ts: int | None = None) -> ScoreBreakdown:
    """Compute the ZK-Credit score. Byte-for-byte equivalent to ``CreditMath.score``."""
    if now_ts is None:
        now_ts = int(time.time())

    value_ratio = _saturate(facts.total_repaid_e8, SAT_REPAID_USD_E8)
    count_ratio = _saturate(facts.repayment_count, SAT_REPAY_COUNT)
    repayment_ratio = (value_ratio * 6_000 + count_ratio * 4_000) // BPS

    collateral_ratio = _saturate(facts.total_collateral_e8, SAT_COLLATERAL_USD_E8)

    maturity_ratio = 0
    if facts.first_activity_at != 0 and now_ts > facts.first_activity_at:
        maturity_ratio = _saturate(now_ts - facts.first_activity_at, SAT_MATURITY_SECONDS)

    diversity_ratio = _saturate(facts.chain_count, SAT_CHAIN_COUNT)

    safety_ratio = BPS
    for _ in range(facts.liquidation_count):
        if safety_ratio == 0:
            break
        safety_ratio = (safety_ratio * (BPS - LIQUIDATION_PENALTY_BPS)) // BPS
    # No proofs means safety is unproven, not established.
    if facts.attestation_count == 0:
        safety_ratio = 0

    def pts(ratio: int, weight: int) -> int:
        return (ratio * weight * SCORE_SPAN) // (BPS * BPS)

    repayment_pts = pts(repayment_ratio, W_REPAYMENT)
    collateral_pts = pts(collateral_ratio, W_COLLATERAL)
    maturity_pts = pts(maturity_ratio, W_MATURITY)
    diversity_pts = pts(diversity_ratio, W_DIVERSITY)
    safety_pts = pts(safety_ratio, W_SAFETY)

    total = MIN_SCORE + repayment_pts + collateral_pts + maturity_pts + diversity_pts + safety_pts
    total = min(total, MAX_SCORE)

    return ScoreBreakdown(
        score=total,
        repayment_pts=repayment_pts,
        collateral_pts=collateral_pts,
        maturity_pts=maturity_pts,
        diversity_pts=diversity_pts,
        safety_pts=safety_pts,
    )


def _clamp_score(s: int) -> int:
    return max(MIN_SCORE, min(MAX_SCORE, s))


def apr_bps(s: int) -> int:
    """Risk-based APR, descending linearly in score."""
    above = _clamp_score(s) - MIN_SCORE
    return MAX_APR_BPS - ((MAX_APR_BPS - MIN_APR_BPS) * above) // SCORE_SPAN


def max_ltv_bps(s: int) -> int:
    """Maximum loan-to-value extended at a given score."""
    above = _clamp_score(s) - MIN_SCORE
    return MIN_LTV_BPS + ((MAX_LTV_BPS - MIN_LTV_BPS) * above) // SCORE_SPAN


def health_factor(collateral_e8: int, debt_e8: int, liq_threshold_bps: int) -> int:
    """Health factor in WAD. Debt-free positions return the max sentinel, as onchain."""
    if debt_e8 == 0:
        return 2**256 - 1
    return (collateral_e8 * liq_threshold_bps * WAD) // (debt_e8 * BPS)


def accrue_interest(principal_e8: int, rate_bps: int, elapsed_seconds: int) -> int:
    """Linear (non-compounding) interest, matching the vault's accrual."""
    return (principal_e8 * rate_bps * elapsed_seconds) // (BPS * YEAR)


def sustainable_debt_e8(collateral_e8: int, liq_threshold_bps: int, target_hf: int) -> int:
    """Maximum debt consistent with ``target_hf`` for a given collateral position."""
    if target_hf == 0:
        return 2**256 - 1
    return (collateral_e8 * liq_threshold_bps * WAD) // (target_hf * BPS)


def tier_of(s: int) -> str:
    """Passport tier band. Mirrors ``MeritrPassport._tierOf``."""
    if s >= 820:
        return "Diamond"
    if s >= 740:
        return "Platinum"
    if s >= 650:
        return "Gold"
    if s >= 520:
        return "Silver"
    return "Bronze"
