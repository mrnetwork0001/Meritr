/**
 * Exercise the restructuring mechanism on the live Creditcoin deployment.
 *
 *   npx hardhat run scripts/stressTest.js --network creditcoinTestnet
 *
 * Meritr's central claim is that a distressed loan gets restructured rather than liquidated.
 * Until that has actually fired onchain, the claim is only a description - a reviewer opening
 * the contracts sees ingestion and lending, but no rescue.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, stated plainly:
 *   - The collateral mark-down is an ADMIN ACTION, not a market event. Collateral pricing is
 *     governance-fed through PRICE_ROLE; that is a documented limitation of the protocol and
 *     this script exercises it deliberately. Nothing pretends the market moved.
 *   - Everything downstream of the mark is real: the health factors, the agent's decision, the
 *     restructuring transaction, the rate relief, the term extension and the reserve drawdown
 *     are all genuine onchain state produced by the deployed contracts.
 *
 * The mark is restored to the live Chainlink ETH/USD price afterwards, so the book ends healthy
 * with a real LoanRestructured event in its audit trail.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers, network } = require("hardhat");

const ETH_RPC = process.env.ETHEREUM_RPC_URL || "https://eth.drpc.org";
const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const FEED_ABI = ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"];

/** Health factor to aim for: inside the stress band [1.00, 1.15). */
const TARGET_HF = 1.07;

