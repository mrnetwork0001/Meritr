/**
 * Seed a local node with a full Meritr scenario, so the backend and dashboard have real state.
 *
 *   npx hardhat node                                   # terminal 1
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/seedLocal.js --network localhost
 *
 * Creates three borrowers in deliberately different conditions — healthy, stressed, and
 * near-liquidation — so the risk agent and the dashboard have something meaningful to show.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { ACTION, TEST_CHAINS, AAVE_V3_EVENTS } = require("./sourceSchemas");

const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
const ONE_USD_E8 = 100_000_000n;
const USDC = (n) => ethers.parseUnits(n.toString(), 6);
const WETH = (n) => ethers.parseUnits(n.toString(), 18);
const coder = ethers.AbiCoder.defaultAbiCoder();
const AAVE_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const USDC_SEPOLIA = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const topic = (a) => ethers.zeroPadValue(ethers.getAddress(a), 32);

let seq = 0;
function envelope() {
  const n = seq++;
  const siblings = [];
  for (let i = 0; i < 8; i++) {
    siblings.push({
      hash: ethers.keccak256(ethers.toUtf8Bytes(`seed-${n}-${i}`)),
      isLeft: ((n >> i) & 1) === 0,
    });
  }
  return {
    merkleRoot: ethers.keccak256(ethers.toUtf8Bytes(`seed-root-${n}`)),
    siblings,
    lowerEndpointDigest: ethers.keccak256(ethers.toUtf8Bytes("lower")),
    continuityRoots: [ethers.keccak256(ethers.toUtf8Bytes("cont"))],
    height: BigInt(4_500_000 + n),
  };
}
function encodeTx({ from, to, logs }) {
  const common = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [1n, 500000n, from, false, to, 0n, "0x"]
  );
  const typed = coder.encode(
    ["uint64", "uint128", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"],
    [1n, 1n, 1n, [], 0, ethers.ZeroHash, ethers.ZeroHash]
  );
  const receipt = coder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [1, 1n, logs.map((l) => [l.address, l.topics, l.data]), "0x00"]
  );
  return coder.encode(["uint8", "bytes[]"], [2, [common, typed, receipt]]);
}

async function main() {
  const book = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`))
  );
  const [deployer, , lender, agent, keeper, alice, bob, carol] = await ethers.getSigners();

  const attestor = await ethers.getContractAt("MeritrAttestor", book.contracts.MeritrAttestor);
  const passport = await ethers.getContractAt("MeritrPassport", book.contracts.MeritrPassport);
  const vault = await ethers.getContractAt("MeritrVault", book.contracts.MeritrVault);
  const asset = await ethers.getContractAt("MockERC20", book.contracts.asset);
  const collateral = await ethers.getContractAt("MockERC20", book.contracts.collateral);

  // Ensure a verifier exists at the precompile address on this local chain.
  if ((await ethers.provider.getCode(PRECOMPILE)) === "0x") {
    const Mock = await ethers.getContractFactory("MockNativeQueryVerifier");
    const m = await Mock.deploy();
    await m.waitForDeployment();
    await network.provider.send("hardhat_setCode", [
      PRECOMPILE,
      await ethers.provider.getCode(await m.getAddress()),
    ]);
    await Mock.attach(PRECOMPILE).setShouldVerify(true);
    console.log(`Mock Attestcoin verifier installed at ${PRECOMPILE}`);
  }

  await (await vault.grantRole(await vault.RISK_AGENT_ROLE(), agent.address)).wait();

  // Liquidity + reserve.
  await (await asset.mint(lender.address, USDC(2_000_000))).wait();
  await (await asset.connect(lender).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
  await (await vault.connect(lender).deposit(USDC(800_000))).wait();
  await (await asset.mint(deployer.address, USDC(200_000))).wait();
  await (await asset.approve(await vault.getAddress(), ethers.MaxUint256)).wait();
  await (await vault.fundReserve(USDC(120_000))).wait();

  async function attest(who, count, amount) {
    for (let i = 0; i < count; i++) {
      const e = envelope();
      const log = {
        address: AAVE_SEPOLIA,
        topics: [AAVE_V3_EVENTS.REPAY.topic0, topic(USDC_SEPOLIA), topic(who), topic(who)],
        data: coder.encode(["uint256", "bool"], [amount, false]),
      };
      await (
        await attestor
          .connect(keeper)
          .ingest(
            ACTION.REPAYMENT,
            TEST_CHAINS.SEPOLIA.chainKey,
            e.height,
            encodeTx({ from: who, to: AAVE_SEPOLIA, logs: [log] }),
            e.merkleRoot,
            e.siblings,
            e.lowerEndpointDigest,
            e.continuityRoots
          )
      ).wait();
    }
  }

  // Loan-to-value is what drives a position's health, so the three borrowers are given
  // deliberately different draws against their earned limits. A shared mark-down then lands
  // exactly one of them in the stress band, which is the state worth demonstrating.
  const cast = [
    { signer: alice, label: "Alice  (strong credit, conservative draw)", proofs: 18, each: USDC(13_000), coll: WETH(12), draw: USDC(14_000) },
    { signer: bob,   label: "Bob    (mid credit, near his LTV limit)  ", proofs: 8,  each: USDC(6_000),  coll: WETH(8),  draw: USDC(11_700) },
    { signer: carol, label: "Carol  (thin file, small line)           ", proofs: 3,  each: USDC(2_000),  coll: WETH(6),  draw: USDC(4_000) },
  ];

  for (const c of cast) {
    await attest(c.signer.address, c.proofs, c.each);
    await (await collateral.mint(c.signer.address, WETH(50))).wait();
    await (
      await collateral.connect(c.signer).approve(await vault.getAddress(), ethers.MaxUint256)
    ).wait();
    await (await asset.mint(c.signer.address, USDC(50_000))).wait();
    await (
      await asset.connect(c.signer).approve(await vault.getAddress(), ethers.MaxUint256)
    ).wait();

    await (await vault.connect(c.signer).openLoan(c.coll, c.draw)).wait();
    await (await passport.connect(c.signer).mint()).wait();

    const q = await vault.quote(c.signer.address);
    const ltv = (Number(c.draw) / 1e6 / ((Number(c.coll) / 1e18) * 3000)) * 100;
    console.log(
      `${c.label}  score=${q.score}  apr=${(Number(q.rateBps) / 100).toFixed(2)}%  ` +
        `ltv=${ltv.toFixed(1)}% of ${(Number(q.maxLtvBps) / 100).toFixed(1)}% allowed`
    );
  }

  // Age the book, then mark collateral down so Bob lands in the stress band.
  await network.provider.send("evm_increaseTime", [60 * 24 * 3600]);
  await network.provider.send("evm_mine");
  for (const c of cast) await (await vault.accrue(c.signer.address)).wait();

  await (await vault.setPrices(ONE_USD_E8, 1_957n * ONE_USD_E8)).wait();

  console.log("");
  console.log("Positions after a mark-down to $1,957/mWETH (-34.8%):");
  for (const c of cast) {
    const p = await vault.positionOf(c.signer.address);
    const hf = Number(p.healthFactor) / 1e18;
    const state = p.liquidatable ? "LIQUIDATABLE" : p.inStressBand ? "STRESSED" : "healthy";
    console.log(
      `  ${c.signer.address}  HF=${hf.toFixed(3)}  debt=$${(Number(p.debt) / 1e6).toFixed(0)}  ${state}`
    );
  }
  console.log("");
  console.log("Local scenario ready. Start the API:  npm run backend");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
