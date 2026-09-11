const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  encodeProvenTx,
  addressTopic,
  packData,
  installMockPrecompile,
  proofArgs,
  increaseTime,
} = require("./helpers");
const { ACTION, TEST_CHAINS, AAVE_V3_EVENTS } = require("../scripts/sourceSchemas");

const CHAIN = TEST_CHAINS.SEPOLIA;
const AAVE_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const USDC_SRC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const ONE_USD_E8 = 100_000_000n;

const USDC = (n) => ethers.parseUnits(n.toString(), 6);
const WETH = (n) => ethers.parseUnits(n.toString(), 18);

describe("MeritrVault — autonomous debt restructuring", function () {
  let vault, attestor, passport, asset, collateral;
  let admin, lender, borrower, agent, keeper, liquidator;
  let proofIndex = 100;

  /** Give `who` an attested cross-chain repayment history of `usd` dollars over `count` events. */
  async function attestHistory(who, usd, count = 1, action = ACTION.REPAYMENT) {
    const topicMap = {
      [ACTION.REPAYMENT]: AAVE_V3_EVENTS.REPAY,
      [ACTION.COLLATERAL]: AAVE_V3_EVENTS.SUPPLY,
      [ACTION.LIQUIDATION]: AAVE_V3_EVENTS.LIQUIDATION,
    };
    const evt = topicMap[action];

    for (let i = 0; i < count; i++) {
      const idx = proofIndex++;
      const p = proofArgs(idx);

      let log;
      if (action === ACTION.REPAYMENT) {
        log = {
          address: AAVE_POOL,
          topics: [evt.topic0, addressTopic(USDC_SRC), addressTopic(who), addressTopic(who)],
          data: packData(["uint256", "bool"], [USDC(usd / count), false]),
        };
      } else if (action === ACTION.COLLATERAL) {
        log = {
          address: AAVE_POOL,
          topics: [
            evt.topic0,
            addressTopic(USDC_SRC),
            addressTopic(who),
            ethers.zeroPadValue("0x00", 32),
          ],
          data: packData(["address", "uint256"], [who, USDC(usd / count)]),
        };
      } else {
        log = {
          address: AAVE_POOL,
          topics: [evt.topic0, addressTopic(USDC_SRC), addressTopic(USDC_SRC), addressTopic(who)],
          data: packData(
            ["uint256", "uint256", "address", "bool"],
            [USDC(1), 1n, admin.address, false]
          ),
        };
      }

      await attestor.ingest(
        action,
        CHAIN.chainKey,
        BigInt(4_000_000 + idx),
        encodeProvenTx({ from: who, to: AAVE_POOL, logs: [log] }),
        p.merkleRoot,
        p.siblings,
        p.lowerEndpointDigest,
        p.continuityRoots
      );
    }
  }

  beforeEach(async function () {
    [admin, lender, borrower, agent, keeper, liquidator] = await ethers.getSigners();
    await installMockPrecompile();

    const Attestor = await ethers.getContractFactory("MeritrAttestor");
    attestor = await Attestor.deploy(admin.address);
    await attestor.configureSourceChain(
      CHAIN.chainKey,
      CHAIN.name,
      CHAIN.genesisTimestamp,
      CHAIN.blockTimeSeconds,
      true
    );
    await attestor.configureAsset(CHAIN.chainKey, USDC_SRC, 6, ONE_USD_E8);
    for (const evt of Object.values(AAVE_V3_EVENTS)) {
      await attestor.registerSchema(CHAIN.chainKey, AAVE_POOL, evt.topic0, evt.schema);
    }

    const Passport = await ethers.getContractFactory("MeritrPassport");
    passport = await Passport.deploy(admin.address, await attestor.getAddress());

    const ERC20 = await ethers.getContractFactory("MockERC20");
    asset = await ERC20.deploy("Meritr USD", "mUSD", 6);
    collateral = await ERC20.deploy("Wrapped Ether", "WETH", 18);

    const Vault = await ethers.getContractFactory("MeritrVault");
    vault = await Vault.deploy(
      admin.address,
      await asset.getAddress(),
      6,
      await collateral.getAddress(),
      18,
      await attestor.getAddress(),
      await passport.getAddress(),
      ONE_USD_E8, // $1.00 per mUSD
      3000n * ONE_USD_E8 // $3,000 per WETH
    );
    await vault.grantRole(await vault.RISK_AGENT_ROLE(), agent.address);

    // Seed liquidity and balances.
    await asset.mint(lender.address, USDC(1_000_000));
    await asset.connect(lender).approve(await vault.getAddress(), ethers.MaxUint256);
    await vault.connect(lender).deposit(USDC(500_000));

    await collateral.mint(borrower.address, WETH(100));
    await collateral.connect(borrower).approve(await vault.getAddress(), ethers.MaxUint256);
    await asset.mint(borrower.address, USDC(100_000));
    await asset.connect(borrower).approve(await vault.getAddress(), ethers.MaxUint256);

    await asset.mint(liquidator.address, USDC(100_000));
    await asset.connect(liquidator).approve(await vault.getAddress(), ethers.MaxUint256);

    // Fund the restructuring reserve so relief has capital to work with.
    await asset.mint(admin.address, USDC(100_000));
    await asset.approve(await vault.getAddress(), ethers.MaxUint256);
    await vault.fundReserve(USDC(50_000));
  });

  describe("credit-priced origination", function () {
    it("prices an unattested wallet at the protocol's worst terms", async function () {
      const q = await vault.quote(borrower.address);
      expect(q.score).to.equal(300);
      expect(q.rateBps).to.equal(2400); // 24% APR
      expect(q.maxLtvBps).to.equal(3000); // 30% LTV
    });

    it("improves terms once cross-chain repayment history is proven", async function () {
      const before = await vault.quote(borrower.address);
      await attestHistory(borrower.address, 200_000, 20);
      const after = await vault.quote(borrower.address);

      expect(after.score).to.be.greaterThan(before.score);
      expect(after.rateBps).to.be.lessThan(before.rateBps);
      expect(after.maxLtvBps).to.be.greaterThan(before.maxLtvBps);
    });

    it("opens a loan at the score-derived rate", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      const q = await vault.quote(borrower.address);

      // 10 WETH = $30,000 collateral.
      await expect(vault.connect(borrower).openLoan(WETH(10), USDC(12_000))).to.emit(
        vault,
        "LoanOpened"
      );

      const loan = await vault.loanOf(borrower.address);
      expect(loan.rateBps).to.equal(q.rateBps);
      expect(loan.originationScore).to.equal(q.score);
      expect(await asset.balanceOf(borrower.address)).to.equal(USDC(112_000));
    });

    it("rejects a draw above the borrower's earned loan-to-value", async function () {
      // No history => 30% max LTV. $30,000 collateral allows $9,000.
      await expect(
        vault.connect(borrower).openLoan(WETH(10), USDC(15_000))
      ).to.be.revertedWithCustomError(vault, "ExceedsMaxLtv");
    });
  });

  describe("interest accrual and repayment", function () {
    beforeEach(async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
    });

    it("accrues interest linearly and keeps the global ledger exact", async function () {
      await increaseTime(365 * 24 * 3600);
      await vault.accrue(borrower.address);

      const loan = await vault.loanOf(borrower.address);
      const expected = (12_000n * 1_000_000n * BigInt(loan.rateBps)) / 10_000n;
      expect(loan.interestOwed).to.be.closeTo(expected, USDC(1));

      // Invariant: a borrower's interest obligation is exactly the sum of the lender claim
      // and the reserve claim against it.
      expect(await vault.totalInterestOwed()).to.be.greaterThan(0);
      expect(
        (await vault.totalInterestOwed()) + (await vault.pendingReserveInterest())
      ).to.equal(loan.interestOwed);
    });

    it("repays in full, releases collateral and splits interest with the reserve", async function () {
      await increaseTime(180 * 24 * 3600);
      const reserveBefore = await vault.reserveBalance();

      const debt = await vault.debtOf(borrower.address);
      await vault.connect(borrower).repay(debt + USDC(10));

      const loan = await vault.loanOf(borrower.address);
      expect(loan.active).to.equal(false);
      expect(await collateral.balanceOf(borrower.address)).to.equal(WETH(100));
      expect(await vault.reserveBalance()).to.be.greaterThan(reserveBefore);
      expect(await vault.totalInterestOwed()).to.equal(0);
      expect(await vault.pendingReserveInterest()).to.equal(0);
    });

    it("grows lender share value as interest accrues", async function () {
      const shares = await vault.sharesOf(lender.address);
      const before = await vault.previewWithdraw(shares);

      await increaseTime(365 * 24 * 3600);
      await vault.accrue(borrower.address);

      expect(await vault.previewWithdraw(shares)).to.be.greaterThan(before);
    });
  });

  describe("autonomous restructuring", function () {
    /**
     * Mark collateral to whatever price puts the position at `targetHf`.
     *
     * Solving for the price rather than hardcoding one matters: restructuring retires debt, so
     * a fixed mark that stresses a fresh loan will not stress the same loan afterwards. This
     * inverts the health-factor formula against live loan state.
     */
    async function setPriceForHf(targetHf) {
      const loan = await vault.loanOf(borrower.address);
      const debt = await vault.debtOf(borrower.address);
      const debtE8 = (debt * (await vault.assetPriceE8())) / USDC(1);
      const collateralE8 = (targetHf * debtE8 * 10_000n) / (8250n * ethers.WeiPerEther);
      const priceE8 = (collateralE8 * ethers.WeiPerEther) / loan.collateral;
      await vault.setPrices(ONE_USD_E8, priceE8);
    }

    /** Push the borrower's position into the stress band by marking down collateral. */
    async function stressPosition(targetHf = ethers.parseEther("1.08")) {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      await setPriceForHf(targetHf);
      const hf = await vault.healthFactorOf(borrower.address);
      expect(hf).to.be.greaterThanOrEqual(ethers.parseEther("1"));
      expect(hf).to.be.lessThan(ethers.parseEther("1.15"));
      return hf;
    }

    it("restructures a stressed loan back toward health instead of liquidating", async function () {
      const hfBefore = await stressPosition();

      const tx = await vault.connect(agent).restructure(borrower.address);
      await expect(tx).to.emit(vault, "LoanRestructured");

      const hfAfter = await vault.healthFactorOf(borrower.address);
      expect(hfAfter).to.be.greaterThan(hfBefore);
      expect(hfAfter).to.be.greaterThanOrEqual(ethers.parseEther("1.15"));

      const loan = await vault.loanOf(borrower.address);
      expect(loan.active).to.equal(true);
      expect(loan.restructureCount).to.equal(1);
      expect(loan.reliefGranted).to.be.greaterThan(0);
      // Borrower keeps every unit of collateral — the whole point.
      expect(loan.collateral).to.equal(WETH(10));
    });

    it("extends the term and never raises the rate", async function () {
      await stressPosition();
      const before = await vault.loanOf(borrower.address);

      await vault.connect(agent).restructure(borrower.address);
      const after = await vault.loanOf(borrower.address);

      expect(after.maturity).to.be.greaterThan(before.maturity);
      expect(after.rateBps).to.be.lessThanOrEqual(before.rateBps);
    });

    it("funds relief from the reserve, never from lender principal", async function () {
      await stressPosition();
      const reserveBefore = await vault.reserveBalance();
      const idleBefore = await vault.totalIdle();

      const [, , debtRetired] = await vault.connect(agent).restructure.staticCall(borrower.address);
      await vault.connect(agent).restructure(borrower.address);

      expect(debtRetired).to.be.greaterThan(0);
      expect(await vault.reserveBalance()).to.be.lessThan(reserveBefore);
      // Retired principal returns to the lendable pool: lenders are made whole, not diluted.
      expect(await vault.totalIdle()).to.be.greaterThan(idleBefore);
    });

    it("caps a single event at a share of the reserve", async function () {
      await stressPosition();
      const reserveBefore = await vault.reserveBalance();
      const [, , debtRetired] = await vault.connect(agent).restructure.staticCall(borrower.address);
      const cap = (reserveBefore * 2500n) / 10_000n;
      expect(debtRetired).to.be.lessThanOrEqual(cap);
    });

    it("refuses to restructure a healthy loan", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      await expect(
        vault.connect(agent).restructure(borrower.address)
      ).to.be.revertedWithCustomError(vault, "NotStressed");
    });

    it("refuses to restructure an already-underwater loan, so bad debt cannot be socialised", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      await vault.setPrices(ONE_USD_E8, 1000n * ONE_USD_E8); // HF ~0.69
      await expect(
        vault.connect(agent).restructure(borrower.address)
      ).to.be.revertedWithCustomError(vault, "NotStressed");
    });

    it("enforces the cooldown between interventions", async function () {
      await stressPosition();
      await vault.connect(agent).restructure(borrower.address);
      await setPriceForHf(ethers.parseEther("1.05")); // stress it again immediately
      await expect(
        vault.connect(agent).restructure(borrower.address)
      ).to.be.revertedWithCustomError(vault, "CooldownActive");
    });

    it("caps total interventions per loan so forbearance cannot run forever", async function () {
      await stressPosition();
      for (let i = 0; i < 3; i++) {
        await vault.connect(agent).restructure(borrower.address);
        await increaseTime(13 * 3600);
        // Each rescue restores health, so re-mark the collateral to stress it again.
        await setPriceForHf(ethers.parseEther("1.05"));
      }
      expect((await vault.loanOf(borrower.address)).restructureCount).to.equal(3);
      await expect(
        vault.connect(agent).restructure(borrower.address)
      ).to.be.revertedWithCustomError(vault, "RestructureLimitReached");
    });

    it("keeps borrowers protected when the agent goes offline", async function () {
      await stressPosition();

      // A stranger cannot jump the queue while the agent still has time to act.
      await expect(
        vault.connect(keeper).restructure(borrower.address)
      ).to.be.revertedWithCustomError(vault, "NotAuthorizedYet");

      // Anyone may start the clock...
      await expect(vault.connect(keeper).flagStress(borrower.address)).to.emit(
        vault,
        "StressDetected"
      );
      // ...and step in once the agent has visibly failed to.
      await increaseTime(6 * 3600 + 60);
      await expect(vault.connect(keeper).restructure(borrower.address)).to.emit(
        vault,
        "LoanRestructured"
      );
    });

    it("gives a compromised agent no economic discretion whatsoever", async function () {
      await stressPosition();

      // `restructure(address)` is the entire agent-facing surface: no rate, no amount, no score.
      const fragment = vault.interface.getFunction("restructure");
      expect(fragment.inputs).to.have.lengthOf(1);
      expect(fragment.inputs[0].type).to.equal("address");

      // The applied rate is exactly what CreditMath derives from the on-chain attested score,
      // bounded by the relief floor — not anything the caller supplied.
      const score = (await attestor.scoreOf(borrower.address)).score;
      const expectedRate = 2400n - ((2400n - 400n) * (BigInt(score) - 300n)) / 600n;

      await vault.connect(agent).restructure(borrower.address);
      const loan = await vault.loanOf(borrower.address);
      expect(loan.rateBps).to.be.greaterThanOrEqual(400n);
      expect(loan.rateBps).to.be.lessThanOrEqual(
        expectedRate > 400n ? expectedRate : 400n
      );
    });
  });

  describe("liquidation backstop", function () {
    it("liquidates only below a health factor of 1", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));

      await expect(
        vault.connect(liquidator).liquidate(borrower.address, USDC(1_000))
      ).to.be.revertedWithCustomError(vault, "NotLiquidatable");

      await vault.setPrices(ONE_USD_E8, 1000n * ONE_USD_E8);
      const before = await collateral.balanceOf(liquidator.address);
      await expect(vault.connect(liquidator).liquidate(borrower.address, USDC(1_000))).to.emit(
        vault,
        "Liquidated"
      );
      // Liquidator receives collateral plus the 5% bonus.
      expect(await collateral.balanceOf(liquidator.address)).to.be.greaterThan(before);
    });

    /**
     * Mark collateral so the position is liquidatable but still over-collateralised
     * relative to the seizure.
     *
     * A residue only exists in a band: below HF 1 the collateral is worth less than
     * `debt / 0.825` = 1.212x debt, and the liquidator seizes 1.05x debt. So the collateral
     * must land between 1.05x and 1.212x for anything to be left over. Marking the position
     * far underwater (say 1.0x) means the liquidator takes every unit and the bug is invisible
     * — which is exactly how it survived the original suite.
     */
    async function markForResidue(multiple = 1.13) {
      const loan = await vault.loanOf(borrower.address);
      const debt = await vault.debtOf(borrower.address);
      const debtE8 = (debt * (await vault.assetPriceE8())) / USDC(1);
      const wantCollateralE8 = (debtE8 * BigInt(Math.round(multiple * 1000))) / 1000n;
      const priceE8 = (wantCollateralE8 * ethers.WeiPerEther) / loan.collateral;
      await vault.setPrices(ONE_USD_E8, priceE8);
    }

    it("returns leftover collateral when a liquidation clears the whole debt", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      await markForResidue();

      const hf = await vault.healthFactorOf(borrower.address);
      expect(hf).to.be.lessThan(ethers.parseEther("1")); // liquidatable
      expect(hf).to.be.greaterThan(ethers.parseEther("0.9")); // but not wiped out

      const debt = await vault.debtOf(borrower.address);
      const collateralBefore = await collateral.balanceOf(borrower.address);

      await expect(vault.connect(liquidator).liquidate(borrower.address, debt + USDC(100))).to.emit(
        vault,
        "ResidualCollateralReturned"
      );

      const loan = await vault.loanOf(borrower.address);
      expect(loan.active).to.equal(false);
      expect(loan.collateral).to.equal(0);

      // The borrower keeps what the liquidator was not entitled to.
      const returned = (await collateral.balanceOf(borrower.address)) - collateralBefore;
      expect(returned).to.be.greaterThan(0);
    });

    it("leaves no collateral stranded in the vault after a full liquidation", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      await markForResidue();

      const debt = await vault.debtOf(borrower.address);
      await vault.connect(liquidator).liquidate(borrower.address, debt + USDC(100));

      // Every unit posted went either to the liquidator or back to the borrower.
      expect(await collateral.balanceOf(await vault.getAddress())).to.equal(0);
    });
  });

  describe("pool accounting", function () {
    it("excludes the restructuring reserve from lender-withdrawable assets", async function () {
      const total = await vault.totalAssets();
      const reserve = await vault.reserveBalance();
      expect(reserve).to.equal(USDC(50_000));
      // fundReserve moved 50k in without inflating lender claims.
      expect(total).to.equal(USDC(500_000));
    });

    it("holds enough asset balance to cover every bucket it tracks", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      await increaseTime(120 * 24 * 3600);
      await vault.connect(borrower).repay(USDC(5_000));

      const onHand = await asset.balanceOf(await vault.getAddress());
      const tracked = (await vault.totalIdle()) + (await vault.reserveBalance());
      expect(onHand).to.equal(tracked);
    });

    it("blocks withdrawals beyond available liquidity", async function () {
      await attestHistory(borrower.address, 200_000, 20);
      await vault.connect(borrower).openLoan(WETH(10), USDC(12_000));
      const shares = await vault.sharesOf(lender.address);
      await expect(vault.connect(lender).withdraw(shares)).to.be.revertedWithCustomError(
        vault,
        "InsufficientLiquidity"
      );
    });
  });
});
