"""
Cross-language parity: ``agents/scoring.py`` must equal ``contracts/libraries/CreditMath.sol``.

This is the suite that protects Meritr's central design claim. ``MeritrVault.restructure`` takes
no economic parameters - it re-derives every rate, loan-to-value and relief amount onchain from
the borrower's attested score. The off-chain agent is only useful if it can predict that
derivation exactly, including integer-truncation behaviour. A one-wei divergence here would
silently turn confident agent decisions into reverted transactions.

Vectors come from the real deployed library via ``scripts/generateParityVectors.js``, so this
compares Python against actual EVM output rather than against a second Python transcription.

Regenerate after any change to CreditMath.sol:
    npx hardhat run scripts/generateParityVectors.js
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agents import scoring
from agents.scoring import CreditFacts

FIXTURE = Path(__file__).parent / "fixtures" / "parity_vectors.json"


@pytest.fixture(scope="module")
def vectors() -> dict:
    if not FIXTURE.exists():
        pytest.skip(
            f"{FIXTURE} missing. Generate it with:\n"
            "  npx hardhat run scripts/generateParityVectors.js"
        )
    return json.loads(FIXTURE.read_text())


def _facts(raw: dict) -> CreditFacts:
    return CreditFacts(
        total_repaid_e8=int(raw["totalRepaidE8"]),
        total_collateral_e8=int(raw["totalCollateralE8"]),
        first_activity_at=int(raw["firstActivityAt"]),
        last_activity_at=int(raw["lastActivityAt"]),
        repayment_count=int(raw["repaymentCount"]),
        liquidation_count=int(raw["liquidationCount"]),
        chain_count=int(raw["chainCount"]),
        attestation_count=int(raw["attestationCount"]),
    )


def test_fixture_is_substantial(vectors):
    """Guard against a truncated or stale fixture silently weakening the suite."""
    assert len(vectors["scoreVectors"]) >= 100
    assert len(vectors["curve"]) >= 20


def test_score_matches_onchain_exactly(vectors):
    """Every component of every vector, not just the final score."""
    mismatches = []
    for i, v in enumerate(vectors["scoreVectors"]):
        got = scoring.score(_facts(v["facts"]), int(v["nowTs"]))
        expected = (
            v["score"],
            v["repaymentPts"],
            v["collateralPts"],
            v["maturityPts"],
            v["diversityPts"],
            v["safetyPts"],
        )
        actual = (
            got.score,
            got.repayment_pts,
            got.collateral_pts,
            got.maturity_pts,
            got.diversity_pts,
            got.safety_pts,
        )
        if expected != actual:
            mismatches.append(f"vector {i}: solidity={expected} python={actual} facts={v['facts']}")

    assert not mismatches, "CreditMath divergence:\n" + "\n".join(mismatches[:10])


def test_apr_and_ltv_curves_match(vectors):
    for v in vectors["scoreVectors"]:
        assert scoring.apr_bps(v["score"]) == v["aprBps"]
        assert scoring.max_ltv_bps(v["score"]) == v["maxLtvBps"]

    for point in vectors["curve"]:
        s = point["score"]
        assert scoring.apr_bps(s) == point["aprBps"], f"APR mismatch at score {s}"
        assert scoring.max_ltv_bps(s) == point["maxLtvBps"], f"LTV mismatch at score {s}"


def test_health_factor_and_sustainable_debt_match(vectors):
    for case in vectors["risk"]:
        coll = int(case["collateralE8"])
        debt = int(case["debtE8"])
        thr = case["liqThresholdBps"]
        assert scoring.health_factor(coll, debt, thr) == int(case["healthFactor"])
        assert (
            scoring.sustainable_debt_e8(coll, thr, scoring.TARGET_HF)
            == int(case["sustainableDebtE8"])
        )


def test_interest_accrual_matches(vectors):
    for case in vectors["interest"]:
        assert (
            scoring.accrue_interest(
                int(case["principalE8"]), case["rateBps"], case["elapsed"]
            )
            == int(case["accrued"])
        )


# ---------------------------------------------------------------------------
# Model invariants - properties that must hold regardless of the fixture
# ---------------------------------------------------------------------------


def test_weights_sum_to_one():
    total = (
        scoring.W_REPAYMENT
        + scoring.W_COLLATERAL
        + scoring.W_MATURITY
        + scoring.W_DIVERSITY
        + scoring.W_SAFETY
    )
    assert total == scoring.BPS


def test_unattested_wallet_gets_no_unearned_credit():
    assert scoring.score(CreditFacts()).score == scoring.MIN_SCORE


def test_score_stays_inside_its_domain(vectors):
    for v in vectors["scoreVectors"]:
        assert scoring.MIN_SCORE <= v["score"] <= scoring.MAX_SCORE


def test_apr_is_monotonically_non_increasing_in_score():
    """A better score must never cost a borrower more."""
    previous = scoring.apr_bps(scoring.MIN_SCORE)
    for s in range(scoring.MIN_SCORE, scoring.MAX_SCORE + 1):
        current = scoring.apr_bps(s)
        assert current <= previous, f"APR rose at score {s}"
        previous = current
    assert scoring.apr_bps(scoring.MAX_SCORE) == scoring.MIN_APR_BPS
    assert scoring.apr_bps(scoring.MIN_SCORE) == scoring.MAX_APR_BPS


def test_ltv_is_monotonically_non_decreasing_in_score():
    previous = scoring.max_ltv_bps(scoring.MIN_SCORE)
    for s in range(scoring.MIN_SCORE, scoring.MAX_SCORE + 1):
        current = scoring.max_ltv_bps(s)
        assert current >= previous, f"LTV fell at score {s}"
        previous = current


def test_curves_clamp_outside_the_score_domain():
    assert scoring.apr_bps(0) == scoring.MAX_APR_BPS
    assert scoring.apr_bps(65535) == scoring.MIN_APR_BPS
    assert scoring.max_ltv_bps(0) == scoring.MIN_LTV_BPS
    assert scoring.max_ltv_bps(65535) == scoring.MAX_LTV_BPS


def test_liquidations_strictly_reduce_the_score():
    base = CreditFacts(
        total_repaid_e8=100_000 * scoring.E8,
        first_activity_at=1,
        repayment_count=20,
        chain_count=3,
        attestation_count=25,
    )
    clean = scoring.score(base, 1_800_000_000).score
    for n in range(1, 5):
        scarred = scoring.score(
            CreditFacts(**{**base.__dict__, "liquidation_count": n}), 1_800_000_000
        ).score
        assert scarred < clean, f"{n} liquidation(s) did not reduce the score"


def test_more_proven_repayment_never_lowers_the_score():
    """Monotonicity in repayment volume - the property borrowers are being asked to trust."""
    previous = 0
    for usd in range(0, 400_000, 10_000):
        s = scoring.score(
            CreditFacts(
                total_repaid_e8=usd * scoring.E8,
                first_activity_at=1,
                repayment_count=10,
                chain_count=2,
                attestation_count=10,
            ),
            1_800_000_000,
        ).score
        assert s >= previous
        previous = s
