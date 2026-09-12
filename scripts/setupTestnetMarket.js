/**
 * Stand up the lending market on the live Creditcoin testnet deployment.
 *
 *   npx hardhat run scripts/setupTestnetMarket.js --network creditcoinTestnet
 *
 * Creates real, separately-keyed actors - a lender and two borrowers, each funded with CTC for
 * their own gas - rather than doing everything from the deployer. They are distinct onchain
 * participants whose transactions a reviewer can follow independently.
 *
 * The vault's collateral is marked from the live Chainlink ETH/USD feed, so the market value
 * driving every health factor is a real price with a verifiable source. Collateral pricing is
 * governance-fed - that limitation is real and documented - but the number written onchain is
 * not invented.
 *
 * Wallets are derived deterministically from the deployer key so re-running reaches the same
 * actors instead of stranding funds in fresh addresses.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const ETH_RPC = process.env.ETHEREUM_RPC_URL || "https://eth.drpc.org";
const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const FEED_ABI = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

const GAS_STIPEND = ethers.parseEther("2");
const bullet = (m) => console.log(`   ${m}`);

/** Deterministic sub-account, so re-runs reuse the same actors. */
function actor(deployerKey, label) {
  return new ethers.Wallet(ethers.id(`meritr/testnet/${label}/${deployerKey.slice(2, 18)}`));
}

async function main() {
  const bookPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  const vault = await ethers.getContractAt("MeritrVault", book.contracts.MeritrVault);
  const asset = await ethers.getContractAt("MockERC20", book.contracts.asset);
  const collateral = await ethers.getContractAt("MockERC20", book.contracts.collateral);
  const aDec = book.decimals.asset;
  const cDec = book.decimals.collateral;
  const USD = (n) => ethers.parseUnits(String(n), aDec);
  const COLL = (n) => ethers.parseUnits(String(n), cDec);

  console.log("=".repeat(78));
  console.log(`  MERITR - market setup on ${network.name}`);
  console.log("=".repeat(78));

  // --- Real collateral mark from Chainlink ---------------------------------
  const feed = new ethers.Contract(ETH_USD_FEED, FEED_ABI, new ethers.JsonRpcProvider(ETH_RPC));
  const [, answer] = await feed.latestRoundData();
  const ethPriceE8 = BigInt(answer); // Chainlink USD pairs are already 1e8
  await (await vault.setPrices(100_000_000n, ethPriceE8)).wait();
  bullet(`Collateral marked from Chainlink ETH/USD: $${(Number(ethPriceE8) / 1e8).toLocaleString()}`);

  // --- Actors ---------------------------------------------------------------
  const key = process.env.PRIVATE_KEY;
  const roles = ["lender", "borrower-a", "borrower-b"];
  const wallets = {};
  for (const r of roles) wallets[r] = actor(key, r).connect(provider);

  console.log("");
  bullet("Actors (deterministic, each funded for their own gas):");
  for (const r of roles) {
    const w = wallets[r];
    const bal = await provider.getBalance(w.address);
    if (bal < GAS_STIPEND / 2n) {
      await (await deployer.sendTransaction({ to: w.address, value: GAS_STIPEND })).wait();
    }
    bullet(`  ${r.padEnd(11)} ${w.address}  ${ethers.formatEther(await provider.getBalance(w.address))} CTC`);
  }

  // --- Fund the market ------------------------------------------------------
  console.log("");
  bullet("Funding the market…");
  const MAX = ethers.MaxUint256;

  // Lender supplies, and the deployer capitalises the restructuring reserve.
  await (await asset.mint(wallets.lender.address, USD(400_000))).wait();
  await (await asset.connect(wallets.lender).approve(book.contracts.MeritrVault, MAX)).wait();
  await (await vault.connect(wallets.lender).deposit(USD(300_000))).wait();
  bullet(`  lender deposited ${Number(300_000).toLocaleString()} mUSD`);

  await (await asset.mint(deployer.address, USD(80_000))).wait();
  await (await asset.approve(book.contracts.MeritrVault, MAX)).wait();
  await (await vault.fundReserve(USD(60_000))).wait();
  bullet(`  reserve capitalised with ${Number(60_000).toLocaleString()} mUSD`);

  // --- Borrowers ------------------------------------------------------------
  console.log("");
  bullet("Opening credit lines…");
  const plans = [
    { role: "borrower-a", coll: COLL(12) },
    { role: "borrower-b", coll: COLL(5) },
  ];

  for (const p of plans) {
    const w = wallets[p.role];
    const existing = await vault.loanOf(w.address);
    if (existing.active) {
      bullet(`  ${p.role} already has an open loan - skipping`);
      continue;
    }
    await (await collateral.mint(w.address, p.coll)).wait();
    await (await collateral.connect(w).approve(book.contracts.MeritrVault, MAX)).wait();
    await (await asset.mint(w.address, USD(50_000))).wait();
    await (await asset.connect(w).approve(book.contracts.MeritrVault, MAX)).wait();

    // Draw against what this wallet has actually earned. With no attested history that is the
    // protocol's floor - which is the honest result, and exactly the point Meritr makes.
    const q = await vault.quote(w.address);
    const collE8 = (p.coll * ethPriceE8) / 10n ** BigInt(cDec);
    const draw = (((collE8 * q.maxLtvBps) / 10_000n) * 94n) / 100n;
    const drawAssets = (draw * 10n ** BigInt(aDec)) / 100_000_000n;

    await (await vault.connect(w).openLoan(p.coll, drawAssets)).wait();
    bullet(
      `  ${p.role.padEnd(11)} score ${q.score}  APR ${(Number(q.rateBps) / 100).toFixed(2)}%  ` +
        `LTV cap ${(Number(q.maxLtvBps) / 100).toFixed(1)}%  drew $${(Number(drawAssets) / 10 ** aDec).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    );
  }

  // --- Report ---------------------------------------------------------------
  console.log("");
  bullet("Book:");
  for (const p of plans) {
    const w = wallets[p.role];
    const pos = await vault.positionOf(w.address);
    if (!pos.loan.active) continue;
    const hf = Number(pos.healthFactor) / 1e18;
    const state = pos.liquidatable ? "LIQUIDATABLE" : pos.inStressBand ? "STRESSED" : "healthy";
    bullet(
      `  ${w.address}  HF ${hf.toFixed(3)}  ` +
        `debt $${(Number(pos.debt) / 10 ** aDec).toLocaleString("en-US", { maximumFractionDigits: 0 })}  ${state}`
    );
  }
  console.log("");
  bullet(`Pool supplied : $${(Number(await vault.totalAssets()) / 10 ** aDec).toLocaleString()}`);
  bullet(`Reserve       : $${(Number(await vault.reserveBalance()) / 10 ** aDec).toLocaleString()}`);
  console.log("=".repeat(78));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
