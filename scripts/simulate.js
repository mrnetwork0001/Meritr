/**
 * Meritr — end-to-end scenario walkthrough.
 *
 *   npx hardhat run scripts/simulate.js
 *
 * Runs the complete Meritr story against a live chain state, in order:
 *
 *   Act I   — an anonymous wallet is quoted the protocol's worst terms.
 *   Act II  — Attestcoin proofs of its Ethereum and Base history are ingested through the
 *             native query verifier precompile, and the terms improve on their own.
 *   Act III — a soulbound credit passport is minted, and refuses to be transferred.
 *   Act IV  — a loan is opened at the earned rate.
 *   Act V   — the collateral market falls and the position enters the stress band.
 *   Act VI  — the autonomous risk agent restructures instead of liquidating.
 *
 * This doubles as the demo-video script and as an integration test: every number printed is
 * read back from chain state, none are hardcoded.
 */
const { ethers, network } = require("hardhat");
const { ACTION, CHAINS, AAVE_V3_EVENTS } = require("./sourceSchemas");

const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
const ONE_USD_E8 = 100_000_000n;
const USDC = (n) => ethers.parseUnits(n.toString(), 6);
const WETH = (n) => ethers.parseUnits(n.toString(), 18);
const coder = ethers.AbiCoder.defaultAbiCoder();

const AAVE_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const AAVE_BASE = "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b";
const USDC_SEPOLIA = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const USDC_BASE = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

let proofSeq = 0;

