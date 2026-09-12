#!/usr/bin/env node
/**
 * Continuous Attestcoin relayer.
 *
 *   node scripts/attestcoin/relay.js --interval 240 --max-per-cycle 2
 *   node scripts/attestcoin/relay.js --once
 *
 * Watches Ethereum mainnet for real Aave V3 activity, fetches a real Attestcoin proof for each
 * transaction, and ingests it into MeritrAttestor on Creditcoin - forever, unattended.
 *
 * Why this exists: "autonomous" is easy to claim and hard to believe. Run for a day, this
 * leaves a public trail of CreditFactAttested events on Blockscout, minutes apart, built from
 * real Ethereum credit activity. That is a claim a reviewer can check instead of take.
 *
 * It runs under a key holding ZERO roles. `MeritrAttestor.ingest` has no `onlyRole` - the proof
 * is self-validating and the borrower credited is decoded out of the proven log - so a roleless
 * key is genuinely sufficient. That is the permissionlessness claim demonstrated rather than
 * asserted, and it means a stolen relayer key can do nothing but pay gas to tell the truth.
 *
 * Deliberately a plain Node script, not `hardhat run`: it has to live for days, and Hardhat
 * (plus the deployer key it reads) has no business on an unattended host.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { ACTION, AAVE_V3_EVENTS, deploymentsFor } = require("../sourceSchemas");
const { attestedHeight, proofForTx } = require("./prover");

const ROOT = path.join(__dirname, "..", "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const NETWORK = process.env.MERITR_NETWORK || "creditcoinTestnet";
const INTERVAL = Number(arg("interval", process.env.MERITR_RELAY_INTERVAL || 240));
const MAX_PER_CYCLE = Number(arg("max-per-cycle", 2));
const BALANCE_FLOOR = ethers.parseEther(arg("balance-floor", "1"));
// Public Ethereum RPCs disagree wildly on eth_getLogs limits and change them without notice:
// at the time of writing drpc returns 400, publicnode demands an archive token, cloudflare
// refuses outright, and 1rpc caps at 50 blocks. So the span starts small enough for the
// strictest provider and the scanner adapts downward when a node complains.
const SCAN_SPANS = [Number(arg("span", 50)), 25, 10];
const SCAN_WINDOWS = Number(arg("windows", 12));
const STATE_DIR = path.join(ROOT, "var");
const STATE_FILE = path.join(STATE_DIR, "relayer-state.json");

const ETH_RPCS = (process.env.ETHEREUM_RPC_URL || "")
  .split(",")
  .filter(Boolean)
  .concat([
    "https://1rpc.io/eth",
    "https://eth.drpc.org",
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
  ]);

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (m) => console.log(`${ts()}  ${m}`);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Persist cycle state atomically.
 *
 * `lastScannedEthBlock`, `attestedHeight` and `lastIngestAt` are kept as three separate
 * fields on purpose: a stalled cursor ingests nothing and is otherwise indistinguishable from
 * "there was no Aave activity", which is the one failure mode here that looks like success.
 */
function writeState(patch) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const next = { ...readState(), ...patch, updatedAt: new Date().toISOString() };
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return next;
}

/**
 * Pick an Ethereum RPC that can actually serve the query this relayer needs.
 *
 * Probing with `getBlockNumber` is not enough and was the original bug: several providers
 * answer it happily and then reject `eth_getLogs` outright, so the relayer selected a node it
 * could not use and reported "0 candidates" - a silent failure that looks exactly like "no
 * Aave activity". The probe is now the real call, and the working span is discovered rather
 * than assumed.
 */
async function ethProvider(pool, ceiling) {
  const errors = [];
  for (const url of ETH_RPCS) {
    // staticNetwork stops ethers retrying network detection against a dead host, which
    // otherwise floods the log with hundreds of lines per cycle.
    const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
    let head;
    try {
      head = await p.getBlockNumber();
    } catch (e) {
      errors.push(`${url}: unreachable`);
      continue;
    }
    for (const span of SCAN_SPANS) {
      try {
        const to = Math.min(ceiling, head - 60);
        await p.getLogs({
          address: pool,
          topics: [AAVE_V3_EVENTS.REPAY.topic0],
          fromBlock: to - (span - 1),
          toBlock: to,
        });
        return { provider: p, url, head, span };
      } catch (e) {
        const m = e?.error?.message || e?.info?.error?.message || e.shortMessage || e.message;
        errors.push(`${url} @${span}: ${String(m).slice(0, 50)}`);
      }
    }
  }
  throw new Error(`No Ethereum RPC can serve getLogs. Tried:\n  ${errors.join("\n  ")}`);
}

