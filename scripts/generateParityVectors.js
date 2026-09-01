/**
 * Generate cross-language parity vectors.
 *
 *   npx hardhat run scripts/generateParityVectors.js
 *
 * Evaluates the on-chain `CreditMath` library over a deterministic pseudo-random sweep and
 * writes the results to `tests/fixtures/parity_vectors.json`. `tests/test_parity.py` then
 * asserts `agents/scoring.py` reproduces every one of them exactly.
 *
 * The sweep is seeded, so the vectors are reproducible and a regression shows up as a diff.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const E8 = 100_000_000n;
const DAY = 24n * 3600n;

/** Deterministic 32-bit LCG — reproducible across machines, unlike Math.random(). */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

async function main() {
  const Harness = await ethers.getContractFactory("CreditMathHarness");
  const harness = await Harness.deploy();
  await harness.waitForDeployment();

  const rng = makeRng(20260913);
  const NOW = 1_800_000_000n; // fixed evaluation timestamp so vectors are stable

  const cases = [];

  // Hand-picked boundary cases first: empty history, saturation, heavy liquidation counts.
  const explicit = [
    [0n, 0n, 0n, 0n, 0, 0, 0, 0],
    [250_000n * E8, 150_000n * E8, NOW - 730n * DAY, NOW, 40, 0, 4, 50],
    [999_999n * E8, 999_999n * E8, 1n, NOW, 999, 0, 99, 999], // beyond every saturation point
    [1n, 1n, NOW - 1n, NOW, 1, 0, 1, 1],
    [50_000n * E8, 20_000n * E8, NOW - 200n * DAY, NOW, 7, 1, 2, 9],
    [50_000n * E8, 20_000n * E8, NOW - 200n * DAY, NOW, 7, 5, 2, 9],
    [50_000n * E8, 20_000n * E8, NOW - 200n * DAY, NOW, 7, 40, 2, 9], // safety fully decayed
    [10_000n * E8, 0n, NOW + 5000n, NOW, 3, 0, 1, 3], // activity stamped in the future
  ];

  for (const e of explicit) cases.push(e);

  for (let i = 0; i < 160; i++) {
    cases.push([
      BigInt(Math.floor(rng() * 400_000)) * E8,
      BigInt(Math.floor(rng() * 300_000)) * E8,
      NOW - BigInt(Math.floor(rng() * 1200)) * DAY,
      NOW,
      Math.floor(rng() * 60),
      Math.floor(rng() * 6),
      Math.floor(rng() * 6),
      Math.floor(rng() * 120),
    ]);
  }

  const vectors = [];
  for (const c of cases) {
    const facts = {
      totalRepaidE8: c[0],
      totalCollateralE8: c[1],
      firstActivityAt: c[2],
      lastActivityAt: c[3],
      repaymentCount: c[4],
      liquidationCount: c[5],
      chainCount: c[6],
      attestationCount: c[7],
    };
    const b = await harness.score(facts, NOW);
    vectors.push({
      facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, v.toString()])),
      nowTs: NOW.toString(),
      score: Number(b.score),
      repaymentPts: Number(b.repaymentPts),
      collateralPts: Number(b.collateralPts),
      maturityPts: Number(b.maturityPts),
      diversityPts: Number(b.diversityPts),
      safetyPts: Number(b.safetyPts),
      aprBps: Number(await harness.aprBps(b.score)),
      maxLtvBps: Number(await harness.maxLtvBps(b.score)),
    });
  }

  // Curve endpoints and every 25-point step, so a retuned curve cannot slip through.
  const curve = [];
  for (let s = 250; s <= 950; s += 25) {
    curve.push({
      score: s,
      aprBps: Number(await harness.aprBps(s)),
      maxLtvBps: Number(await harness.maxLtvBps(s)),
    });
  }

  const risk = [];
  const riskCases = [
    [30_000n * E8, 12_000n * E8, 8250n],
    [16_000n * E8, 12_000n * E8, 8250n],
    [1n, 1n, 8250n],
    [12_345_678n, 987_654n, 8250n],
    [0n, 5_000n * E8, 8250n],
  ];
  for (const [coll, debt, thr] of riskCases) {
    risk.push({
      collateralE8: coll.toString(),
      debtE8: debt.toString(),
      liqThresholdBps: Number(thr),
      healthFactor: (await harness.healthFactor(coll, debt, thr)).toString(),
      sustainableDebtE8: (
        await harness.sustainableDebtE8(coll, thr, ethers.parseEther("1.35"))
      ).toString(),
    });
  }

  const interest = [];
  for (const [p, r, t] of [
    [12_000n * E8, 1200n, 365n * DAY],
    [12_000n * E8, 1200n, 1n],
    [7_777_777n, 933n, 86_401n],
    [1n, 2400n, 1n],
  ]) {
    interest.push({
      principalE8: p.toString(),
      rateBps: Number(r),
      elapsed: Number(t),
      accrued: (await harness.accrueInterest(p, r, t)).toString(),
    });
  }

  const out = {
    generatedBy: "scripts/generateParityVectors.js",
    note: "On-chain CreditMath outputs. tests/test_parity.py asserts agents/scoring.py matches.",
    scoreVectors: vectors,
    curve,
    risk,
    interest,
  };

  const dir = path.join(__dirname, "..", "tests", "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "parity_vectors.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  console.log(`Wrote ${vectors.length} score vectors, ${curve.length} curve points,`);
  console.log(`      ${risk.length} risk cases, ${interest.length} interest cases`);
  console.log(`   -> tests/fixtures/parity_vectors.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
