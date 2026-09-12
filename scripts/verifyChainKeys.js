/**
 * Verify the source-chain catalogue against Creditcoin's own ChainInfo precompile.
 *
 *   npx hardhat run scripts/verifyChainKeys.js --network creditcoinTestnet
 *
 * A wrong `chainKey` fails silently: proofs simply never match a registered schema, the
 * borrower's history never lands, and every test still passes because the tests build their own
 * proofs. This is the only check that catches it, so the deploy script runs it too.
 */
const { ethers, network } = require("hardhat");
const { CHAIN_INFO_PRECOMPILE, deploymentsFor } = require("./sourceSchemas");

const IFACE = new ethers.Interface([
  "function get_supported_chains() view returns ((uint64 chainKey,uint64 chainId,string chainName,uint32 chainEncoding)[])",
  "function get_latest_attestation_height_and_hash(uint64) view returns ((uint64 height,bytes32 hash,bool isAttestation,bool exists))",
]);

/** Read the live registry. Returns null when the precompile is absent (e.g. a local chain). */
async function readSupportedChains(provider) {
  try {
    const raw = await provider.call({
      to: CHAIN_INFO_PRECOMPILE,
      data: IFACE.encodeFunctionData("get_supported_chains"),
    });
    if (!raw || raw === "0x") return null;
    const [chains] = IFACE.decodeFunctionResult("get_supported_chains", raw);
    return chains.map((c) => ({
      chainKey: Number(c.chainKey),
      chainId: Number(c.chainId),
      chainName: c.chainName,
      chainEncoding: Number(c.chainEncoding),
    }));
  } catch {
    return null;
  }
}

/**
 * Compare the catalogue Meritr would register against what the chain actually supports.
 * Returns `{ ok, problems, live }` rather than throwing, so callers choose the severity.
 */
async function verifyCatalogue(provider, creditcoinChainId) {
  const live = await readSupportedChains(provider);
  if (!live) return { ok: null, problems: [], live: null };

  const problems = [];
  for (const entry of deploymentsFor(creditcoinChainId)) {
    const byKey = live.find((c) => c.chainKey === Number(entry.chainKey));
    if (!byKey) {
      const correct = live.find((c) => c.chainId === entry.evmChainId);
      problems.push(
        `${entry.name}: catalogue uses chainKey ${entry.chainKey}, which this network does not register` +
          (correct ? ` - the correct key for EVM chain ${entry.evmChainId} is ${correct.chainKey}` : "")
      );
      continue;
    }
    if (byKey.chainId !== entry.evmChainId) {
      problems.push(
        `${entry.name}: chainKey ${entry.chainKey} is EVM chain ${byKey.chainId} ("${byKey.chainName}"), ` +
          `not ${entry.evmChainId}`
      );
    }
  }
  return { ok: problems.length === 0, problems, live };
}

async function main() {
  const net = await ethers.provider.getNetwork();
  console.log("=".repeat(74));
  console.log(`  Attestcoin chainKey verification - ${network.name} (chain ${net.chainId})`);
  console.log("=".repeat(74));

  const { ok, problems, live } = await verifyCatalogue(ethers.provider, net.chainId);

  if (live === null) {
    console.log(`  No ChainInfo precompile at ${CHAIN_INFO_PRECOMPILE} on this network.`);
    console.log("  Nothing to verify - this is expected on a local chain.");
    return;
  }

  console.log("\n  Registered onchain:");
  console.log("    chainKey  chainId    encoding  name");
  for (const c of live) {
    console.log(
      `    ${String(c.chainKey).padEnd(9)} ${String(c.chainId).padEnd(10)} ${String(c.chainEncoding).padEnd(9)} ${c.chainName}`
    );
    try {
      const raw = await ethers.provider.call({
        to: CHAIN_INFO_PRECOMPILE,
        data: IFACE.encodeFunctionData("get_latest_attestation_height_and_hash", [c.chainKey]),
      });
      const [h] = IFACE.decodeFunctionResult("get_latest_attestation_height_and_hash", raw);
      console.log(`              latest attested height: ${h.height}`);
    } catch {
      /* height is informational */
    }
  }

  console.log("\n  Meritr catalogue:");
  for (const e of deploymentsFor(net.chainId)) {
    console.log(`    chainKey ${String(e.chainKey).padEnd(4)} ${e.name} (EVM ${e.evmChainId}) - ${e.protocol} ${e.pool}`);
  }

  if (ok) {
    console.log("\n  ✓ Every catalogue entry matches the onchain registry.");
  } else {
    console.log("\n  ✗ MISMATCH:");
    for (const p of problems) console.log(`    - ${p}`);
    process.exitCode = 1;
  }
  console.log("=".repeat(74));
}

module.exports = { readSupportedChains, verifyCatalogue };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