const bullet = (m = "") => console.log(`   ${m}`);
const hr = (c = "=") => console.log(c.repeat(78));
const hf = (v) => (v > 10n ** 30n ? "∞" : (Number(v) / 1e18).toFixed(3));
const usd = (v, d = 6) =>
  `$${Number(ethers.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function main() {
  const bookPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
  const vault = await ethers.getContractAt("MeritrVault", book.contracts.MeritrVault);
  const aDec = book.decimals.asset;

  hr();
  console.log("  MERITR - restructuring stress test on the live deployment");
  hr();
  bullet(`Network : ${network.name} (${(await ethers.provider.getNetwork()).chainId})`);
  bullet(`Vault   : ${book.contracts.MeritrVault}`);
  console.log("");
  bullet("The collateral mark-down below is an ADMIN action through PRICE_ROLE, not a market");
  bullet("event. Everything after it - health factors, the agent's choice, the restructuring");
  bullet("transaction - is real onchain state produced by the deployed contracts.");

  // --- Who is in the book ---------------------------------------------------
  const head = await ethers.provider.getBlockNumber();
  const borrowers = new Set();
  for (let lo = book.deployedAtBlock; lo <= head; lo += 9000) {
    try {
      const logs = await vault.queryFilter("LoanOpened", lo, Math.min(lo + 8999, head));
      for (const l of logs) borrowers.add(l.args.borrower);
    } catch {
      /* range rejected; keep walking */
    }
  }
  const active = [];
  for (const b of borrowers) {
    const loan = await vault.loanOf(b);
    if (loan.active) active.push({ address: b, loan });
  }
  if (active.length === 0) throw new Error("No active loans. Run setupTestnetMarket.js first.");

  console.log("");
  bullet("Book before:");
  for (const a of active) {
    bullet(`  ${a.address}  HF ${hf(await vault.healthFactorOf(a.address))}  debt ${usd(await vault.debtOf(a.address), aDec)}`);
  }

  const markBefore = await vault.collateralPriceE8();
  bullet(`Collateral mark : ${usd(markBefore, 8)}`);

  // --- Solve for a mark that lands the book in the stress band ---------------
  // All positions share an LTV, so one mark reaches all of them. Take the lowest required
  // price so nobody is pushed below 1.00 and out of the agent's reach.
  let stressMark = null;
  for (const a of active) {
    const debtE8 = ((await vault.debtOf(a.address)) * 100_000_000n) / 10n ** BigInt(aDec);
    const needCollE8 = (BigInt(Math.round(TARGET_HF * 1000)) * debtE8 * 10_000n) / (8250n * 1000n);
    const price = (needCollE8 * 10n ** 18n) / a.loan.collateral;
    if (stressMark === null || price < stressMark) stressMark = price;
  }

  const drawdown = 100 - (Number(stressMark) / Number(markBefore)) * 100;
  console.log("");
  bullet(`Marking collateral to ${usd(stressMark, 8)} - a ${drawdown.toFixed(1)}% drawdown.`);
  bullet("For scale, ETH fell about 82% peak-to-trough during 2022, so this is severe but");
  bullet("well inside historical precedent for the asset being modelled.");
  await (await vault.setPrices(100_000_000n, stressMark)).wait();

  console.log("");
  bullet("Book after the mark:");
  for (const a of active) {
    const pos = await vault.positionOf(a.address);
    const state = pos.liquidatable ? "LIQUIDATABLE" : pos.inStressBand ? "STRESSED" : "healthy";
    bullet(`  ${a.address}  HF ${hf(pos.healthFactor)}  ${state}`);
  }

  // --- Hand the decision to the real agent ----------------------------------
  console.log("");
  hr("-");
  bullet("Handing the book to agents/underwriter.py - a separate process that signs for");
  bullet("itself, discovers borrowers from chain logs and chooses whom to help.");
  hr("-");

  let out;
  try {
    out = execFileSync("python3", ["-m", "agents.underwriter", "--once"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        MERITR_NETWORK: network.name,
        MERITR_RPC_URL: network.config.url,
        RISK_AGENT_PRIVATE_KEY: process.env.PRIVATE_KEY,
      },
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  for (const l of out.split("\n")) {
    if (/Book |HF=|Triage|Restructuring |Confirmed|averts|sits inside|Skipping/i.test(l)) {
      console.log("   " + l.replace(/^\d\d:\d\d:\d\d\s+\w+\s+/, ""));
    }
  }

  // --- Restore the real mark -------------------------------------------------
  console.log("");
  const feed = new ethers.Contract(ETH_USD_FEED, FEED_ABI, new ethers.JsonRpcProvider(ETH_RPC));
  const [, answer] = await feed.latestRoundData();
  await (await vault.setPrices(100_000_000n, BigInt(answer))).wait();
  bullet(`Collateral mark restored to the live Chainlink ETH/USD price: ${usd(answer, 8)}`);

  // --- Evidence --------------------------------------------------------------
  const events = [];
  for (let lo = book.deployedAtBlock; lo <= (await ethers.provider.getBlockNumber()); lo += 9000) {
    try {
      const logs = await vault.queryFilter("LoanRestructured", lo, Math.min(lo + 8999, await ethers.provider.getBlockNumber()));
      events.push(...logs);
    } catch {
      /* keep walking */
    }
  }

  console.log("");
  hr();
  console.log("  ONCHAIN EVIDENCE");
  hr();
  if (events.length === 0) {
    bullet("No LoanRestructured events found - the agent did not act.");
  } else {
    for (const e of events) {
      const a = e.args;
      bullet(`${a.borrower}`);
      bullet(`  health   ${hf(a.healthFactorBefore)} -> ${hf(a.healthFactorAfter)}`);
      bullet(`  rate     ${(Number(a.oldRateBps) / 100).toFixed(2)}% -> ${(Number(a.newRateBps) / 100).toFixed(2)}%`);
      bullet(`  retired  ${usd(a.debtRetiredFromReserve, aDec)} from the reserve`);
      bullet(`  tx       https://creditcoin-testnet.blockscout.com/tx/${e.transactionHash}`);
      console.log("");
    }
    bullet("No collateral was seized in any of the above.");
  }
  bullet("Final book:");
  for (const a of active) {
    const pos = await vault.positionOf(a.address);
    bullet(`  ${a.address}  HF ${hf(pos.healthFactor)}  ${pos.loan.active ? "active" : "closed"}`);
  }
  hr();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
