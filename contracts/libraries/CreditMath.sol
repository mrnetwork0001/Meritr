// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/**
 * @title CreditMath
 * @author Meritr (Ifeanyichukwu Onwo)
 * @notice Deterministic, integer-only credit scoring and risk math shared by every Meritr
 *         component. The off-chain DeAI underwriting agent (`agents/scoring.py`) mirrors these
 *         formulas exactly, so any score or interest rate the agent proposes can be
 *         independently recomputed and enforced on-chain. The agent is therefore an
 *         *optimizer*, never an oracle: it cannot assert a score the chain disagrees with.
 *
 * @dev All arithmetic is integer and rounding-stable. No floating point, no external calls.
 *      Fixed-point conventions used throughout Meritr:
 *        - USD values  : 1e8  ("E8",  Chainlink-style)
 *        - Ratios/rates: 1e4  ("BPS", basis points)
 *        - Health factor: 1e18 ("WAD")
 */
library CreditMath {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant E8 = 1e8;

    /// @notice Score domain. Mirrors the familiar 300-900 consumer-credit range.
    uint16 internal constant MIN_SCORE = 300;
    uint16 internal constant MAX_SCORE = 900;
    uint16 internal constant SCORE_SPAN = MAX_SCORE - MIN_SCORE; // 600

    /// @notice Component weights in basis points. MUST sum to BPS.
    uint256 internal constant W_REPAYMENT = 3_500; // 35% - proven repayment volume & count
    uint256 internal constant W_COLLATERAL = 2_500; // 25% - attested cross-chain asset depth
    uint256 internal constant W_MATURITY = 1_500; // 15% - wallet age / history length
    uint256 internal constant W_DIVERSITY = 1_000; // 10% - breadth of attested source chains
    uint256 internal constant W_SAFETY = 1_500; // 15% - absence of liquidation events

    /// @notice Saturation points: the value at which a component earns full marks.
    uint256 internal constant SAT_REPAID_USD_E8 = 250_000 * E8; // $250k lifetime repaid
    uint256 internal constant SAT_REPAY_COUNT = 40; // 40 discrete repayments
    uint256 internal constant SAT_COLLATERAL_USD_E8 = 150_000 * E8; // $150k attested collateral
    uint256 internal constant SAT_MATURITY_SECONDS = 730 days; // 2 years of history
    uint256 internal constant SAT_CHAIN_COUNT = 4; // 4 distinct source chains

    /// @notice Each liquidation burns this share of the safety component.
    uint256 internal constant LIQUIDATION_PENALTY_BPS = 3_000; // 30% per event, compounding

    // Interest-rate curve bounds.
    uint256 internal constant MIN_APR_BPS = 400; // 4.00% for a pristine 900 score
    uint256 internal constant MAX_APR_BPS = 2_400; // 24.00% for a floor 300 score

    // Loan-to-value curve bounds (how much a borrower may draw per $1 collateral).
    uint256 internal constant MIN_LTV_BPS = 3_000; // 30% at score 300
    uint256 internal constant MAX_LTV_BPS = 8_000; // 80% at score 900

    /// @notice A position is liquidatable below this health factor.
    uint256 internal constant LIQUIDATION_HF = WAD; // 1.0
    /// @notice The autonomous agent is permitted to intervene inside [LIQUIDATION_HF, STRESS_HF).
    uint256 internal constant STRESS_HF = 1.15e18; // 1.15
    /// @notice Restructuring targets this health factor - comfortably clear of liquidation.
    uint256 internal constant TARGET_HF = 1.35e18; // 1.35

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /**
     * @notice The raw, cryptographically-attested inputs to a credit score.
     * @dev Every field originates from a proof verified by the Attestcoin native query
     *      verifier precompile (`0xFD2`). Nothing here is self-reported.
     */
    struct CreditFacts {
        uint128 totalRepaidE8; // lifetime repaid, USD 1e8
        uint128 totalCollateralE8; // attested collateral supplied, USD 1e8
        uint64 firstActivityAt; // unix seconds of earliest attested activity
        uint64 lastActivityAt; // unix seconds of most recent attested activity
        uint32 repaymentCount; // number of distinct attested repayments
        uint32 liquidationCount; // number of attested liquidation events
        uint32 chainCount; // distinct source chains with >= 1 attestation
        uint32 attestationCount; // total proofs ingested for this borrower
    }

    /// @notice Per-component score contributions, surfaced for UI and agent explainability.
    struct ScoreBreakdown {
        uint16 score; // final 300-900 score
        uint16 repaymentPts; // contribution, in score points
        uint16 collateralPts;
        uint16 maturityPts;
        uint16 diversityPts;
        uint16 safetyPts;
    }

    // ---------------------------------------------------------------------
    // Scoring
    // ---------------------------------------------------------------------

    /**
     * @notice Compute the Meritr ZK-Credit score from attested cross-chain facts.
     * @param f    Attested credit facts for the borrower.
     * @param nowTs Evaluation timestamp (block time on-chain; wall clock in the agent).
     * @return b   Final score plus its per-component breakdown.
     *
     * @dev Each component is normalised to [0, BPS] then weighted. A borrower with no
     *      attestations at all scores exactly MIN_SCORE - there is no unearned credit.
     */
    function score(CreditFacts memory f, uint256 nowTs) internal pure returns (ScoreBreakdown memory b) {
        // --- Repayment: blend of value repaid and repayment frequency ---------
        uint256 valueRatio = _saturate(f.totalRepaidE8, SAT_REPAID_USD_E8);
        uint256 countRatio = _saturate(f.repaymentCount, SAT_REPAY_COUNT);
        // Value dominates, but a long tail of small on-time repayments still counts.
        uint256 repaymentRatio = (valueRatio * 6_000 + countRatio * 4_000) / BPS;

        // --- Collateral depth -------------------------------------------------
        uint256 collateralRatio = _saturate(f.totalCollateralE8, SAT_COLLATERAL_USD_E8);

        // --- Maturity: how long this borrower has been observably active ------
        uint256 maturityRatio;
        if (f.firstActivityAt != 0 && nowTs > f.firstActivityAt) {
            maturityRatio = _saturate(nowTs - f.firstActivityAt, SAT_MATURITY_SECONDS);
        }

        // --- Diversity: credit proven across many chains is harder to fake ----
        uint256 diversityRatio = _saturate(f.chainCount, SAT_CHAIN_COUNT);

        // --- Safety: full marks until liquidations appear, then decays --------
        uint256 safetyRatio = BPS;
        uint256 liqs = f.liquidationCount;
        for (uint256 i; i < liqs && safetyRatio > 0; ++i) {
            safetyRatio = (safetyRatio * (BPS - LIQUIDATION_PENALTY_BPS)) / BPS;
        }
        // A borrower with zero attested history has not *proven* safety, only absence of
        // evidence. Withhold the safety component until at least one proof exists.
        if (f.attestationCount == 0) safetyRatio = 0;

        b.repaymentPts = uint16((repaymentRatio * W_REPAYMENT * SCORE_SPAN) / (BPS * BPS));
        b.collateralPts = uint16((collateralRatio * W_COLLATERAL * SCORE_SPAN) / (BPS * BPS));
        b.maturityPts = uint16((maturityRatio * W_MATURITY * SCORE_SPAN) / (BPS * BPS));
        b.diversityPts = uint16((diversityRatio * W_DIVERSITY * SCORE_SPAN) / (BPS * BPS));
        b.safetyPts = uint16((safetyRatio * W_SAFETY * SCORE_SPAN) / (BPS * BPS));

        b.score =
            MIN_SCORE + b.repaymentPts + b.collateralPts + b.maturityPts + b.diversityPts + b.safetyPts;

        // Defensive clamp: weights are constant and sum to BPS, so this cannot trip today,
        // but it keeps the invariant enforced if the weights are ever retuned.
        if (b.score > MAX_SCORE) b.score = MAX_SCORE;
    }

    // ---------------------------------------------------------------------
    // Pricing curves
    // ---------------------------------------------------------------------

    /**
     * @notice Risk-based APR. Linear in score, descending from MAX_APR to MIN_APR.
     * @dev Monotonically non-increasing in `s`: a better score can never cost more.
     */
    function aprBps(uint16 s) internal pure returns (uint256) {
        uint256 clamped = _clampScore(s);
        uint256 above = clamped - MIN_SCORE; // 0 .. 600
        return MAX_APR_BPS - ((MAX_APR_BPS - MIN_APR_BPS) * above) / SCORE_SPAN;
    }

    /**
     * @notice Maximum loan-to-value the protocol extends at a given score.
     * @dev Monotonically non-decreasing in `s`.
     */
    function maxLtvBps(uint16 s) internal pure returns (uint256) {
        uint256 clamped = _clampScore(s);
        uint256 above = clamped - MIN_SCORE;
        return MIN_LTV_BPS + ((MAX_LTV_BPS - MIN_LTV_BPS) * above) / SCORE_SPAN;
    }

    // ---------------------------------------------------------------------
    // Position risk
    // ---------------------------------------------------------------------

    /**
     * @notice Health factor of a debt position, in WAD.
     * @param collateralE8      Collateral value, USD 1e8.
     * @param debtE8            Outstanding debt (principal + accrued interest), USD 1e8.
     * @param liqThresholdBps   Liquidation threshold for this position.
     * @return hf               `collateral * threshold / debt`, or `type(uint256).max` if debt-free.
     */
    function healthFactor(uint256 collateralE8, uint256 debtE8, uint256 liqThresholdBps)
        internal
        pure
        returns (uint256 hf)
    {
        if (debtE8 == 0) return type(uint256).max;
        hf = (collateralE8 * liqThresholdBps * WAD) / (debtE8 * BPS);
    }

    /**
     * @notice Simple (non-compounding) interest accrued over an elapsed period.
     * @dev Meritr accrues linearly per second. Linear accrual is the conservative choice for
     *      a restructuring protocol: it never surprises a stressed borrower with a
     *      compounding step, and it makes the agent's projected debt exactly reproducible.
     */
    function accrueInterest(uint256 principalE8, uint256 rateBps, uint256 elapsedSeconds)
        internal
        pure
        returns (uint256)
    {
        return (principalE8 * rateBps * elapsedSeconds) / (BPS * 365 days);
    }

    /**
     * @notice The debt level that would restore `targetHf` for a given collateral position.
     * @dev Used by the restructuring engine to size a micro-refinance top-up. Returns the
     *      *maximum sustainable debt*, so `currentDebt - sustainableDebt` is the shortfall
     *      the vault must absorb to bring the borrower back to health.
     */
    function sustainableDebtE8(uint256 collateralE8, uint256 liqThresholdBps, uint256 targetHf)
        internal
        pure
        returns (uint256)
    {
        if (targetHf == 0) return type(uint256).max;
        return (collateralE8 * liqThresholdBps * WAD) / (targetHf * BPS);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /// @dev Normalise `value` against `saturation` into [0, BPS], clamping at the top.
    function _saturate(uint256 value, uint256 saturation) private pure returns (uint256) {
        if (saturation == 0) return 0;
        if (value >= saturation) return BPS;
        return (value * BPS) / saturation;
    }

    function _clampScore(uint16 s) private pure returns (uint256) {
        if (s < MIN_SCORE) return MIN_SCORE;
        if (s > MAX_SCORE) return MAX_SCORE;
        return s;
    }
}