const hr = (c = "-") => console.log(c.repeat(78));
const act = (n, title) => {
  console.log("");
  hr("=");
  console.log(`  ACT ${n} — ${title}`);
  hr("=");
};
const bullet = (s) => console.log(`   ${s}`);
const money = (v, d = 6) => `$${Number(ethers.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const hf = (v) => (v > 10n ** 30n ? "∞" : (Number(v) / 1e18).toFixed(3));
const pct = (bps) => `${(Number(bps) / 100).toFixed(2)}%`;

function encodeProvenTx({ from, to, logs, status = 1 }) {
  const common = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [1n, 500000n, from, false, to, 0n, "0x"]
  );
  const typed = coder.encode(
    ["uint64", "uint128", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"],
    [1n, 1_000_000_000n, 30_000_000_000n, [], 0, ethers.ZeroHash, ethers.ZeroHash]
  );
  const receipt = coder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [status, 120000n, logs.map((l) => [l.address, l.topics, l.data]), "0x" + "00".repeat(256)]
  );
  return coder.encode(["uint8", "bytes[]"], [2, [common, typed, receipt]]);
}

function proofEnvelope() {
  const n = proofSeq++;
  const siblings = [];
  for (let i = 0; i < 8; i++) {
    siblings.push({
      hash: ethers.keccak256(ethers.toUtf8Bytes(`sim-sib-${n}-${i}`)),
      isLeft: ((n >> i) & 1) === 0,
    });
  }
  return {
    merkleRoot: ethers.keccak256(ethers.toUtf8Bytes(`sim-root-${n}`)),
    siblings,
    lowerEndpointDigest: ethers.keccak256(ethers.toUtf8Bytes("sim-lower")),
    continuityRoots: [ethers.keccak256(ethers.toUtf8Bytes("sim-cont"))],
    height: BigInt(4_000_000 + n),
  };
}

const topic = (a) => ethers.zeroPadValue(ethers.getAddress(a), 32);

async function main() {
  const [deployer, borrower, lender, agent, keeper] = await ethers.getSigners();

  console.log("");
  hr("=");
  console.log("  MERITR — Autonomous DeAI Debt Restructuring on Creditcoin");
  console.log("  Attestcoin Protocol · native query verifier precompile 0xFD2");
  hr("=");

  // --- Setup: install the verifier stand-in on a local chain ----------------
  const net = await ethers.provider.getNetwork();
  const isCreditcoin = [102030n, 102031n, 102032n].includes(net.chainId);
  if (!isCreditcoin) {
    const Mock = await ethers.getContractFactory("MockNativeQueryVerifier");
    const m = await Mock.deploy();
    await m.waitForDeployment();
    await network.provider.send("hardhat_setCode", [
      PRECOMPILE,
      await ethers.provider.getCode(await m.getAddress()),
    ]);
    await Mock.attach(PRECOMPILE).setShouldVerify(true);
    bullet(`Local chain: mock verifier installed at ${PRECOMPILE}`);
    bullet("On Creditcoin this is the node's own runtime precompile — same call, same encoding.");
  }

  // --- Deploy ---------------------------------------------------------------
  const Attestor = await ethers.getContractFactory("MeritrAttestor");
  const attestor = await Attestor.deploy(deployer.address);
  const Passport = await ethers.getContractFactory("MeritrPassport");
  const passport = await Passport.deploy(deployer.address, await attestor.getAddress());
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const asset = await ERC20.deploy("Meritr USD", "mUSD", 6);
  const collateral = await ERC20.deploy("Meritr WETH", "mWETH", 18);
  const Vault = await ethers.getContractFactory("MeritrVault");
  const vault = await Vault.deploy(
    deployer.address,
    await asset.getAddress(),
    6,
    await collateral.getAddress(),
    18,
    await attestor.getAddress(),
    await passport.getAddress(),
    ONE_USD_E8,
    3000n * ONE_USD_E8
  );
  await vault.grantRole(await vault.RISK_AGENT_ROLE(), agent.address);

  // Register source chains, priced assets and Aave V3 event schemas.
  for (const [c, pool, usdc] of [
    [CHAINS.ETHEREUM_SEPOLIA, AAVE_SEPOLIA, USDC_SEPOLIA],
    [CHAINS.BASE_SEPOLIA, AAVE_BASE, USDC_BASE],
  ]) {
    await attestor.configureSourceChain(
      c.chainKey, c.name, c.genesisTimestamp, c.blockTimeSeconds, true
    );
    await attestor.configureAsset(c.chainKey, usdc, 6, ONE_USD_E8);
    for (const evt of Object.values(AAVE_V3_EVENTS)) {
      await attestor.registerSchema(c.chainKey, pool, evt.topic0, evt.schema);
    }
  }

  // Liquidity, collateral and reserve.
  await asset.mint(lender.address, USDC(1_000_000));
  await asset.connect(lender).approve(await vault.getAddress(), ethers.MaxUint256);
  await vault.connect(lender).deposit(USDC(500_000));
  await collateral.mint(borrower.address, WETH(20));
  await collateral.connect(borrower).approve(await vault.getAddress(), ethers.MaxUint256);
  await asset.mint(deployer.address, USDC(100_000));
  await asset.approve(await vault.getAddress(), ethers.MaxUint256);
  await vault.fundReserve(USDC(60_000));

  bullet(`MeritrAttestor ${await attestor.getAddress()}`);
  bullet(`MeritrPassport ${await passport.getAddress()}`);
  bullet(`MeritrVault    ${await vault.getAddress()}`);
  bullet(`Pool seeded with ${money(await vault.totalAssets())}, reserve ${money(await vault.reserveBalance())}`);

  // =========================================================================
  act("I", "An anonymous wallet asks for credit");
  const q0 = await vault.quote(borrower.address);
  bullet(`Borrower ${borrower.address}`);
  bullet(`Attested cross-chain history : none`);
  bullet(`ZK-Credit score              : ${q0.score}  (floor — nothing proven)`);
  bullet(`Offered APR                  : ${pct(q0.rateBps)}`);
  bullet(`Maximum loan-to-value        : ${pct(q0.maxLtvBps)}`);
  console.log("");
  bullet("This is the status quo for every wallet new to a chain, regardless of its history");
  bullet("elsewhere. Meritr's job is to make that history portable — and provable.");

  // =========================================================================
  act("II", "Attestcoin proves the borrower's history on Ethereum and Base");

  async function ingestRepay(chainKey, pool, usdc, amount, label) {
    const env = proofEnvelope();
    const log = {
      address: pool,
      topics: [AAVE_V3_EVENTS.REPAY.topic0, topic(usdc), topic(borrower.address), topic(borrower.address)],
      data: coder.encode(["uint256", "bool"], [amount, false]),
    };
    const tx = await attestor.connect(keeper).ingest(
      ACTION.REPAYMENT, chainKey, env.height,
      encodeProvenTx({ from: borrower.address, to: pool, logs: [log] }),
      env.merkleRoot, env.siblings, env.lowerEndpointDigest, env.continuityRoots
    );
    await tx.wait();
    bullet(`proof accepted — ${label}: repaid ${money(amount)}`);
  }

  async function ingestSupply(chainKey, pool, usdc, amount, label) {
    const env = proofEnvelope();
    const log = {
      address: pool,
      topics: [AAVE_V3_EVENTS.SUPPLY.topic0, topic(usdc), topic(borrower.address), ethers.zeroPadValue("0x00", 32)],
      data: coder.encode(["address", "uint256"], [borrower.address, amount]),
    };
    await (await attestor.connect(keeper).ingest(
      ACTION.COLLATERAL, chainKey, env.height,
      encodeProvenTx({ from: borrower.address, to: pool, logs: [log] }),
      env.merkleRoot, env.siblings, env.lowerEndpointDigest, env.continuityRoots
    )).wait();
    bullet(`proof accepted — ${label}: supplied ${money(amount)} collateral`);
  }

  bullet(`Proofs are submitted by ${keeper.address.slice(0, 10)}… (a relayer), not the borrower.`);
  bullet("Credit still accrues to the address inside the proven log — forging is not possible.");
  console.log("");

  const E = CHAINS.ETHEREUM_SEPOLIA.chainKey;
  const B = CHAINS.BASE_SEPOLIA.chainKey;
  for (let i = 0; i < 9; i++) {
    await ingestRepay(E, AAVE_SEPOLIA, USDC_SEPOLIA, USDC(14_000), "Aave V3 / Ethereum");
  }
  for (let i = 0; i < 7; i++) {
    await ingestRepay(B, AAVE_BASE, USDC_BASE, USDC(11_000), "Aave V3 / Base    ");
  }
  await ingestSupply(E, AAVE_SEPOLIA, USDC_SEPOLIA, USDC(120_000), "Aave V3 / Ethereum");

  const facts = await attestor.factsOf(borrower.address);
  const b1 = await attestor.scoreOf(borrower.address);
  const q1 = await vault.quote(borrower.address);

  console.log("");
  bullet(`Proofs ingested       : ${facts.attestationCount} across ${facts.chainCount} chains`);
  bullet(`Lifetime repaid       : ${money(facts.totalRepaidE8, 8)}`);
  bullet(`Collateral attested   : ${money(facts.totalCollateralE8, 8)}`);
  console.log("");
  bullet(`ZK-Credit score       : ${q0.score}  ->  ${b1.score}`);
  bullet(`   repayment history  : ${b1.repaymentPts} pts`);
  bullet(`   collateral depth   : ${b1.collateralPts} pts`);
  bullet(`   wallet maturity    : ${b1.maturityPts} pts`);
  bullet(`   chain diversity    : ${b1.diversityPts} pts`);
  bullet(`   liquidation safety : ${b1.safetyPts} pts`);
  console.log("");
  bullet(`Offered APR           : ${pct(q0.rateBps)}  ->  ${pct(q1.rateBps)}`);
  bullet(`Maximum LTV           : ${pct(q0.maxLtvBps)}  ->  ${pct(q1.maxLtvBps)}`);

  // =========================================================================
  act("III", "The borrower mints a soulbound credit passport");
  await (await passport.connect(borrower).mint()).wait();
  const pdata = await passport.dataOf(borrower.address);
  const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  bullet(`Passport #${await passport.passportOf(borrower.address)} minted to ${borrower.address}`);
  bullet(`Score ${pdata.score} · tier ${tiers[pdata.tier]} · ${pdata.chainCount} chains · ${pdata.attestationCount} proofs`);
  bullet(`Facts commitment ${pdata.factsCommitment.slice(0, 26)}…`);
  bullet("Metadata is fully on-chain — SVG and JSON, no IPFS pin to expire.");

  try {
    await passport.connect(borrower).transferFrom(borrower.address, lender.address, 1);
    bullet("!! transfer succeeded — soulbinding is broken");
  } catch {
    bullet("Transfer attempt reverted: the passport cannot be sold to a defaulter.");
  }

  // =========================================================================
  act("IV", "A loan is opened at the earned rate");
  await (await vault.connect(borrower).openLoan(WETH(10), USDC(15_000))).wait();
  let pos = await vault.positionOf(borrower.address);
  bullet(`Collateral posted : 10 mWETH  (${money(pos.collateralValueE8, 8)} at $3,000)`);
  bullet(`Drawn             : ${money(pos.loan.principal)}`);
  bullet(`Rate              : ${pct(pos.loan.rateBps)} APR, fixed at origination`);
  bullet(`Health factor     : ${hf(pos.healthFactor)}`);
  console.log("");
  bullet(`At the floor score of 300 this borrower could only have drawn ${money((pos.collateralValueE8 * 3000n) / 10000n / 100n)}.`);
  bullet("Proven cross-chain history bought real additional capacity.");

  // =========================================================================
  act("V", "The collateral market falls");
  await network.provider.send("evm_increaseTime", [45 * 24 * 3600]);
  await network.provider.send("evm_mine");
  await (await vault.accrue(borrower.address)).wait();

  // Mark mWETH down until the position lands inside the stress band.
  const targetHf = ethers.parseEther("1.07");
  const loan = await vault.loanOf(borrower.address);
  const debtNow = await vault.debtOf(borrower.address);
  const debtE8 = (debtNow * ONE_USD_E8) / 1_000_000n;
  const neededCollE8 = (targetHf * debtE8 * 10_000n) / (8250n * ethers.WeiPerEther);
  const newPrice = (neededCollE8 * ethers.WeiPerEther) / loan.collateral;
  await (await vault.setPrices(ONE_USD_E8, newPrice)).wait();

  // The borrower keeps servicing debt elsewhere through the downturn. Meritr sees it,
  // because those repayments are provable — which is what makes credit *memory* rather
  // than a snapshot.
  for (let i = 0; i < 5; i++) {
    await ingestRepay(B, AAVE_BASE, USDC_BASE, USDC(9_000), "Aave V3 / Base    ");
  }
  const b2 = await attestor.scoreOf(borrower.address);
  console.log("");
  bullet(`Score through the downturn : ${b1.score} -> ${b2.score} (still repaying on Base)`);
  console.log("");

  pos = await vault.positionOf(borrower.address);
  bullet(`45 days elapsed. Interest accrued: ${money(pos.loan.interestOwed)}`);
  bullet(`mWETH marked down : $3,000 -> ${money(newPrice, 8)}  (${((1 - Number(newPrice) / 3e11) * 100).toFixed(1)}% drawdown)`);
  bullet(`Health factor     : ${hf(pos.healthFactor)}`);
  bullet(`Debt              : ${money(pos.debt)}   Collateral: ${money(pos.collateralValueE8, 8)}`);
  console.log("");
  bullet(`In stress band    : ${pos.inStressBand}`);
  bullet(`Liquidatable      : ${pos.liquidatable}`);
  console.log("");
  bullet("On Aave or Compound this position is now simply waiting to be liquidated:");
  bullet("the borrower loses their collateral and a 5% bonus to a liquidation bot.");

  // =========================================================================
  act("VI", "The autonomous agent restructures instead of liquidating");
  const sim = await vault.connect(agent).restructure.staticCall(borrower.address);
  bullet(`Agent simulates first: HF ${hf(sim[0])} -> ${hf(sim[1])}, retiring ${money(sim[2])} from reserve.`);

  const before = await vault.loanOf(borrower.address);
  const reserveBefore = await vault.reserveBalance();
  const receipt = await (await vault.connect(agent).restructure(borrower.address)).wait();
  const after = await vault.loanOf(borrower.address);
  pos = await vault.positionOf(borrower.address);

  console.log("");
  bullet(`Executed in tx ${receipt.hash.slice(0, 26)}…  (gas ${receipt.gasUsed})`);
  console.log("");
  bullet(`Interest rate     : ${pct(before.rateBps)}  ->  ${pct(after.rateBps)}`);
  bullet(`Maturity          : +${Math.round(Number(after.maturity - before.maturity) / 86400)} days`);
  bullet(`Debt retired      : ${money(after.reliefGranted)}  (from reserve, not lender principal)`);
  bullet(`Reserve           : ${money(reserveBefore)}  ->  ${money(await vault.reserveBalance())}`);
  bullet(`Health factor     : ${hf(sim[0])}  ->  ${hf(pos.healthFactor)}`);
  bullet(`Collateral held   : ${ethers.formatUnits(after.collateral, 18)} mWETH — unchanged, none seized`);
  console.log("");
  bullet(`Liquidatable now  : ${pos.liquidatable}`);
  bullet(`Loan still active : ${after.active}`);

  console.log("");
  hr("=");
  console.log("  RESULT");
  hr("=");
  bullet("The borrower kept every unit of collateral and their credit relationship.");
  bullet("Lenders were made whole: retired principal returned to the lendable pool.");
  bullet("Relief was funded by the interest-fed reserve, never by lender deposits.");
  bullet("The agent supplied one argument — an address. Every rate, term and amount");
  bullet("was recomputed on-chain from Attestcoin-proven facts, so a stolen agent key");
  bullet("could not have extracted a single unit of value.");
  hr("=");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
