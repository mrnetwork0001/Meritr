"""
Tests for the DeAI risk engine's decision logic.

The engine decides *whom* the agent helps and *in what order*. These tests pin the properties
that make those decisions defensible: the bands match the vault's own thresholds, an underwater
position is never proposed for restructuring (which would socialise bad debt into the reserve),
and the triage ordering actually prioritises the positions where relief does the most good.
"""

from __future__ import annotations

import math
from decimal import Decimal

import pytest

from agents import scoring
from agents.risk import (
    DEFAULT_ANNUAL_VOL_BPS,
    Position,
    RiskState,
    assess,
    buffer_to_liquidation,
    classify,
    days_to_liquidation,
    triage,
)
from agents.scoring import WAD


def make_position(
    borrower: str = "0x" + "11" * 20,
    hf: float = 1.5,
    active: bool = True,
    debt_usd: float = 10_000.0,
    score: int = 600,
    restructure_count: int = 0,
    restructurable: bool | None = None,
) -> Position:
    """Build a position with derived flags consistent with the vault's own classification.

    The health factor is converted through ``Decimal`` rather than binary float arithmetic:
    ``int(1.15 * 1e18)`` lands one wei *below* the exact stress threshold, which would make a
    boundary test fail against correct code. Onchain the comparison is exact, so the fixture
    has to be exact too.
    """
    hf_wad = int(Decimal(str(hf)) * WAD)
    liquidatable = active and hf_wad < scoring.LIQUIDATION_HF
    in_stress = active and not liquidatable and hf_wad < scoring.STRESS_HF
    if restructurable is None:
        restructurable = in_stress and restructure_count < 3

    return Position(
        borrower=borrower,
        active=active,
        principal=int(debt_usd * 10**6),
        interest_owed=0,
        collateral=10**19,
        debt=int(debt_usd * 10**6),
        rate_bps=scoring.apr_bps(score),
        health_factor=hf_wad if active else 2**256 - 1,
        score=score,
        market_rate_bps=scoring.apr_bps(score),
        collateral_value_e8=int(debt_usd * hf * scoring.E8),
        debt_value_e8=int(debt_usd * scoring.E8),
        restructure_count=restructure_count,
        last_restructure_at=0,
        stressed_since=0,
        maturity=0,
        in_stress_band=in_stress,
        liquidatable=liquidatable,
        restructurable=restructurable,
    )


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "hf,expected",
    [
        (0.85, RiskState.LIQUIDATABLE),
        (0.999, RiskState.LIQUIDATABLE),
        (1.00, RiskState.STRESSED),
        (1.10, RiskState.STRESSED),
        (1.1499, RiskState.STRESSED),
        (1.15, RiskState.WATCH),
        (1.29, RiskState.WATCH),
        (1.30, RiskState.HEALTHY),
        (3.00, RiskState.HEALTHY),
    ],
)
def test_bands_match_the_vault_thresholds(hf, expected):
    assert classify(make_position(hf=hf)) is expected


def test_inactive_loan_classifies_as_no_loan():
    assert classify(make_position(active=False)) is RiskState.NO_LOAN


# ---------------------------------------------------------------------------
# Buffer and time-to-liquidation
# ---------------------------------------------------------------------------


def test_buffer_is_the_drawdown_that_reaches_liquidation():
    # Health factor is linear in collateral price: HF 1.25 survives a 20% drop.
    assert buffer_to_liquidation(make_position(hf=1.25)) == pytest.approx(0.20, abs=1e-6)
    assert buffer_to_liquidation(make_position(hf=2.0)) == pytest.approx(0.50, abs=1e-6)


def test_buffer_is_zero_at_or_below_liquidation():
    assert buffer_to_liquidation(make_position(hf=1.0)) == 0.0
    assert buffer_to_liquidation(make_position(hf=0.9)) == 0.0


def test_buffer_shrinks_monotonically_as_health_falls():
    previous = 1.0
    for hf in [3.0, 2.0, 1.5, 1.3, 1.15, 1.05, 1.01]:
        current = buffer_to_liquidation(make_position(hf=hf))
        assert current < previous
        previous = current


