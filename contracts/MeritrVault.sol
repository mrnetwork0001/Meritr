// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CreditMath} from "./libraries/CreditMath.sol";
import {IMeritrAttestor} from "./interfaces/IMeritrAttestor.sol";
import {MeritrPassport} from "./MeritrPassport.sol";

/**
 * @title MeritrVault
 * @author Meritr (Ifeanyichukwu Onwo)
 * @notice Subsystems 2 & 3 of 4 - the autonomous debt-restructuring credit vault.
 *
 * @dev Lenders supply `ASSET` and earn interest. Borrowers post `COLLATERAL` and draw credit at
 *      a rate and loan-to-value set by their Attestcoin-verified cross-chain credit score, so a
 *      borrower with proven repayment history on Ethereum or Base gets better terms on
 *      Creditcoin than an anonymous wallet - which is the entire point of a cross-chain credit
 *      memory.
 *
 *      **The restructuring thesis.** Every other on-chain lending market answers borrower
 *      distress with exactly one action: liquidation. That destroys borrower equity, dumps
 *      collateral into a falling market and permanently ends a paying customer relationship
 *      over what is often a temporary dip. Meritr inserts a *stress band* between healthy and
 *      liquidatable. Inside that band an autonomous agent restructures instead of seizing:
 *      it cuts the rate toward the borrower's earned floor, extends the term, and if needed
 *      draws on a protocol reserve to retire debt down to a safe health factor.
 *
 *      **The agent cannot lie.** This is the load-bearing security property. `restructure`
 *      accepts no numbers from its caller - not a score, not a rate, not an amount. The
 *      contract re-reads the borrower's score from `ATTESTOR` (whose every input carries an
 *      Attestcoin `0xFD2` proof) and recomputes each term through the same `CreditMath`
 *      library the off-chain agent used. The AI chooses *whether and whom* to help; the chain
 *      decides *how much*. A fully compromised agent key can therefore trigger restructurings
 *      the protocol would already have approved, and nothing else.
 *
 *      **Relief is funded, not conjured.** Micro-refinancing is paid out of a reserve
 *      accumulated from a slice of interest, never out of lender principal. When the reserve is
 *      empty, restructuring degrades to rate relief and term extension. Lenders cannot be
 *      silently socialised into another borrower's rescue.
 *
 *      **The agent is not a liveness dependency.** If the agent goes offline while a position
 *      sits in the stress band, anyone may trigger the same restructuring after
 *      `AGENT_GRACE_PERIOD`. Borrower protection does not hinge on a server staying up.
 */
