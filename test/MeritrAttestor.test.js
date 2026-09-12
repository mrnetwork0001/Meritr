const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  PRECOMPILE,
  encodeProvenTx,
  addressTopic,
  packData,
  installMockPrecompile,
  proofArgs,
} = require("./helpers");
const { ACTION, TEST_CHAINS, AAVE_V3_EVENTS } = require("../scripts/sourceSchemas");

const CHAIN = TEST_CHAINS.SEPOLIA;
const AAVE_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const USDC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const ONE_USD_E8 = 100_000_000n;

describe("MeritrAttestor - Attestcoin cross-chain ingestion", function () {
  let attestor, verifier, admin, borrower, relayer, outsider;

  beforeEach(async function () {
    [admin, borrower, relayer, outsider] = await ethers.getSigners();
    verifier = await installMockPrecompile();

    const Attestor = await ethers.getContractFactory("MeritrAttestor");
    attestor = await Attestor.deploy(admin.address);
    await attestor.waitForDeployment();

    await attestor.configureSourceChain(
      CHAIN.chainKey,
      CHAIN.name,
      CHAIN.genesisTimestamp,
      CHAIN.blockTimeSeconds,
      true
    );
    await attestor.configureAsset(CHAIN.chainKey, USDC, 6, ONE_USD_E8);

    for (const evt of Object.values(AAVE_V3_EVENTS)) {
      await attestor.registerSchema(CHAIN.chainKey, AAVE_POOL, evt.topic0, evt.schema);
    }
  });

  /** Build an Aave V3 `Repay` log crediting `user` with `amount` of USDC. */
  function repayLog(user, amount, pool = AAVE_POOL, reserve = USDC) {
    return {
      address: pool,
      topics: [
        AAVE_V3_EVENTS.REPAY.topic0,
        addressTopic(reserve),
        addressTopic(user),
        addressTopic(user),
      ],
      data: packData(["uint256", "bool"], [amount, false]),
    };
  }

  function supplyLog(user, amount) {
    return {
      address: AAVE_POOL,
      topics: [
        AAVE_V3_EVENTS.SUPPLY.topic0,
        addressTopic(USDC),
        addressTopic(user),
        ethers.zeroPadValue("0x00", 32),
      ],
      data: packData(["address", "uint256"], [user, amount]),
    };
  }

  function liquidationLog(user) {
    return {
      address: AAVE_POOL,
      topics: [
        AAVE_V3_EVENTS.LIQUIDATION.topic0,
        addressTopic(USDC),
        addressTopic(USDC),
        addressTopic(user),
      ],
      data: packData(
        ["uint256", "uint256", "address", "bool"],
        [1_000_000_000n, 500n, outsider.address, false]
      ),
    };
  }

  async function ingest(logs, txIndex, { status = 1, height = 5_000_000n, from = relayer } = {}) {
    const p = proofArgs(txIndex);
    const encoded = encodeProvenTx({
      from: borrower.address,
      to: AAVE_POOL,
      logs,
      status,
    });
    return attestor
      .connect(from)
      .ingest(
        ACTION.REPAYMENT,
        CHAIN.chainKey,
        height,
        encoded,
        p.merkleRoot,
        p.siblings,
        p.lowerEndpointDigest,
        p.continuityRoots
      );
  }

  it("points at the canonical Attestcoin precompile 0xFD2", async function () {
    expect((await attestor.verifierPrecompile()).toLowerCase()).to.equal(PRECOMPILE.toLowerCase());
  });

  it("ingests a proven Aave repayment and credits the borrower, not the submitter", async function () {
    // 5,000 USDC repaid on Ethereum Sepolia.
    await expect(ingest([repayLog(borrower.address, 5_000_000_000n)], 1))
      .to.emit(attestor, "CreditFactAttested")
      .withArgs(
        borrower.address,
        CHAIN.chainKey,
        ACTION.REPAYMENT,
        (v) => v !== ethers.ZeroHash,
        USDC,
        5_000_000_000n,
        5_000n * ONE_USD_E8
      );

    const facts = await attestor.factsOf(borrower.address);
    expect(facts.totalRepaidE8).to.equal(5_000n * ONE_USD_E8);
    expect(facts.repaymentCount).to.equal(1);
    expect(facts.chainCount).to.equal(1);
    expect(facts.attestationCount).to.equal(1);

    // The relayer who paid the gas earns nothing.
    expect(await attestor.hasAttestations(relayer.address)).to.equal(false);
  });

  it("rejects data the precompile refuses to verify", async function () {
    await verifier.setShouldVerify(false);
    await expect(ingest([repayLog(borrower.address, 5_000_000_000n)], 2)).to.be.revertedWith(
      "Proof of inclusion verification failed"
    );
    expect(await attestor.hasAttestations(borrower.address)).to.equal(false);
  });

  it("deduplicates a replayed proof by query id", async function () {
    await ingest([repayLog(borrower.address, 1_000_000_000n)], 3);
    // Same chainKey + height + merkle path => same query id.
    await expect(ingest([repayLog(borrower.address, 1_000_000_000n)], 3)).to.be.revertedWith(
      "Query already processed"
    );
    expect((await attestor.factsOf(borrower.address)).repaymentCount).to.equal(1);
  });

  it("ignores logs from an emitter nobody registered", async function () {
    const forged = repayLog(borrower.address, 999_000_000_000n, outsider.address);
    await expect(ingest([forged], 4)).to.emit(attestor, "NoRecognisedFacts");
    expect(await attestor.hasAttestations(borrower.address)).to.equal(false);
  });

  it("refuses a reverted source transaction", async function () {
    await expect(
      ingest([repayLog(borrower.address, 1_000_000_000n)], 5, { status: 0 })
    ).to.be.revertedWithCustomError(attestor, "SourceTxReverted");
  });

  it("blocks a direct ASCBase.execute call that would bypass chain attribution", async function () {
    const p = proofArgs(6);
    const encoded = encodeProvenTx({
      from: borrower.address,
      to: AAVE_POOL,
      logs: [repayLog(borrower.address, 1_000_000_000n)],
    });
    await expect(
      attestor.execute(
        ACTION.REPAYMENT,
        CHAIN.chainKey,
        5_000_000n,
        encoded,
        p.merkleRoot,
        p.siblings,
        p.lowerEndpointDigest,
        p.continuityRoots
      )
    ).to.be.revertedWithCustomError(attestor, "DirectExecuteForbidden");
  });

  it("rejects proofs from a chain that has not been enabled", async function () {
    const p = proofArgs(7);
    const encoded = encodeProvenTx({ from: borrower.address, to: AAVE_POOL, logs: [] });
    await expect(
      attestor.ingest(
        ACTION.REPAYMENT,
        999999n,
        1n,
        encoded,
        p.merkleRoot,
        p.siblings,
        p.lowerEndpointDigest,
        p.continuityRoots
      )
    ).to.be.revertedWithCustomError(attestor, "ChainNotEnabled");
  });

  it("folds several credit events from one proven transaction", async function () {
    await ingest(
      [repayLog(borrower.address, 2_000_000_000n), supplyLog(borrower.address, 10_000_000_000n)],
      8
    );
    const facts = await attestor.factsOf(borrower.address);
    expect(facts.totalRepaidE8).to.equal(2_000n * ONE_USD_E8);
    expect(facts.totalCollateralE8).to.equal(10_000n * ONE_USD_E8);
    expect(facts.attestationCount).to.equal(2);
  });

  it("counts liquidations and lets them depress the score", async function () {
    await ingest([repayLog(borrower.address, 50_000_000_000n)], 9);
    const clean = (await attestor.scoreOf(borrower.address)).score;

    await ingest([liquidationLog(borrower.address)], 10);
    const scarred = (await attestor.scoreOf(borrower.address)).score;

    expect((await attestor.factsOf(borrower.address)).liquidationCount).to.equal(1);
    expect(scarred).to.be.lessThan(clean);
  });

  it("raises the score as attested repayment history accumulates", async function () {
    const before = (await attestor.scoreOf(borrower.address)).score;
    expect(before).to.equal(300); // an unattested wallet gets no unearned credit

    await ingest([repayLog(borrower.address, 100_000_000_000n)], 11);
    const after = (await attestor.scoreOf(borrower.address)).score;
    expect(after).to.be.greaterThan(before);

    const b = await attestor.scoreOf(borrower.address);
    expect(b.repaymentPts).to.be.greaterThan(0);
    expect(b.safetyPts).to.be.greaterThan(0); // safety is earned once proofs exist
  });

  it("rewards credit proven across multiple chains", async function () {
    const second = TEST_CHAINS.ETHEREUM;
    await attestor.configureSourceChain(
      second.chainKey,
      second.name,
      second.genesisTimestamp,
      second.blockTimeSeconds,
      true
    );
    await attestor.configureAsset(second.chainKey, USDC, 6, ONE_USD_E8);
    await attestor.registerSchema(
      second.chainKey,
      AAVE_POOL,
      AAVE_V3_EVENTS.REPAY.topic0,
      AAVE_V3_EVENTS.REPAY.schema
    );

    await ingest([repayLog(borrower.address, 5_000_000_000n)], 12);
    const oneChain = await attestor.scoreOf(borrower.address);

    const p = proofArgs(13);
    await attestor.ingest(
      ACTION.REPAYMENT,
      second.chainKey,
      9_000_000n,
      encodeProvenTx({
        from: borrower.address,
        to: AAVE_POOL,
        logs: [repayLog(borrower.address, 5_000_000_000n)],
      }),
      p.merkleRoot,
      p.siblings,
      p.lowerEndpointDigest,
      p.continuityRoots
    );

    const twoChains = await attestor.scoreOf(borrower.address);
    expect((await attestor.factsOf(borrower.address)).chainCount).to.equal(2);
    expect(twoChains.diversityPts).to.be.greaterThan(oneChain.diversityPts);
  });

  it("gates registry writes behind REGISTRAR_ROLE", async function () {
    await expect(
      attestor
        .connect(outsider)
        .configureAsset(CHAIN.chainKey, USDC, 6, 999_999n)
    ).to.be.revertedWithCustomError(attestor, "AccessControlUnauthorizedAccount");
  });

  it("records activity but no dollar value for an unpriced asset", async function () {
    const unknown = "0x1111111111111111111111111111111111111111";
    await ingest([repayLog(borrower.address, 5_000_000_000n, AAVE_POOL, unknown)], 14);
    const facts = await attestor.factsOf(borrower.address);
    expect(facts.totalRepaidE8).to.equal(0);
    expect(facts.repaymentCount).to.equal(1); // still a proven repayment event
  });

  it("never lets a proven future block height manufacture wallet maturity", async function () {
    // A height far beyond present time would otherwise imply activity in the future.
    await ingest([repayLog(borrower.address, 1_000_000_000n)], 15, { height: 999_999_999n });
    const facts = await attestor.factsOf(borrower.address);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    expect(facts.firstActivityAt).to.be.lessThanOrEqual(now);
  });
});
