/**
 * Ask the live Attestcoin precompile to judge a real proof and a tampered copy of it.
 *
 *   npx hardhat run scripts/attestcoin/verifyProof.js --network creditcoinTestnet
 *
 * Meritr's central claim is that no human, key or committee can insert a credit fact - only a
 * proof the Creditcoin runtime itself accepts. That claim is worth exactly as much as the
 * precompile's willingness to say no, so this script makes it say both.
 *
 * It fetches a genuine Aave V3 repayment proof from Creditcoin's proof-builder, calls the
 * `verify` view on the precompile at 0x…0FD2, then flips a single byte inside the proven
 * transaction and calls it again with everything else identical. A protocol that cannot tell
 * those two apart is a protocol with no security at all.
 *
 * Read-only: `verify` is a view, so this costs no gas and writes nothing.
 */
const { ethers, network } = require("hardhat");
const { proofForTx, attestedHeight, proverUrlFor } = require("./prover");

const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";

// A real Aave V3 USDT repayment on Ethereum mainnet, already ingested by this deployment.
const DEFAULT_TX = "0x7db669953c8d25a9132cd3f0c7bd5c7fe2c2ffbc64cc5fb4797f47e94d596e4a";

const VERIFY_ABI = [
  "function verify(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) view returns (bool)",
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Flip one bit in the middle of the proven transaction, changing nothing else. */
function tamper(txBytes) {
  const b = ethers.getBytes(txBytes);
  const i = Math.floor(b.length / 2);
  b[i] ^= 0x01;
  return ethers.hexlify(b);
}

async function ask(verifier, a) {
  try {
    const ok = await verifier.verify(
      a.chainKey,
      a.blockHeight,
      a.encodedTransaction,
      { root: a.merkleRoot, siblings: a.siblings },
      { lowerEndpointDigest: a.lowerEndpointDigest, roots: a.continuityRoots }
    );
    return { accepted: Boolean(ok), reason: ok ? null : "returned false" };
  } catch (err) {
    return { accepted: false, reason: (err.shortMessage || err.message || "reverted").slice(0, 120) };
  }
}

async function main() {
  const txHash = arg("tx", DEFAULT_TX);
  const chainKey = Number(arg("chain-key", 3));
  const ccId = Number(network.config.chainId || 102031);

  console.log(`network       : ${network.name} (${ccId})`);
  console.log(`precompile    : ${PRECOMPILE}`);
  console.log(`proof-builder : ${proverUrlFor(ccId)}`);
  console.log(`source tx     : ${txHash}  (chainKey ${chainKey})\n`);

  const height = await attestedHeight(ccId, chainKey);
  const proof = await proofForTx(ccId, chainKey, txHash);
  console.log(`attested to   : block ${height.toLocaleString()}`);
  console.log(`tx in block   : ${proof.blockHeight.toLocaleString()}`);
  console.log(`siblings      : ${proof.ingestArgs.siblings.length} Merkle, ${proof.ingestArgs.continuityRoots.length} continuity roots\n`);

  const verifier = new ethers.Contract(PRECOMPILE, VERIFY_ABI, ethers.provider);

  const good = await ask(verifier, proof.ingestArgs);
  console.log(`genuine proof      -> ${good.accepted ? "ACCEPTED" : "REJECTED (" + good.reason + ")"}`);

  const forged = { ...proof.ingestArgs, encodedTransaction: tamper(proof.ingestArgs.encodedTransaction) };
  const bad = await ask(verifier, forged);
  console.log(`one byte altered   -> ${bad.accepted ? "ACCEPTED" : "REJECTED (" + bad.reason + ")"}\n`);

  if (good.accepted && !bad.accepted) {
    console.log("The runtime accepts the real transaction and refuses the altered one.");
    console.log("Every CreditFactAttested log in MeritrAttestor had to clear this same gate.");
    return;
  }
  if (!good.accepted) {
    throw new Error(`A genuine proof was refused (${good.reason}). Attested height may lag the tx block.`);
  }
  throw new Error("The precompile accepted a tampered transaction. Do not trust this deployment.");
}

main().catch((e) => {
  console.error("\n" + (e.message || e));
  process.exitCode = 1;
});