/** Real Aave V3 events below `ceiling`, walking backwards from `cursor`. */
async function findEvents(provider, pool, ceiling, cursor, span) {
  const wanted = [
    [AAVE_V3_EVENTS.REPAY, ACTION.REPAYMENT, "repay"],
    [AAVE_V3_EVENTS.SUPPLY, ACTION.COLLATERAL, "supply"],
    [AAVE_V3_EVENTS.LIQUIDATION, ACTION.LIQUIDATION, "liquidation"],
  ];
  const found = [];
  const seen = new Set();
  let top = cursor && cursor < ceiling ? cursor : ceiling;

  for (let w = 0; w < SCAN_WINDOWS && found.length < MAX_PER_CYCLE; w++) {
    const to = top - w * span;
    const from = to - (span - 1);
    if (to <= 0) break;
    for (const [evt, action, label] of wanted) {
      if (found.length >= MAX_PER_CYCLE) break;
      try {
        const logs = await provider.getLogs({
          address: pool,
          topics: [evt.topic0],
          fromBlock: from,
          toBlock: to,
        });
        for (const l of logs) {
          if (found.length >= MAX_PER_CYCLE) break;
          if (seen.has(l.transactionHash)) continue;
          seen.add(l.transactionHash);
          found.push({ txHash: l.transactionHash, block: l.blockNumber, action, label });
        }
      } catch {
        /* window rejected; keep walking */
      }
    }
    if (found.length) return { found, scannedTo: from };
  }
  return { found, scannedTo: top - SCAN_WINDOWS * span };
}

async function cycle(ctx) {
  const { attestor, signer, ethereum, creditcoinChainId } = ctx;
  const n = (readState().cycles || 0) + 1;

  const balance = await signer.provider.getBalance(signer.address);
  if (balance < BALANCE_FLOOR) {
    log(`SKIP cycle ${n}: relayer balance ${ethers.formatEther(balance)} CTC below floor`);
    writeState({ cycles: n, lastError: "balance below floor" });
    return;
  }

  const attested = await attestedHeight(creditcoinChainId, Number(ethereum.chainKey));
  const probeCeiling = attested - 60;
  const { provider, url, head, span } = await ethProvider(ethereum.pool, probeCeiling);
  const ceiling = Math.min(head, attested) - 60;

  const state = readState();
  const { found, scannedTo } = await findEvents(
    provider,
    ethereum.pool,
    ceiling,
    state.lastScannedEthBlock,
    span
  );

  log(
    `cycle ${n} · eth ${head.toLocaleString()} · attested ${attested.toLocaleString()} · ` +
      `${found.length} candidate(s) · via ${url.replace("https://", "")} @${span}-block windows`
  );

  let ingested = 0;
  for (const e of found) {
    let proof;
    try {
      proof = await proofForTx(creditcoinChainId, Number(ethereum.chainKey), e.txHash);
    } catch (err) {
      log(`  ${e.txHash.slice(0, 18)}… proof unavailable: ${String(err.message).slice(0, 60)}`);
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
      const facts = r.logs.filter((l) => {
        try {
          return attestor.interface.parseLog(l)?.name === "CreditFactAttested";
        } catch {
          return false;
        }
      }).length;
      log(`  ${e.label.padEnd(11)} ${e.txHash.slice(0, 18)}… → ${facts} fact(s)  tx ${tx.hash.slice(0, 18)}…`);
      ingested++;
      writeState({ lastIngestAt: new Date().toISOString(), lastIngestTx: tx.hash });
    } catch (err) {
      const msg = String(err.shortMessage || err.message);
      // A replayed query id is the dedupe working, not a failure.
      log(`  ${e.txHash.slice(0, 18)}… ${msg.includes("already processed") ? "already ingested" : msg.slice(0, 70)}`);
    }
  }

  const total = (state.totalIngested || 0) + ingested;
  writeState({
    cycles: n,
    lastScannedEthBlock: scannedTo,
    attestedHeight: attested,
    ethHead: head,
    lastCycleAt: new Date().toISOString(),
    totalIngested: total,
    intervalSeconds: INTERVAL,
    relayer: signer.address,
    lastError: null,
  });
  if (ingested) log(`  ${ingested} ingested this cycle · ${total} lifetime`);
}

async function main() {
  const book = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", `${NETWORK}.json`), "utf8"));
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");

  const rpc = process.env.MERITR_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network";
  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(key, provider);

  const abi = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "artifacts", "contracts", "MeritrAttestor.sol", "MeritrAttestor.json"),
      "utf8"
    )
  ).abi;
  const attestor = new ethers.Contract(book.contracts.MeritrAttestor, abi, signer);

  const ethereum = deploymentsFor(Number(book.chainId)).find((c) => c.evmChainId === 1);
  if (!ethereum) throw new Error("No Ethereum entry in the catalogue");

  log("=".repeat(70));
  log("Meritr Attestcoin relayer");
  log(`  network   ${NETWORK} (${book.chainId})`);
  log(`  attestor  ${book.contracts.MeritrAttestor}`);
  log(`  relayer   ${signer.address}  (holds no roles)`);
  log(`  source    ${ethereum.protocol} ${ethereum.pool} - chainKey ${ethereum.chainKey}`);
  log(`  interval  ${INTERVAL}s · max ${MAX_PER_CYCLE}/cycle`);
  log("=".repeat(70));

  const ctx = { attestor, signer, ethereum, creditcoinChainId: Number(book.chainId) };

  if (flag("once")) {
    await cycle(ctx);
    return;
  }

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      log(`${sig} received; finishing the current cycle then stopping.`);
      stopping = true;
    });
  }

  while (!stopping) {
    try {
      await cycle(ctx);
    } catch (e) {
      // Never exit on a transient RPC or prover failure; systemd restarting a healthy
      // process on every network blip is worse than logging and waiting.
      log(`cycle failed: ${String(e.message).slice(0, 120)}`);
      writeState({ lastError: String(e.message).slice(0, 200) });
    }
    for (let i = 0; i < INTERVAL && !stopping; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  log("stopped cleanly");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
