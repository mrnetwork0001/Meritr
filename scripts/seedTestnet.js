/**
 * Seed the live Creditcoin testnet deployment with REAL cross-chain credit history.
 *
 *   npx hardhat run scripts/seedTestnet.js --network creditcoinTestnet
 *
 * There is no mock verifier on testnet, so nothing here can be fabricated even in principle:
 * every credit fact below is a real Aave V3 event on Ethereum mainnet, proven by Creditcoin's
 * proof-builder and accepted by the BlockProver precompile at 0x…0FD2. A synthetic proof would
 * simply revert.
 *
 * What it does:
 *   1. Scans Ethereum mainnet for recent Aave V3 Repay / Supply / LiquidationCall events,
 *      staying inside the window Creditcoin has attested.
 *   2. Fetches a real proof for each transaction.
 *   3. Ingests them into MeritrAttestor, building genuine credit memory for the real
 *      borrowers those events belong to.
 *
 * Ingestion is permissionless and credits the address decoded out of the proven log, so this
 * script builds other people's real credit history without being able to forge any of it -
 * which is the property the whole design rests on.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { ACTION, AAVE_V3_EVENTS, deploymentsFor } = require("./sourceSchemas");
const { attestedHeight, proofForTx } = require("./attestcoin/prover");

const ETH_RPCS = [
  "https://eth.drpc.org",
  "https://ethereum-rpc.publicnode.com",
  "https://cloudflare-eth.com",
];

const WANTED = Number(process.env.MERITR_SEED_COUNT || 12);
const SCAN_SPAN = 300;    // blocks per getLogs window; public RPCs reject much more
const SCAN_WINDOWS = 40;  // how far back to walk before giving up

const log = (m = "") => console.log(m);
const bullet = (m) => console.log(`   ${m}`);

/** First Ethereum RPC that answers. */
async function ethProvider() {
  for (const url of ETH_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      return { provider: p, url };
    } catch {
      /* try the next */
    }
  }
  throw new Error("No usable Ethereum RPC endpoint.");
}

