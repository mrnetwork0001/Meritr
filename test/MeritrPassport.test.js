const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  encodeProvenTx,
  addressTopic,
  packData,
  installMockPrecompile,
  proofArgs,
} = require("./helpers");
const { ACTION, CHAINS, AAVE_V3_EVENTS } = require("../scripts/sourceSchemas");

const CHAIN = CHAINS.ETHEREUM_SEPOLIA;
const AAVE_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const USDC_SRC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const ONE_USD_E8 = 100_000_000n;

describe("MeritrPassport — soulbound credit passport", function () {
  let passport, attestor, admin, holder, other;
  let proofIndex = 500;

  async function attest(who, usdcAmount) {
    const idx = proofIndex++;
    const p = proofArgs(idx);
    const log = {
      address: AAVE_POOL,
      topics: [
        AAVE_V3_EVENTS.REPAY.topic0,
        addressTopic(USDC_SRC),
        addressTopic(who),
        addressTopic(who),
      ],
      data: packData(["uint256", "bool"], [usdcAmount, false]),
    };
    await attestor.ingest(
      ACTION.REPAYMENT,
      CHAIN.chainKey,
      BigInt(4_000_000 + idx),
      encodeProvenTx({ from: who, to: AAVE_POOL, logs: [log] }),
      p.merkleRoot,
      p.siblings,
      p.lowerEndpointDigest,
      p.continuityRoots
    );
  }

  beforeEach(async function () {
    [admin, holder, other] = await ethers.getSigners();
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
    await attestor.registerSchema(
      CHAIN.chainKey,
      AAVE_POOL,
      AAVE_V3_EVENTS.REPAY.topic0,
      AAVE_V3_EVENTS.REPAY.schema
    );

    const Passport = await ethers.getContractFactory("MeritrPassport");
    passport = await Passport.deploy(admin.address, await attestor.getAddress());
  });

  it("refuses to mint for a wallet with no proven history", async function () {
    await expect(passport.connect(holder).mint()).to.be.revertedWithCustomError(
      passport,
      "NoAttestationsYet"
    );
  });

  it("mints once history exists and stamps the live score", async function () {
    await attest(holder.address, ethers.parseUnits("50000", 6));
    await expect(passport.connect(holder).mint()).to.emit(passport, "PassportMinted");

    const data = await passport.dataOf(holder.address);
    expect(data.score).to.equal((await attestor.scoreOf(holder.address)).score);
    expect(data.chainCount).to.equal(1);
    expect(data.attestationCount).to.equal(1);
    expect(await passport.ownerOf(1)).to.equal(holder.address);
  });

  it("allows only one passport per address", async function () {
    await attest(holder.address, ethers.parseUnits("50000", 6));
    await passport.connect(holder).mint();
    await expect(passport.connect(holder).mint()).to.be.revertedWithCustomError(
      passport,
      "PassportAlreadyIssued"
    );
  });

  describe("soulbound enforcement", function () {
    beforeEach(async function () {
      await attest(holder.address, ethers.parseUnits("50000", 6));
      await passport.connect(holder).mint();
    });

    it("blocks transferFrom", async function () {
      await expect(
        passport.connect(holder).transferFrom(holder.address, other.address, 1)
      ).to.be.revertedWithCustomError(passport, "SoulboundTransferDisabled");
    });

    it("blocks safeTransferFrom", async function () {
      await expect(
        passport
          .connect(holder)
          ["safeTransferFrom(address,address,uint256)"](holder.address, other.address, 1)
      ).to.be.revertedWithCustomError(passport, "SoulboundTransferDisabled");
    });

    it("blocks approvals, so no marketplace can ever list a score", async function () {
      await expect(passport.connect(holder).approve(other.address, 1)).to.be.revertedWithCustomError(
        passport,
        "SoulboundTransferDisabled"
      );
      await expect(
        passport.connect(holder).setApprovalForAll(other.address, true)
      ).to.be.revertedWithCustomError(passport, "SoulboundTransferDisabled");
    });
  });

  describe("refresh and commitment", function () {
    beforeEach(async function () {
      await attest(holder.address, ethers.parseUnits("50000", 6));
      await passport.connect(holder).mint();
    });

    it("restamps the score as new cross-chain proofs land", async function () {
      const before = (await passport.dataOf(holder.address)).score;
      await attest(holder.address, ethers.parseUnits("150000", 6));

      await expect(passport.connect(other).refresh(holder.address)).to.emit(
        passport,
        "PassportRefreshed"
      );
      expect((await passport.dataOf(holder.address)).score).to.be.greaterThan(before);
    });

    it("publishes a commitment that binds the exact attested facts", async function () {
      // ethers v6 returns a frozen Result; commitFacts needs a plain struct object.
      const facts = (await attestor.factsOf(holder.address)).toObject();
      const expected = await passport.commitFacts(facts);
      expect((await passport.dataOf(holder.address)).factsCommitment).to.equal(expected);
    });

    it("breaks the commitment if disclosed facts are altered by a single unit", async function () {
      const facts = (await attestor.factsOf(holder.address)).toObject();
      const tampered = { ...facts, totalRepaidE8: facts.totalRepaidE8 + 1n };
      const forged = await passport.commitFacts(tampered);
      expect(forged).to.not.equal((await passport.dataOf(holder.address)).factsCommitment);
    });

    it("rejects refresh for an address with no passport", async function () {
      await expect(passport.refresh(other.address)).to.be.revertedWithCustomError(
        passport,
        "NoPassport"
      );
    });
  });

  it("serves fully on-chain metadata with no external dependency", async function () {
    await attest(holder.address, ethers.parseUnits("50000", 6));
    await passport.connect(holder).mint();

    const uri = await passport.tokenURI(1);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);

    const json = JSON.parse(
      Buffer.from(uri.split(",")[1], "base64").toString("utf8")
    );
    expect(json.name).to.equal("Meritr Credit Passport #1");
    expect(json.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);

    const svg = Buffer.from(json.image.split(",")[1], "base64").toString("utf8");
    expect(svg).to.include("<svg");
    expect(svg).to.include("MERITR CREDIT PASSPORT");

    const traits = Object.fromEntries(json.attributes.map((a) => [a.trait_type, a.value]));
    expect(traits.Soulbound).to.equal("true");
    expect(traits["ZK-Credit Score"]).to.equal(
      Number((await passport.dataOf(holder.address)).score)
    );
  });

  it("assigns a tier that tracks the score band", async function () {
    await attest(holder.address, ethers.parseUnits("1000", 6));
    await passport.connect(holder).mint();
    const low = await passport.dataOf(holder.address);

    await attest(holder.address, ethers.parseUnits("240000", 6));
    await passport.refresh(holder.address);
    const high = await passport.dataOf(holder.address);

    expect(high.score).to.be.greaterThan(low.score);
    expect(high.tier).to.be.greaterThanOrEqual(low.tier);
  });
});
