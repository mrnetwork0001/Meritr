/**
 * Pre-deployment readiness check for a Creditcoin network.
 *
 *   npx hardhat run scripts/preflight.js --network creditcoinTestnet
 *
 * Everything that must be true before `deploy.js` will succeed, checked in one pass and
 * reported together - a key that exists, a balance that can pay for six deployments plus a
 * dozen registry writes, a reachable RPC, a live Attestcoin precompile, a proof-builder that
 * answers, and a source-chain catalogue whose chainKeys match the chain's own registry.
 *
 * Deploying is a multi-transaction sequence with no rollback: running out of gas halfway leaves
 * contracts onchain that the address book never records. This is cheaper than that.
 */
const { ethers, network } = require("hardhat");
const { verifyCatalogue } = require("./verifyChainKeys");
const { deploymentsFor, CHAIN_INFO_PRECOMPILE } = require("./sourceSchemas");
const { attestedHeight, proverUrlFor } = require("./attestcoin/prover");

const VERIFIER = "0x0000000000000000000000000000000000000FD2";
/** Rough cost of the full deploy: 3 contracts + 2 demo tokens + roles + ~14 registry writes. */
const ESTIMATED_DEPLOY_COST = ethers.parseEther("0.35");

let failures = 0;
let warnings = 0;

function line(ok, label, detail, fix) {
  const mark = ok === true ? "ok  " : ok === false ? "FAIL" : "warn";
  if (ok === false) failures++;
  if (ok === null) warnings++;
  console.log(`  [${mark}] ${label.padEnd(30)} ${detail}`);
  if (fix && ok !== true) console.log(`${" ".repeat(11)}-> ${fix}`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  console.log("=".repeat(78));
  console.log(`  MERITR PREFLIGHT - ${network.name} (chain ${net.chainId})`);
  console.log("=".repeat(78));

  // --- RPC ------------------------------------------------------------------
  let block;
  try {
    block = await ethers.provider.getBlockNumber();
    line(true, "RPC reachable", `block ${block.toLocaleString()}`);
  } catch (e) {
    line(false, "RPC reachable", e.shortMessage ?? e.message, "check the RPC URL in .env");
    return summary();
  }

  // --- Deployer -------------------------------------------------------------
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    line(
      false,
      "Deployer key",
      "no account configured",
      "set PRIVATE_KEY in .env (0x-prefixed, 64 hex chars)"
    );
    return summary();
  }
  const deployer = signers[0];
  line(true, "Deployer key", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  const enough = balance >= ESTIMATED_DEPLOY_COST;
  line(
    enough ? true : balance === 0n ? false : null,
    "Deployer balance",
    `${ethers.formatEther(balance)} CTC (need ~${ethers.formatEther(ESTIMATED_DEPLOY_COST)})`,
    enough ? undefined : "fund this address with testnet CTC before deploying"
  );

  // --- Attestcoin precompiles ----------------------------------------------
  // Native precompiles report no bytecode, so presence is probed with a real call.
  try {
    const iface = new ethers.Interface([
      "function calculateTxIndex((bytes32 root,(bytes32 hash,bool isLeft)[] siblings)) view returns (uint64)",
    ]);
    const data = iface.encodeFunctionData("calculateTxIndex", [
      { root: ethers.ZeroHash, siblings: [{ hash: ethers.ZeroHash, isLeft: true }] },
    ]);
    const r = await ethers.provider.call({ to: VERIFIER, data });
    line(r !== "0x", "BlockProver 0x…0FD2", r !== "0x" ? "responds to calls" : "returned 0x (absent)");
  } catch {
    line(null, "BlockProver 0x…0FD2", "call reverted - precompile may still be present");
  }

  const chainInfoCode = await ethers.provider.getCode(CHAIN_INFO_PRECOMPILE);
  const check = await verifyCatalogue(ethers.provider, net.chainId);
  line(
    check.ok === null ? null : true,
    "ChainInfo 0x…0FD3",
    check.live ? `${check.live.length} source chain(s) registered` : "not present on this network"
  );

  // --- chainKeys ------------------------------------------------------------
  if (check.ok === true) {
    line(true, "chainKey catalogue", "matches the onchain registry");
    for (const c of deploymentsFor(net.chainId)) {
      console.log(`${" ".repeat(11)}   chainKey ${String(c.chainKey).padEnd(3)} ${c.name} (EVM ${c.evmChainId})`);
    }
  } else if (check.ok === false) {
    line(false, "chainKey catalogue", "MISMATCH", check.problems.join("; "));
  } else {
    line(null, "chainKey catalogue", "no registry to verify against (local chain)");
  }

  // --- Proof builder --------------------------------------------------------
  try {
    const url = proverUrlFor(net.chainId);
    const primary = deploymentsFor(net.chainId)[0];
    const h = await attestedHeight(net.chainId, Number(primary.chainKey));
    line(true, "Proof builder", `${url.replace("https://", "")} - ${primary.name} attested to ${h.toLocaleString()}`);
  } catch (e) {
    line(null, "Proof builder", e.message.slice(0, 60), "real proofs will be unavailable");
  }

  // --- Demo assets ----------------------------------------------------------
  const hasReal = Boolean(process.env.MERITR_ASSET && process.env.MERITR_COLLATERAL);
  line(
    true,
    "Market assets",
    hasReal ? "using MERITR_ASSET / MERITR_COLLATERAL" : "will deploy demo ERC-20s"
  );

  summary(net.chainId);
}

function summary(chainId) {
  console.log("\n" + "=".repeat(78));
  if (failures) {
    console.log(`  ${failures} blocker(s), ${warnings} warning(s). Deployment will fail.`);
  } else if (warnings) {
    console.log(`  Ready, with ${warnings} warning(s).`);
  } else {
    console.log("  Ready to deploy.");
  }
  if (!failures) {
    console.log(`\n  npx hardhat run scripts/deploy.js --network ${network.name}`);
  }
  console.log("=".repeat(78));
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