def test_time_to_liquidation_shortens_as_health_falls():
    previous = float("inf")
    for hf in [2.0, 1.5, 1.2, 1.05, 1.01]:
        current = days_to_liquidation(make_position(hf=hf))
        assert current < previous, f"time-to-liquidation did not shorten at HF {hf}"
        previous = current


def test_time_to_liquidation_is_zero_when_already_underwater():
    assert days_to_liquidation(make_position(hf=0.95)) == 0.0


def test_higher_volatility_shortens_the_horizon():
    pos = make_position(hf=1.10)
    calm = days_to_liquidation(pos, annual_vol_bps=2_000)
    wild = days_to_liquidation(pos, annual_vol_bps=DEFAULT_ANNUAL_VOL_BPS)
    assert wild < calm


# ---------------------------------------------------------------------------
# Action selection
# ---------------------------------------------------------------------------


def test_only_stressed_positions_are_proposed_for_restructuring():
    assert assess(make_position(hf=1.08)).should_restructure is True
    assert assess(make_position(hf=1.50)).should_restructure is False
    assert assess(make_position(hf=1.20)).should_restructure is False
    assert assess(make_position(active=False)).should_restructure is False


def test_underwater_positions_are_never_proposed():
    """Restructuring an underwater loan would move a real loss onto the reserve."""
    a = assess(make_position(hf=0.92))
    assert a.state is RiskState.LIQUIDATABLE
    assert a.should_restructure is False
    assert "socialise" in a.rationale or "bad debt" in a.rationale


def test_a_position_the_vault_would_reject_is_not_proposed():
    a = assess(make_position(hf=1.08, restructure_count=3, restructurable=False))
    assert a.state is RiskState.STRESSED
    assert a.should_restructure is False
    assert "limit reached" in a.rationale


def test_every_assessment_carries_a_rationale():
    for hf in [0.9, 1.05, 1.2, 1.6]:
        assert assess(make_position(hf=hf)).rationale.strip()


# ---------------------------------------------------------------------------
# Triage
# ---------------------------------------------------------------------------


def test_triage_returns_only_actionable_positions():
    positions = [
        make_position(borrower="0x" + "aa" * 20, hf=1.05),
        make_position(borrower="0x" + "bb" * 20, hf=1.60),
        make_position(borrower="0x" + "cc" * 20, hf=0.80),
    ]
    queue = triage([assess(p) for p in positions])
    assert [a.position.borrower for a in queue] == ["0x" + "aa" * 20]


def test_triage_prioritises_larger_avertable_loss():
    """With a finite reserve, the order the agent works the queue in changes the outcome."""
    small = assess(make_position(borrower="0x" + "aa" * 20, hf=1.05, debt_usd=1_000))
    large = assess(make_position(borrower="0x" + "bb" * 20, hf=1.05, debt_usd=90_000))

    queue = triage([small, large])
    assert queue[0].position.borrower == "0x" + "bb" * 20
    assert queue[0].expected_loss_averted_usd > queue[1].expected_loss_averted_usd


def test_triage_breaks_ties_toward_the_most_urgent():
    """Equal debt, different runway - the one closer to liquidation goes first."""
    urgent = assess(make_position(borrower="0x" + "aa" * 20, hf=1.01, debt_usd=10_000))
    calmer = assess(make_position(borrower="0x" + "bb" * 20, hf=1.14, debt_usd=10_000))

    queue = triage([calmer, urgent])
    assert queue[0].position.borrower == "0x" + "aa" * 20


def test_triage_of_an_empty_book_is_empty():
    assert triage([]) == []


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def test_assessment_serialises_to_json_safe_values():
    import json

    a = assess(make_position(hf=1.08))
    payload = a.to_dict()
    json.dumps(payload)  # must not raise
    assert payload["state"] == "stressed"
    assert payload["shouldRestructure"] is True
    assert payload["tier"] == scoring.tier_of(a.position.score)


def test_infinite_horizon_serialises_as_null_not_nan():
    """`Infinity` is not valid JSON; a healthy position must not break the API response."""
    import json

    a = assess(make_position(hf=5.0))
    assert math.isinf(a.days_to_liquidation) or a.days_to_liquidation > 0
    payload = a.to_dict()
    text = json.dumps(payload)
    assert "Infinity" not in text and "NaN" not in text
