/**
 * Fetch a real Attestcoin proof for a source-chain transaction.
 *
 *   node scripts/attestcoin/fetchProof.js <txHash> [--chain-key 3] [--out proof.json]
 *
 * Talks to Creditcoin's proof-builder service and writes an envelope shaped for
 * `MeritrAttestor.ingest`. Use it to produce fixtures, to sanity-check a transaction before
 * relaying it, or to demonstrate that Meritr's ingestion runs on genuine proofs rather than on
 * anything the project generated for itself.
 */
const fs = require("fs");
const { attestedHeight, proofForTx, proverUrlFor } = require("./prover");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const txHash = process.argv[2];
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    console.error("usage: node scripts/attestcoin/fetchProof.js <txHash> [--chain-key 3] [--out file.json]");
    process.exit(1);
  }

  const creditcoinChainId = Number(arg("creditcoin", process.env.MERITR_CREDITCOIN_CHAIN_ID || 102031));
  const chainKey = Number(arg("chain-key", 3));
  const out = arg("out", "/tmp/real_proof.json");

  console.log(`proof-builder : ${proverUrlFor(creditcoinChainId)}`);
  console.log(`chainKey      : ${chainKey}`);

  const height = await attestedHeight(creditcoinChainId, chainKey);
  console.log(`attested to   : block ${height.toLocaleString()}`);

  const proof = await proofForTx(creditcoinChainId, chainKey, txHash);

  if (proof.blockHeight > height) {
    console.warn(
      `\nWARNING: the transaction is in block ${proof.blockHeight}, above the attested height ` +
        `${height}. The precompile will reject this until attestation catches up.`
    );
  }

  console.log(`\nproof for     : ${proof.txHash}`);
  console.log(`  block       : ${proof.blockHeight}  (tx index ${proof.txIndex})`);
  console.log(`  txBytes     : ${(proof.ingestArgs.encodedTransaction.length - 2) / 2} bytes`);
  console.log(`  merkle root : ${proof.ingestArgs.merkleRoot}`);
  console.log(`  siblings    : ${proof.ingestArgs.siblings.length}`);
  console.log(`  continuity  : ${proof.ingestArgs.continuityRoots.length} roots`);

  fs.writeFileSync(out, JSON.stringify(proof, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`\nwritten -> ${out}`);
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
