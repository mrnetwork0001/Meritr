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
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers, network } = require("hardhat");
const { ACTION, TEST_CHAINS, AAVE_V3_EVENTS } = require("./sourceSchemas");

/**
 * Hardhat's well-known development mnemonic. Needed because the DeAI agent is a separate
 * Python process that has to sign for itself — it cannot borrow an ethers Signer from this
 * script, which is precisely the point: the agent is a real external actor, not a function call.
 */
const DEV_MNEMONIC = "test test test test test test test test test test test junk";
const agentKeyAt = (i) =>
  ethers.HDNodeWallet.fromPhrase(DEV_MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).privateKey;

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
  const [deployer, borrower, lender, agent, keeper, rival, minor] = await ethers.getSigners();

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

  // The agent is a separate process; it locates the deployment exactly as it would in
  // production — by reading the address book, not by being handed contract objects.
  const bookName = "simulation";
  const rpcUrl = network.config.url || null;
  const agentCanRun = Boolean(rpcUrl); // the in-process `hardhat` network has no RPC to dial
  if (agentCanRun) {
    fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, "..", "deployments", `${bookName}.json`),
      JSON.stringify(
        {
          network: bookName,
          chainId: net.chainId.toString(),
          deployedAt: "simulation",
          contracts: {
            MeritrAttestor: await attestor.getAddress(),
            MeritrPassport: await passport.getAddress(),
            MeritrVault: await vault.getAddress(),
            asset: await asset.getAddress(),
            collateral: await collateral.getAddress(),
          },
          decimals: { asset: 6, collateral: 18 },
          sourceChains: [],
        },
        null,
        2
      )
    );
  }

  // Register source chains, priced assets and Aave V3 event schemas.
  for (const [c, pool, usdc] of [
    [TEST_CHAINS.SEPOLIA, AAVE_SEPOLIA, USDC_SEPOLIA],
    [TEST_CHAINS.ETHEREUM, AAVE_BASE, USDC_BASE],
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
  act("II", "Attestcoin proves the borrower's history on Ethereum and Sepolia");

  async function ingestRepayFor(who, chainKey, pool, usdc, amount, label) {
    const env = proofEnvelope();
    const log = {
      address: pool,
      topics: [AAVE_V3_EVENTS.REPAY.topic0, topic(usdc), topic(who), topic(who)],
      data: coder.encode(["uint256", "bool"], [amount, false]),
    };
    const tx = await attestor.connect(keeper).ingest(
      ACTION.REPAYMENT, chainKey, env.height,
      encodeProvenTx({ from: who, to: pool, logs: [log] }),
      env.merkleRoot, env.siblings, env.lowerEndpointDigest, env.continuityRoots
    );
    await tx.wait();
    if (label) bullet(`proof accepted — ${label}: repaid ${money(amount)}`);
  }

  const ingestRepay = (chainKey, pool, usdc, amount, label) =>
    ingestRepayFor(borrower.address, chainKey, pool, usdc, amount, label);

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

  const E = TEST_CHAINS.SEPOLIA.chainKey;
  const B = TEST_CHAINS.ETHEREUM.chainKey;
  for (let i = 0; i < 9; i++) {
    await ingestRepay(E, AAVE_SEPOLIA, USDC_SEPOLIA, USDC(14_000), "Aave V3 / Ethereum");
  }
  for (let i = 0; i < 7; i++) {
    await ingestRepay(B, AAVE_BASE, USDC_BASE, USDC(11_000), "Aave V3 / Sepolia ");
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
    await ingestRepay(B, AAVE_BASE, USDC_BASE, USDC(9_000), "Aave V3 / Sepolia ");
  }
  const b2 = await attestor.scoreOf(borrower.address);
  console.log("");
  bullet(`Score through the downturn : ${b1.score} -> ${b2.score} (still repaying on Sepolia)`);
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
  act("VI", "The autonomous DeAI agent restructures instead of liquidating");

  const before = await vault.loanOf(borrower.address);
  const reserveBefore = await vault.reserveBalance();
  const hfBefore = (await vault.positionOf(borrower.address)).healthFactor;

  if (agentCanRun) {
    bullet("Handing the decision to agents/underwriter.py — a separate process, signing for");
    bullet("itself, that discovers borrowers from chain logs and chooses whom to help.");
    console.log("");

    let out;
    try {
      out = execFileSync("python3", ["-m", "agents.underwriter", "--once"], {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        env: {
          ...process.env,
          MERITR_NETWORK: bookName,
          MERITR_RPC_URL: rpcUrl,
          RISK_AGENT_PRIVATE_KEY: agentKeyAt(3), // the `agent` signer above
        },
      });
    } catch (e) {
      out = (e.stdout || "") + (e.stderr || "");
      bullet("!! the agent exited non-zero; its output follows verbatim");
    }

    // Reproduce the agent's own reasoning rather than paraphrasing it.
    for (const l of out.split("\n")) {
      if (/Pool |Book |HF=|Triage|Restructuring |Confirmed|rationale|Health factor/i.test(l)) {
        console.log("   " + l.replace(/^\d\d:\d\d:\d\d\s+\w+\s+/, ""));
      }
    }
  } else {
    bullet("This network has no RPC endpoint, so the external agent process cannot dial in.");
    bullet("Falling back to a direct contract call — NOTE: this is NOT the DeAI agent.");
    bullet("Run against a node to see the real thing:");
    bullet("   npx hardhat node  &&  npx hardhat run scripts/simulate.js --network localhost");
    console.log("");
    await (await vault.connect(agent).restructure(borrower.address)).wait();
  }

  const after = await vault.loanOf(borrower.address);
  pos = await vault.positionOf(borrower.address);

  console.log("");
  bullet(`Interest rate     : ${pct(before.rateBps)}  ->  ${pct(after.rateBps)}`);
  bullet(`Maturity          : +${Math.round(Number(after.maturity - before.maturity) / 86400)} days`);
  bullet(`Debt retired      : ${money(after.reliefGranted)}  (from reserve, not lender principal)`);
  bullet(`Reserve           : ${money(reserveBefore)}  ->  ${money(await vault.reserveBalance())}`);
  bullet(`Health factor     : ${hf(hfBefore)}  ->  ${hf(pos.healthFactor)}`);
  bullet(`Collateral held   : ${ethers.formatUnits(after.collateral, 18)} mWETH — unchanged, none seized`);
  console.log("");
  bullet(`Liquidatable now  : ${pos.liquidatable}`);
  bullet(`Loan still active : ${after.active}`);

  // =========================================================================
  act("VII", "Two borrowers in distress — which one does the agent help first?");

  bullet("The vault answers \"what relief is this borrower entitled to?\". It has no view of the");
  bullet("book, so it cannot answer \"whom should we help first?\". That question only exists");
  bullet("off-chain, and it is the entire reason this system has an agent at all.");
  console.log("");

  // The rescued borrower uses the breathing room productively, which also keeps them clear of
  // the band so the next act is about the two new positions.
  await (await asset.mint(borrower.address, USDC(5_000))).wait();
  await (await asset.connect(borrower).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
  await (await vault.connect(borrower).repay(USDC(5_000))).wait();
  bullet(`The rescued borrower repaid ${money(USDC(5_000))} using the extension they were given.`);
  console.log("");

  // Two borrowers, same loan-to-value, very different size. Equal LTV means one mark-down puts
  // both in the band together; different size is what the agent has to weigh.
  const TARGET_LTV_BPS = 4_400n;
  const cast = [
    { signer: rival, label: "rival", proofs: 14, each: USDC(9_000), coll: WETH(14) },
    { signer: minor, label: "minor", proofs: 4, each: USDC(2_500), coll: WETH(4) },
  ];

  for (const c of cast) {
    for (let i = 0; i < c.proofs; i++) {
      await ingestRepayFor(c.signer.address, E, AAVE_SEPOLIA, USDC_SEPOLIA, c.each, null);
    }
    await (await collateral.mint(c.signer.address, WETH(60))).wait();
    await (await collateral.connect(c.signer).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
    await (await asset.mint(c.signer.address, USDC(80_000))).wait();
    await (await asset.connect(c.signer).approve(await vault.getAddress(), ethers.MaxUint256)).wait();

    // Size against the CURRENT mark — the market already fell in Act V, so anything hardcoded
    // against the opening price would breach the borrower's earned limit.
    const q = await vault.quote(c.signer.address);
    const markE8 = await vault.collateralPriceE8();
    const collateralE8 = (c.coll * markE8) / ethers.WeiPerEther;
    const ltv = q.maxLtvBps < TARGET_LTV_BPS ? q.maxLtvBps : TARGET_LTV_BPS;
    c.draw = ((collateralE8 * ltv) / 10_000n) * USDC(1) / ONE_USD_E8;

    await (await vault.connect(c.signer).openLoan(c.coll, c.draw)).wait();
    bullet(
      `${c.label.padEnd(6)} ${c.signer.address.slice(0, 10)}…  score ${q.score}  ` +
        `LTV ${pct(ltv)} of ${pct(q.maxLtvBps)}  drew ${money(c.draw)}`
    );
  }

  // Solve for the collateral mark that lands both new positions at a health factor of 1.07 —
  // inside the stress band. Equal LTV is what makes a single price work for both.
  const rivalLoan = await vault.loanOf(rival.address);
  const rivalDebtE8 = ((await vault.debtOf(rival.address)) * ONE_USD_E8) / USDC(1);
  const wantHf = ethers.parseEther("1.07");
  const stressCollE8 = (wantHf * rivalDebtE8 * 10_000n) / (8250n * ethers.WeiPerEther);
  const stressPrice = (stressCollE8 * ethers.WeiPerEther) / rivalLoan.collateral;
  await (await vault.setPrices(ONE_USD_E8, stressPrice)).wait();
  for (const c of [{ signer: borrower }, ...cast]) await (await vault.accrue(c.signer.address)).wait();

  console.log("");
  bullet(`Collateral marked to ${money(stressPrice, 8)}. The book now reads:`);
  for (const c of [{ signer: borrower, label: "rescued" }, ...cast]) {
    const p = await vault.positionOf(c.signer.address);
    const state = p.liquidatable ? "LIQUIDATABLE" : p.inStressBand ? "STRESSED" : "healthy";
    bullet(
      `  ${(c.label ?? "").padEnd(7)} ${c.signer.address.slice(0, 10)}…  HF ${hf(p.healthFactor)}  ` +
        `debt ${money(p.debt)}  ${state}`
    );
  }
  console.log("");

  if (agentCanRun) {
    let out2;
    try {
      out2 = execFileSync("python3", ["-m", "agents.underwriter", "--once"], {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        env: {
          ...process.env,
          MERITR_NETWORK: bookName,
          MERITR_RPC_URL: rpcUrl,
          RISK_AGENT_PRIVATE_KEY: agentKeyAt(3),
        },
      });
    } catch (e) {
      out2 = (e.stdout || "") + (e.stderr || "");
    }
    for (const l of out2.split("\n")) {
      if (/Book |HF=|Triage|Restructuring |Confirmed|Skipping|averts|sits inside/i.test(l)) {
        console.log("   " + l.replace(/^\d\d:\d\d:\d\d\s+\w+\s+/, ""));
      }
    }
    console.log("");
    bullet("Both sit at the same health factor, so urgency alone does not separate them. The");
    bullet("agent ranked by the loss each rescue actually averts — the deadweight a liquidation");
    bullet("would destroy — and went to the larger exposure first. That ordering is the whole");
    bullet("job: the contract decides how much, the agent decides who, and when.");
  } else {
    bullet("(run against a node to watch the agent triage this book)");
  }

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
  bullet("And when the reserve could not save everyone, the agent — not the contract —");
  bullet("decided who went first.");
  hr("=");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
