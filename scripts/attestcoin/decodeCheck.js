/**
 * Validate Meritr's decoding path against a REAL prover payload.
 *
 *   npx hardhat run scripts/attestcoin/decodeCheck.js
 *
 * The precompile proves a transaction happened; it does not interpret it. Everything after that
 * - chunk decoding, receipt extraction, log matching against the schema registry, borrower and
 * amount extraction - is Meritr's own code, and until now it had only ever seen payloads that
 * Meritr's own test helpers produced.
 *
 * This runs a genuine proof-builder `txBytes` through the deployed contract on a local chain, so
 * a mismatch between the real encoding and Meritr's expectations shows up as a failed assertion
 * rather than as an empty credit history on testnet.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { ACTION, AAVE_V3_EVENTS, AAVE_ETHEREUM } = require("../sourceSchemas");

const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
const PROOF_FILE = process.env.MERITR_PROOF_FILE || "/tmp/real_proof.json";

async function main() {
  if (!fs.existsSync(PROOF_FILE)) {
    throw new Error(
      `No proof fixture at ${PROOF_FILE}. Fetch one first:\n` +
        "  node scripts/attestcoin/fetchProof.js <txHash>"
    );
  }
  const proof = JSON.parse(fs.readFileSync(PROOF_FILE, "utf8"));
  const a = proof.ingestArgs;

  console.log("=".repeat(74));
  console.log("  Decoding a REAL Attestcoin proof through Meritr's ingestion path");
  console.log("=".repeat(74));
  console.log(`  source tx     : ${proof.txHash}`);
  console.log(`  chainKey      : ${proof.chainKey}  (Ethereum, via Creditcoin testnet)`);
  console.log(`  block height  : ${proof.blockHeight}`);
  console.log(`  txBytes       : ${(a.encodedTransaction.length - 2) / 2} bytes from the prover`);

  const [admin, relayer] = await ethers.getSigners();

  // Substitute the verifier only. Every other step below is production code running on the real
  // payload: the same decoder, schema registry and fact-folding the testnet deployment uses.
  const Mock = await ethers.getContractFactory("MockNativeQueryVerifier");
  const m = await Mock.deploy();
  await m.waitForDeployment();
  await network.provider.send("hardhat_setCode", [
    PRECOMPILE,
    await ethers.provider.getCode(await m.getAddress()),
  ]);
  const mock = Mock.attach(PRECOMPILE);
  await mock.setShouldVerify(true);
  await mock.setTxIndex(proof.txIndex);
  console.log(`  verifier      : mock at ${PRECOMPILE} (the real one already ACCEPTED this proof on testnet)`);

  const Attestor = await ethers.getContractFactory("MeritrAttestor");
  const attestor = await Attestor.deploy(admin.address);
  await attestor.waitForDeployment();

  const chainKey = BigInt(a.chainKey);
  await attestor.configureSourceChain(
    chainKey,
    AAVE_ETHEREUM.name,
    AAVE_ETHEREUM.genesisTimestamp,
    AAVE_ETHEREUM.blockTimeSeconds,
    true
  );
  for (const asset of AAVE_ETHEREUM.assets) {
    await attestor.configureAsset(chainKey, asset.address, asset.decimals, asset.priceE8);
  }
  for (const evt of Object.values(AAVE_V3_EVENTS)) {
    await attestor.registerSchema(chainKey, AAVE_ETHEREUM.pool, evt.topic0, evt.schema);
  }
  console.log(`  registered    : Aave V3 ${AAVE_ETHEREUM.pool} + ${AAVE_ETHEREUM.assets.length} reserves\n`);

  const tx = await attestor
    .connect(relayer)
    .ingest(
      ACTION.REPAYMENT,
      chainKey,
      BigInt(a.blockHeight),
      a.encodedTransaction,
      a.merkleRoot,
      a.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
      a.lowerEndpointDigest,
      a.continuityRoots
    );
  const receipt = await tx.wait();

  const facts = [];
  for (const log of receipt.logs) {
    let parsed;
    try {
      parsed = attestor.interface.parseLog(log);
    } catch {
      continue;
    }
    if (parsed?.name === "CreditFactAttested") facts.push(parsed.args);
    if (parsed?.name === "NoRecognisedFacts") {
      console.log("  ✗ The proof verified but contained no log matching a registered schema.");
      process.exitCode = 1;
      return;
    }
  }

  if (facts.length === 0) {
    console.log("  ✗ No credit facts extracted.");
    process.exitCode = 1;
    return;
  }

  console.log(`  EXTRACTED ${facts.length} CREDIT FACT(S) FROM THE REAL TRANSACTION:\n`);
  const names = { 1: "REPAYMENT", 2: "COLLATERAL", 3: "LIQUIDATION", 4: "BORROW" };
  for (const f of facts) {
    const asset = AAVE_ETHEREUM.assets.find(
      (x) => x.address.toLowerCase() === f.asset.toLowerCase()
    );
    console.log(`    action    : ${names[Number(f.action)] ?? f.action}`);
    console.log(`    borrower  : ${f.borrower}`);
    console.log(`    asset     : ${f.asset}${asset ? ` (${asset.symbol})` : " (unpriced)"}`);
    console.log(`    raw amount: ${f.rawAmount}`);
    console.log(`    valued at : $${(Number(f.usdE8) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 })}\n`);
  }

  const subject = facts[0].borrower;
  const stored = await attestor.factsOf(subject);
  const score = await attestor.scoreOf(subject);
  console.log("  BORROWER CREDIT MEMORY AFTER INGESTION:");
  console.log(`    lifetime repaid : $${(Number(stored.totalRepaidE8) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  console.log(`    repayments      : ${stored.repaymentCount}`);
  console.log(`    chains          : ${stored.chainCount}`);
  console.log(`    proofs ingested : ${stored.attestationCount}`);
  console.log(`    ZK-Credit score : ${score.score}`);
  console.log("\n" + "=".repeat(74));
  console.log("  The real payload decoded correctly through production code.");
  console.log("=".repeat(74));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