/** Real Aave V3 events inside Creditcoin's attested window, newest first. */
async function findSourceEvents(provider, pool, ceiling) {
  const wanted = [
    [AAVE_V3_EVENTS.REPAY, ACTION.REPAYMENT, "repay"],
    [AAVE_V3_EVENTS.SUPPLY, ACTION.COLLATERAL, "supply"],
    [AAVE_V3_EVENTS.LIQUIDATION, ACTION.LIQUIDATION, "liquidation"],
  ];

  const found = [];
  const seenTx = new Set();

  for (let w = 0; w < SCAN_WINDOWS && found.length < WANTED; w++) {
    const to = ceiling - w * SCAN_SPAN;
    const from = to - (SCAN_SPAN - 1);

    for (const [evt, action, label] of wanted) {
      if (found.length >= WANTED) break;
      try {
        const logs = await provider.getLogs({
          address: pool,
          topics: [evt.topic0],
          fromBlock: from,
          toBlock: to,
        });
        for (const l of logs) {
          if (found.length >= WANTED) break;
          if (seenTx.has(l.transactionHash)) continue;
          seenTx.add(l.transactionHash);
          found.push({ txHash: l.transactionHash, block: l.blockNumber, action, label });
        }
      } catch {
        /* window rejected by the RPC; keep walking */
      }
    }
  }
  return found;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const bookPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(bookPath)) throw new Error(`No deployment at ${bookPath}. Deploy first.`);
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const attestor = await ethers.getContractAt("MeritrAttestor", book.contracts.MeritrAttestor);

  const ethereum = deploymentsFor(net.chainId).find((c) => c.evmChainId === 1);
  if (!ethereum) throw new Error("No Ethereum entry in the catalogue for this network.");

  log("=".repeat(78));
  log("  MERITR - seeding real cross-chain credit from Ethereum mainnet");
  log("=".repeat(78));
  bullet(`Creditcoin   : ${network.name} (${net.chainId})`);
  bullet(`Attestor     : ${book.contracts.MeritrAttestor}`);
  bullet(`Source       : ${ethereum.protocol} ${ethereum.pool} - chainKey ${ethereum.chainKey}`);

  const attested = await attestedHeight(net.chainId, Number(ethereum.chainKey));
  const { provider, url } = await ethProvider();
  const head = await provider.getBlockNumber();
  // Stay clear of the attestation frontier; a block proven a moment ago may not be final.
  const ceiling = Math.min(head, attested) - 60;
  bullet(`Ethereum RPC : ${url.replace("https://", "")} (head ${head.toLocaleString()})`);
  bullet(`Attested to  : ${attested.toLocaleString()} - scanning below ${ceiling.toLocaleString()}`);
  log("");

  log("  [1/3] Finding real Aave V3 activity…");
  const events = await findSourceEvents(provider, ethereum.pool, ceiling);
  if (events.length === 0) throw new Error("No Aave V3 events found in the scanned range.");
  const byLabel = events.reduce((a, e) => ((a[e.label] = (a[e.label] || 0) + 1), a), {});
  bullet(`found ${events.length} transaction(s): ${Object.entries(byLabel).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  log("");

  log("  [2/3] Fetching real Attestcoin proofs and ingesting…");
  const borrowers = new Set();
  let ok = 0;
  let skipped = 0;
  let gasUsed = 0n;

  for (const [i, e] of events.entries()) {
    const tag = `${String(i + 1).padStart(2)}/${events.length}  ${e.txHash.slice(0, 18)}…`;
    let proof;
    try {
      proof = await proofForTx(net.chainId, Number(ethereum.chainKey), e.txHash);
    } catch (err) {
      bullet(`${tag}  proof unavailable - ${String(err.message).slice(0, 60)}`);
      skipped++;
      continue;
    }

    const a = proof.ingestArgs;
    try {
      const tx = await attestor.ingest(
        e.action,
        a.chainKey,
        a.blockHeight,
        a.encodedTransaction,
        a.merkleRoot,
        a.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
        a.lowerEndpointDigest,
        a.continuityRoots
      );
      const r = await tx.wait();
      gasUsed += r.gasUsed;

      const facts = [];
      for (const l of r.logs) {
        try {
          const ev = attestor.interface.parseLog(l);
          if (ev?.name === "CreditFactAttested") {
            borrowers.add(ev.args.borrower);
            facts.push(
              `${ev.args.borrower.slice(0, 10)}… $${(Number(ev.args.usdE8) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            );
          }
        } catch {
          /* not one of ours */
        }
      }
      bullet(`${tag}  ${e.label.padEnd(11)} ${facts.length ? facts.join(", ") : "proven, no priced fact"}`);
      ok++;
    } catch (err) {
      const msg = String(err.shortMessage || err.message);
      // A replayed query id is expected when re-running; it is the dedupe working.
      bullet(`${tag}  ${msg.includes("already processed") ? "already ingested" : msg.slice(0, 64)}`);
      skipped++;
    }
  }

  log("");
  log("  [3/3] Resulting onchain credit memory");
  const rows = [];
  for (const b of borrowers) {
    const f = await attestor.factsOf(b);
    const s = await attestor.scoreOf(b);
    rows.push({ b, score: Number(s.score), repaid: Number(f.totalRepaidE8) / 1e8, proofs: Number(f.attestationCount) });
  }
  rows.sort((x, y) => y.score - x.score);
  for (const r of rows) {
    bullet(
      `${r.b}  score ${String(r.score).padStart(3)}  ` +
        `repaid $${r.repaid.toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)}  ` +
        `${r.proofs} proof(s)`
    );
  }

  log("");
  log("=".repeat(78));
  bullet(`${ok} proof(s) ingested, ${skipped} skipped, ${rows.length} borrower(s) scored`);
  bullet(`gas used: ${gasUsed.toLocaleString()}`);
  bullet("every fact above originates from a real Ethereum mainnet transaction,");
  bullet("verified by the BlockProver precompile at 0x…0FD2 - no mock anywhere");
  log("=".repeat(78));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