contract MeritrVault is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using CreditMath for CreditMath.CreditFacts;

    bytes32 public constant RISK_AGENT_ROLE = keccak256("RISK_AGENT_ROLE");
    bytes32 public constant PRICE_ROLE = keccak256("PRICE_ROLE");

    // ---------------------------------------------------------------------
    // Risk parameters
    // ---------------------------------------------------------------------

    /// @notice Collateral haircut applied when measuring health.
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 8_250; // 82.5%
    /// @notice Bonus paid to a liquidator, out of seized collateral.
    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5%
    /// @notice Share of accrued interest routed to the restructuring reserve.
    uint256 public constant RESERVE_FACTOR_BPS = 1_500; // 15%
    /// @notice Maximum rate relief a single restructuring may grant.
    uint256 public constant MAX_RATE_RELIEF_BPS = 600; // 6.00 percentage points
    /// @notice A restructured rate may never fall below the protocol's best offered rate.
    uint256 public constant RELIEF_FLOOR_BPS = CreditMath.MIN_APR_BPS;
    /// @notice Term extension granted per restructuring event.
    uint256 public constant EXTENSION_PERIOD = 30 days;
    /// @notice Hard cap on restructurings per loan, so forbearance cannot run forever.
    uint8 public constant MAX_RESTRUCTURES = 3;
    /// @notice Minimum gap between restructurings of the same loan.
    uint256 public constant RESTRUCTURE_COOLDOWN = 12 hours;
    /// @notice After this long unattended, a stressed position may be restructured by anyone.
    uint256 public constant AGENT_GRACE_PERIOD = 6 hours;
    /// @notice Ceiling on reserve drawdown per event, as a share of the reserve.
    uint256 public constant MAX_RESERVE_DRAW_BPS = 2_500; // 25%
    /// @notice Default loan term at origination.
    uint256 public constant DEFAULT_TERM = 90 days;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Loan {
        bool active;
        uint8 restructureCount;
        uint16 originationScore;
        uint64 rateBps;
        uint64 openedAt;
        uint64 lastAccrual;
        uint64 maturity;
        uint64 lastRestructureAt;
        uint64 stressedSince; // first observation of this loan inside the stress band
        uint128 principal; // ASSET units
        uint128 interestOwed; // ASSET units
        uint128 collateral; // COLLATERAL units
        uint128 reliefGranted; // ASSET units retired by the reserve, lifetime
    }

    /// @notice Everything the UI and the agent need to reason about a position in one call.
    struct PositionView {
        Loan loan;
        uint256 debt; // principal + interest, projected to now
        uint256 healthFactor; // WAD
        uint16 currentScore;
        uint256 marketRateBps; // rate this borrower's score earns today
        uint256 collateralValueE8;
        uint256 debtValueE8;
        bool inStressBand;
        bool liquidatable;
        bool restructurable;
    }

    // ---------------------------------------------------------------------
    // Immutables & configuration
    // ---------------------------------------------------------------------

    IERC20 public immutable ASSET;
    IERC20 public immutable COLLATERAL;
    IMeritrAttestor public immutable ATTESTOR;
    MeritrPassport public immutable PASSPORT;

    uint8 public immutable ASSET_DECIMALS;
    uint8 public immutable COLLATERAL_DECIMALS;

    /// @notice USD prices, 1e8. The single governance-fed input in the risk path; every other
    ///         term is derived from proof-verified data.
    uint64 public assetPriceE8;
    uint64 public collateralPriceE8;

    // ---------------------------------------------------------------------
    // Pool state
    // ---------------------------------------------------------------------

    uint256 public totalIdle; // unlent ASSET held by the vault
    uint256 public totalPrincipal; // ASSET lent out
    uint256 public totalInterestOwed; // ASSET accrued to lenders, unpaid
    uint256 public pendingReserveInterest; // reserve's share of accrued-but-unpaid interest
    uint256 public reserveBalance; // ASSET cash earmarked for restructuring relief
    uint256 public totalShares;

    mapping(address lender => uint256) public sharesOf;
    mapping(address borrower => Loan) private _loans;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Deposited(address indexed lender, uint256 assets, uint256 shares);
    event Withdrawn(address indexed lender, uint256 assets, uint256 shares);
    event LoanOpened(
        address indexed borrower, uint256 collateral, uint256 principal, uint16 score, uint64 rateBps
    );
    event CollateralAdded(address indexed borrower, uint256 amount);
    event Repaid(address indexed borrower, uint256 interestPaid, uint256 principalPaid, bool closed);

    /// @notice A stressed loan was restructured rather than liquidated.
    event LoanRestructured(
        address indexed borrower,
        address indexed triggeredBy,
        uint64 oldRateBps,
        uint64 newRateBps,
        uint64 newMaturity,
        uint256 debtRetiredFromReserve,
        uint256 healthFactorBefore,
        uint256 healthFactorAfter
    );
    event StressDetected(address indexed borrower, uint256 healthFactor);
    event Liquidated(
        address indexed borrower, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized
    );
    /// @notice Collateral left over after a liquidation cleared the debt, returned to the borrower.
    event ResidualCollateralReturned(address indexed borrower, uint256 amount);
    event PricesUpdated(uint64 assetPriceE8, uint64 collateralPriceE8);
    event ReserveFunded(address indexed from, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAmount();
    error NoActiveLoan(address borrower);
    error LoanAlreadyOpen(address borrower);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error ExceedsMaxLtv(uint256 requestedLtvBps, uint256 maxLtvBps);
    error NotStressed(uint256 healthFactor);
    error NotLiquidatable(uint256 healthFactor);
    error RestructureLimitReached();
    error CooldownActive(uint64 readyAt);
    error NotAuthorizedYet(uint64 openAt);
    error InsufficientShares();
    error PriceNotSet();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor(
        address admin,
        IERC20 asset_,
        uint8 assetDecimals_,
        IERC20 collateral_,
        uint8 collateralDecimals_,
        IMeritrAttestor attestor_,
        MeritrPassport passport_,
        uint64 assetPriceE8_,
        uint64 collateralPriceE8_
    ) {
        ASSET = asset_;
        COLLATERAL = collateral_;
        ASSET_DECIMALS = assetDecimals_;
        COLLATERAL_DECIMALS = collateralDecimals_;
        ATTESTOR = attestor_;
        PASSPORT = passport_;
        assetPriceE8 = assetPriceE8_;
        collateralPriceE8 = collateralPriceE8_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PRICE_ROLE, admin);
        _grantRole(RISK_AGENT_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Lender side
    // ---------------------------------------------------------------------

    function deposit(uint256 assets) external nonReentrant whenNotPaused returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();

        uint256 total = totalAssets();
        shares = totalShares == 0 ? assets : (assets * totalShares) / total;
        if (shares == 0) revert ZeroAmount();

        ASSET.safeTransferFrom(msg.sender, address(this), assets);
        totalIdle += assets;
        totalShares += shares;
        sharesOf[msg.sender] += shares;

        emit Deposited(msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (sharesOf[msg.sender] < shares) revert InsufficientShares();

        assets = (shares * totalAssets()) / totalShares;
        if (assets > totalIdle) revert InsufficientLiquidity(assets, totalIdle);

        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        totalIdle -= assets;

        ASSET.safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, assets, shares);
    }

    /**
     * @notice Total value backing lender shares.
     * @dev Deliberately excludes `reserveBalance`: the reserve is the protocol's restructuring
     *      buffer, not lender equity. Counting it would let a lender withdraw the very funds
     *      earmarked to keep borrowers solvent.
     */
    function totalAssets() public view returns (uint256) {
        return totalIdle + totalPrincipal + totalInterestOwed;
    }

    function previewWithdraw(uint256 shares) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (shares * totalAssets()) / totalShares;
    }

    /// @notice Seed the restructuring reserve directly. Open to anyone - grants, DAOs, sponsors.
    function fundReserve(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        ASSET.safeTransferFrom(msg.sender, address(this), amount);
        reserveBalance += amount;
        emit ReserveFunded(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Borrower side
    // ---------------------------------------------------------------------

    /**
     * @notice Open a credit line priced by the borrower's Attestcoin-verified credit score.
     * @param collateralAmount COLLATERAL units to post.
     * @param borrowAmount     ASSET units to draw.
     */
    function openLoan(uint256 collateralAmount, uint256 borrowAmount)
        external
        nonReentrant
        whenNotPaused
    {
        if (collateralAmount == 0 || borrowAmount == 0) revert ZeroAmount();
        if (_loans[msg.sender].active) revert LoanAlreadyOpen(msg.sender);
        if (borrowAmount > totalIdle) revert InsufficientLiquidity(borrowAmount, totalIdle);
        if (assetPriceE8 == 0 || collateralPriceE8 == 0) revert PriceNotSet();

        uint16 score = ATTESTOR.scoreOf(msg.sender).score;
        uint256 maxLtv = CreditMath.maxLtvBps(score);

        uint256 collateralE8 = _collateralToE8(collateralAmount);
        uint256 borrowE8 = _assetToE8(borrowAmount);
        uint256 ltv = (borrowE8 * CreditMath.BPS) / collateralE8;
        if (ltv > maxLtv) revert ExceedsMaxLtv(ltv, maxLtv);

        uint64 rate = uint64(CreditMath.aprBps(score));

        _loans[msg.sender] = Loan({
            active: true,
            restructureCount: 0,
            originationScore: score,
            rateBps: rate,
            openedAt: uint64(block.timestamp),
            lastAccrual: uint64(block.timestamp),
            maturity: uint64(block.timestamp + DEFAULT_TERM),
            lastRestructureAt: 0,
            stressedSince: 0,
            principal: uint128(borrowAmount),
            interestOwed: 0,
            collateral: uint128(collateralAmount),
            reliefGranted: 0
        });

        totalIdle -= borrowAmount;
        totalPrincipal += borrowAmount;

        COLLATERAL.safeTransferFrom(msg.sender, address(this), collateralAmount);
        ASSET.safeTransfer(msg.sender, borrowAmount);

        emit LoanOpened(msg.sender, collateralAmount, borrowAmount, score, rate);
    }

    /// @notice Top up collateral on an open loan.
    function addCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Loan storage loan = _loans[msg.sender];
        if (!loan.active) revert NoActiveLoan(msg.sender);

        loan.collateral += uint128(amount);
        COLLATERAL.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralAdded(msg.sender, amount);
    }

    /**
     * @notice Repay debt, interest first. Repaying in full releases all collateral.
     * @param amount ASSET units to repay; amounts above the outstanding debt are trimmed.
     */
    function repay(uint256 amount) external nonReentrant returns (uint256 paid) {
        if (amount == 0) revert ZeroAmount();
        Loan storage loan = _loans[msg.sender];
        if (!loan.active) revert NoActiveLoan(msg.sender);

        _accrue(msg.sender);

        uint256 owed = uint256(loan.principal) + loan.interestOwed;
        paid = amount > owed ? owed : amount;

        ASSET.safeTransferFrom(msg.sender, address(this), paid);

        (uint256 interestPaid, uint256 principalPaid, uint256 lenderCut, uint256 reserveCut) =
            _settleDebt(loan, paid);

        totalIdle += principalPaid + lenderCut;
        reserveBalance += reserveCut;

        bool closed = loan.principal == 0 && loan.interestOwed == 0;
        uint256 collateralOut;
        if (closed) {
            collateralOut = loan.collateral;
            loan.collateral = 0;
            loan.active = false;
        }

        emit Repaid(msg.sender, interestPaid, principalPaid, closed);

        if (collateralOut > 0) COLLATERAL.safeTransfer(msg.sender, collateralOut);
    }

    // ---------------------------------------------------------------------
    // Autonomous restructuring
    // ---------------------------------------------------------------------

    /**
     * @notice Restructure a distressed loan instead of liquidating it.
     * @dev Callable by the DeAI risk agent at any time while the position sits in the stress
     *      band, and by anyone once the position has been stressed for `AGENT_GRACE_PERIOD`
     *      without intervention.
     *
     *      Takes no economic parameters. Every term is recomputed here from the borrower's live
     *      Attestcoin-verified score, so the agent's authority is limited to *timing*.
     *
     *      Three levers are applied in increasing order of cost to the protocol:
     *        1. **Rate relief**  - reprice to the borrower's earned rate, capped by
     *           `MAX_RATE_RELIEF_BPS` and floored at `RELIEF_FLOOR_BPS`. Free to lenders' capital.
     *        2. **Term extension** - push maturity out by `EXTENSION_PERIOD`, buying the
     *           borrower time to recover without a forced sale.
     *        3. **Micro-refinance** - if health is still short of target, retire debt using the
     *           reserve, bounded by `MAX_RESERVE_DRAW_BPS` of the reserve.
     */
    function restructure(address borrower)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 hfBefore, uint256 hfAfter, uint256 debtRetired)
    {
        Loan storage loan = _loans[borrower];
        if (!loan.active) revert NoActiveLoan(borrower);

        _accrue(borrower);

        hfBefore = healthFactorOf(borrower);

        // Only the stress band. Healthy loans need nothing; underwater loans are a
        // liquidation problem, and letting the agent restructure them would let it socialise
        // a bad debt into the reserve.
        if (hfBefore < CreditMath.LIQUIDATION_HF || hfBefore >= CreditMath.STRESS_HF) {
            revert NotStressed(hfBefore);
        }

        if (loan.stressedSince == 0) {
            loan.stressedSince = uint64(block.timestamp);
            emit StressDetected(borrower, hfBefore);
        }

        if (!hasRole(RISK_AGENT_ROLE, msg.sender)) {
            uint64 openAt = loan.stressedSince + uint64(AGENT_GRACE_PERIOD);
            if (block.timestamp < openAt) revert NotAuthorizedYet(openAt);
        }

        if (loan.restructureCount >= MAX_RESTRUCTURES) revert RestructureLimitReached();
        if (loan.lastRestructureAt != 0) {
            uint64 readyAt = loan.lastRestructureAt + uint64(RESTRUCTURE_COOLDOWN);
            if (block.timestamp < readyAt) revert CooldownActive(readyAt);
        }

        uint64 oldRate = loan.rateBps;

        // --- Lever 1: rate relief, recomputed from live cross-chain credit ---
        uint16 liveScore = ATTESTOR.scoreOf(borrower).score;
        uint256 earnedRate = CreditMath.aprBps(liveScore);
        uint256 floorRate = oldRate > MAX_RATE_RELIEF_BPS ? oldRate - MAX_RATE_RELIEF_BPS : RELIEF_FLOOR_BPS;
        if (floorRate < RELIEF_FLOOR_BPS) floorRate = RELIEF_FLOOR_BPS;

        uint256 newRate = earnedRate < floorRate ? floorRate : earnedRate;
        if (newRate < oldRate) loan.rateBps = uint64(newRate);

        // --- Lever 2: term extension --------------------------------------
        uint64 base = loan.maturity > block.timestamp ? loan.maturity : uint64(block.timestamp);
        loan.maturity = base + uint64(EXTENSION_PERIOD);

        // --- Lever 3: reserve-funded micro-refinance ----------------------
        uint256 collateralE8 = _collateralToE8(loan.collateral);
        uint256 sustainableE8 =
            CreditMath.sustainableDebtE8(collateralE8, LIQUIDATION_THRESHOLD_BPS, CreditMath.TARGET_HF);
        uint256 debtE8 = _assetToE8(uint256(loan.principal) + loan.interestOwed);

        if (debtE8 > sustainableE8 && reserveBalance > 0) {
            uint256 shortfall = _e8ToAsset(debtE8 - sustainableE8);
            uint256 cap = (reserveBalance * MAX_RESERVE_DRAW_BPS) / CreditMath.BPS;
            debtRetired = shortfall > cap ? cap : shortfall;

            if (debtRetired > 0) {
                // Reserve capital settles the borrower's obligation to the pool: interest
                // first (lenders are made whole), then principal returns to lendable idle.
                // No cash enters or leaves the vault here - it moves from the reserve bucket
                // into the lendable one, minus the slice of interest the reserve owned anyway.
                reserveBalance -= debtRetired;

                (, uint256 principalPart, uint256 lenderCut, uint256 reserveCut) =
                    _settleDebt(loan, debtRetired);

                totalIdle += principalPart + lenderCut;
                reserveBalance += reserveCut;

                loan.reliefGranted += uint128(debtRetired);
            }
        }

        loan.restructureCount += 1;
        loan.lastRestructureAt = uint64(block.timestamp);

        hfAfter = healthFactorOf(borrower);
        // Clear the stress stamp once the intervention actually worked, so the next episode
        // starts its own grace clock.
        if (hfAfter >= CreditMath.STRESS_HF) loan.stressedSince = 0;

        emit LoanRestructured(
            borrower, msg.sender, oldRate, loan.rateBps, loan.maturity, debtRetired, hfBefore, hfAfter
        );
    }

    /// @notice Record that a loan has entered the stress band, starting the agent grace clock.
    /// @dev Permissionless keeper hook so the grace period can begin even if the agent is down.
    function flagStress(address borrower) external returns (bool flagged) {
        Loan storage loan = _loans[borrower];
        if (!loan.active) revert NoActiveLoan(borrower);

        uint256 hf = healthFactorOf(borrower);
        if (hf >= CreditMath.LIQUIDATION_HF && hf < CreditMath.STRESS_HF && loan.stressedSince == 0) {
            loan.stressedSince = uint64(block.timestamp);
            emit StressDetected(borrower, hf);
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------------------

    /**
     * @notice Liquidate a position that has fallen below a health factor of 1.
     * @dev The backstop, not the default path. Meritr's design intent is that the stress band
     *      and the restructuring agent make this rare.
     */
    function liquidate(address borrower, uint256 repayAmount)
        external
        nonReentrant
        returns (uint256 collateralSeized)
    {
        Loan storage loan = _loans[borrower];
        if (!loan.active) revert NoActiveLoan(borrower);

        _accrue(borrower);

        uint256 hf = healthFactorOf(borrower);
        if (hf >= CreditMath.LIQUIDATION_HF) revert NotLiquidatable(hf);

        uint256 owed = uint256(loan.principal) + loan.interestOwed;
        uint256 repaid = repayAmount > owed ? owed : repayAmount;
        if (repaid == 0) revert ZeroAmount();

        uint256 seizeE8 =
            (_assetToE8(repaid) * (CreditMath.BPS + LIQUIDATION_BONUS_BPS)) / CreditMath.BPS;
        collateralSeized = _e8ToCollateral(seizeE8);
        if (collateralSeized > loan.collateral) collateralSeized = loan.collateral;

        ASSET.safeTransferFrom(msg.sender, address(this), repaid);

        (, uint256 principalPaid, uint256 lenderCut, uint256 reserveCut) = _settleDebt(loan, repaid);
        totalIdle += principalPaid + lenderCut;
        reserveBalance += reserveCut;

        loan.collateral -= uint128(collateralSeized);

        // Clearing the debt closes the loan, and a closed loan has no exit left: `repay` and
        // `addCollateral` both revert on an inactive loan, and there is no standalone
        // collateral withdrawal. Any collateral the liquidator did not seize would therefore be
        // stranded in this contract permanently.
        //
        // This is not an edge case. Below a health factor of 1 the position holds at most
        // `debt / LIQUIDATION_THRESHOLD` ~= 1.21x its debt in collateral, while the liquidator
        // takes 1.05x - so a routine full liquidation leaves roughly 16% of the debt's value
        // behind. Return it to the borrower as part of closing the loan.
        uint256 residual;
        if (loan.principal == 0 && loan.interestOwed == 0) {
            loan.active = false;
            residual = loan.collateral;
            loan.collateral = 0;
        }

        COLLATERAL.safeTransfer(msg.sender, collateralSeized);
        emit Liquidated(borrower, msg.sender, repaid, collateralSeized);

        if (residual > 0) {
            COLLATERAL.safeTransfer(borrower, residual);
            emit ResidualCollateralReturned(borrower, residual);
        }
    }

    // ---------------------------------------------------------------------
    // Interest accrual
    // ---------------------------------------------------------------------

    function _accrue(address borrower) internal {
        Loan storage loan = _loans[borrower];
        if (!loan.active) return;

        uint256 elapsed = block.timestamp - loan.lastAccrual;
        if (elapsed == 0) return;

        uint256 interest = CreditMath.accrueInterest(loan.principal, loan.rateBps, elapsed);
        loan.lastAccrual = uint64(block.timestamp);
        if (interest == 0) return;

        // A slice of every dollar of interest capitalises the reserve that funds future
        // restructurings, so the mechanism is self-sustaining rather than grant-dependent.
        // It is booked as a *claim* here, not as cash: the reserve may only ever spend money
        // a borrower has actually paid in, which `_settleDebt` moves across on repayment.
        uint256 toReserve = (interest * RESERVE_FACTOR_BPS) / CreditMath.BPS;

        loan.interestOwed += uint128(interest);
        totalInterestOwed += interest - toReserve;
        pendingReserveInterest += toReserve;
    }

    /**
     * @dev Apply `amount` of ASSET against a loan's obligations, interest before principal, and
     *      unwind the global ledgers by the same lender/reserve split used when the interest was
     *      accrued. Every path that reduces debt - repayment, liquidation and reserve-funded
     *      refinancing - routes through here, so the invariant
     *      `sum(loan.interestOwed) == totalInterestOwed + pendingReserveInterest` holds by
     *      construction instead of by three separate copies of the same arithmetic.
     *
     *      Callers are responsible for moving the corresponding cash between `totalIdle` and
     *      `reserveBalance`; this function only touches obligations.
     */
    function _settleDebt(Loan storage loan, uint256 amount)
        private
        returns (uint256 interestPaid, uint256 principalPaid, uint256 lenderCut, uint256 reserveCut)
    {
        interestPaid = amount > loan.interestOwed ? loan.interestOwed : amount;
        principalPaid = amount - interestPaid;

        reserveCut = (interestPaid * RESERVE_FACTOR_BPS) / CreditMath.BPS;
        // Guard against integer-division dust drifting the global ledgers negative.
        if (reserveCut > pendingReserveInterest) reserveCut = pendingReserveInterest;
        lenderCut = interestPaid - reserveCut;
        if (lenderCut > totalInterestOwed) lenderCut = totalInterestOwed;

        loan.interestOwed -= uint128(interestPaid);
        loan.principal -= uint128(principalPaid);
        pendingReserveInterest -= reserveCut;
        totalInterestOwed -= lenderCut;
        totalPrincipal -= principalPaid;
    }

    /// @notice Public accrual hook so keepers and the UI can refresh a position's books.
    function accrue(address borrower) external {
        _accrue(borrower);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function loanOf(address borrower) external view returns (Loan memory) {
        return _loans[borrower];
    }

    /// @notice Debt including interest that has accrued but not yet been written to storage.
    function debtOf(address borrower) public view returns (uint256) {
        Loan memory loan = _loans[borrower];
        if (!loan.active) return 0;
        uint256 pending =
            CreditMath.accrueInterest(loan.principal, loan.rateBps, block.timestamp - loan.lastAccrual);
        return uint256(loan.principal) + loan.interestOwed + pending;
    }

    function healthFactorOf(address borrower) public view returns (uint256) {
        Loan memory loan = _loans[borrower];
        if (!loan.active) return type(uint256).max;
        return CreditMath.healthFactor(
            _collateralToE8(loan.collateral), _assetToE8(debtOf(borrower)), LIQUIDATION_THRESHOLD_BPS
        );
    }

    /// @notice One-call snapshot for the dashboard and the DeAI agent's decision loop.
    function positionOf(address borrower) external view returns (PositionView memory v) {
        v.loan = _loans[borrower];
        v.debt = debtOf(borrower);
        v.healthFactor = healthFactorOf(borrower);
        v.currentScore = ATTESTOR.scoreOf(borrower).score;
        v.marketRateBps = CreditMath.aprBps(v.currentScore);
        v.collateralValueE8 = _collateralToE8(v.loan.collateral);
        v.debtValueE8 = _assetToE8(v.debt);

        if (v.loan.active) {
            v.liquidatable = v.healthFactor < CreditMath.LIQUIDATION_HF;
            v.inStressBand = !v.liquidatable && v.healthFactor < CreditMath.STRESS_HF;
            v.restructurable = v.inStressBand && v.loan.restructureCount < MAX_RESTRUCTURES
                && (
                    v.loan.lastRestructureAt == 0
                        || block.timestamp >= v.loan.lastRestructureAt + RESTRUCTURE_COOLDOWN
                );
        }
    }

    /// @notice Terms this borrower would receive today, for UI preview before committing.
    function quote(address borrower)
        external
        view
        returns (uint16 score, uint256 rateBps, uint256 maxLtvBps)
    {
        score = ATTESTOR.scoreOf(borrower).score;
        rateBps = CreditMath.aprBps(score);
        maxLtvBps = CreditMath.maxLtvBps(score);
    }

    /// @notice Utilisation of the lending pool, in basis points.
    function utilizationBps() external view returns (uint256) {
        uint256 total = totalIdle + totalPrincipal;
        if (total == 0) return 0;
        return (totalPrincipal * CreditMath.BPS) / total;
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    function setPrices(uint64 assetPriceE8_, uint64 collateralPriceE8_) external onlyRole(PRICE_ROLE) {
        if (assetPriceE8_ == 0 || collateralPriceE8_ == 0) revert PriceNotSet();
        assetPriceE8 = assetPriceE8_;
        collateralPriceE8 = collateralPriceE8_;
        emit PricesUpdated(assetPriceE8_, collateralPriceE8_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Unit conversion
    // ---------------------------------------------------------------------

    function _assetToE8(uint256 amount) internal view returns (uint256) {
        return (amount * assetPriceE8) / (10 ** ASSET_DECIMALS);
    }

    function _e8ToAsset(uint256 valueE8) internal view returns (uint256) {
        return (valueE8 * (10 ** ASSET_DECIMALS)) / assetPriceE8;
    }

    function _collateralToE8(uint256 amount) internal view returns (uint256) {
        return (amount * collateralPriceE8) / (10 ** COLLATERAL_DECIMALS);
    }

    function _e8ToCollateral(uint256 valueE8) internal view returns (uint256) {
        return (valueE8 * (10 ** COLLATERAL_DECIMALS)) / collateralPriceE8;
    }
}
