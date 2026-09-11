/**
 * Register Aave V3 Ethereum reserves on MeritrAttestor, priced from live Chainlink feeds.
 *
 *   npx hardhat run scripts/configureReserves.js --network creditcoinTestnet
 *
 * MeritrAttestor records activity but *zero dollar value* for any asset nobody has priced, so
 * a borrower who repaid in WETH shows a proven repayment worth nothing until its reserve is
 * configured. This registers the reserves that carry most of Aave's Ethereum volume.
 *
 * Prices are read from Chainlink on Ethereum mainnet rather than hardcoded. They are still a
 * governance-fed input — that limitation is real and documented — but the number written
 * on-chain is a live market price with a verifiable source, not a guess. Chainlink reports USD
 * pairs at 8 decimals, which is already Meritr's `priceE8` convention, so no rescaling is needed.
 *
 * Re-run whenever prices drift materially; `configureAsset` is idempotent.
 */
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { deploymentsFor } = require("./sourceSchemas");

const ETH_RPC = process.env.ETHEREUM_RPC_URL || "https://eth.drpc.org";
const FEED_ABI = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
];

/** Aave V3 Ethereum reserves by volume, each with its Chainlink USD feed. */
const RESERVES = [
  { symbol: "WETH",  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, feed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" },
  { symbol: "WBTC",  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  feed: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c" },
  { symbol: "USDC",  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  feed: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6" },
  { symbol: "USDT",  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  feed: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D" },
  { symbol: "DAI",   address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, feed: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9" },
  { symbol: "LINK",  address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, feed: "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c" },
  // wstETH is a large Aave reserve but has no direct USD feed; priced off ETH, which
  // understates it by the stETH accrual. Better slightly low than unpriced.
  { symbol: "wstETH", address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", decimals: 18, feed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", note: "priced off ETH" },
];

/** Refuse a feed that has gone stale or returned a non-positive answer. */
const MAX_FEED_AGE = 6 * 3600;

async function main() {
  const net = await ethers.provider.getNetwork();
  const bookPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const book = JSON.parse(fs.readFileSync(bookPath, "utf8"));
  const attestor = await ethers.getContractAt("MeritrAttestor", book.contracts.MeritrAttestor);

  const ethereum = deploymentsFor(net.chainId).find((c) => c.evmChainId === 1);
  if (!ethereum) throw new Error("No Ethereum entry in this network's catalogue.");

  console.log("=".repeat(78));
  console.log(`  Pricing Aave V3 Ethereum reserves — chainKey ${ethereum.chainKey}`);
  console.log("=".repeat(78));

  const eth = new ethers.JsonRpcProvider(ETH_RPC);
  const now = Math.floor(Date.now() / 1000);
  let registered = 0;

  for (const r of RESERVES) {
    let priceE8;
    try {
      const feed = new ethers.Contract(r.feed, FEED_ABI, eth);
      const [, answer, , updatedAt] = await feed.latestRoundData();
      const fd = Number(await feed.decimals());
      if (answer <= 0n) throw new Error("non-positive answer");
      const age = now - Number(updatedAt);
      if (age > MAX_FEED_AGE) throw new Error(`stale by ${Math.round(age / 3600)}h`);
      // Normalise to 1e8 regardless of what the feed reports in.
      priceE8 = fd === 8 ? BigInt(answer) : (BigInt(answer) * 10n ** 8n) / 10n ** BigInt(fd);
    } catch (e) {
      console.log(`   ${r.symbol.padEnd(7)} SKIPPED — feed unusable: ${String(e.message).slice(0, 50)}`);
      continue;
    }

    await (await attestor.configureAsset(ethereum.chainKey, r.address, r.decimals, priceE8)).wait();
    const usd = Number(priceE8) / 1e8;
    console.log(
      `   ${r.symbol.padEnd(7)} $${usd.toLocaleString("en-US", { maximumFractionDigits: 2 }).padStart(11)}` +
        `  ${r.decimals} dp  ${r.address}${r.note ? `  (${r.note})` : ""}`
    );
    registered++;
  }

  console.log("=".repeat(78));
  console.log(`   ${registered}/${RESERVES.length} reserves priced from live Chainlink feeds`);
  console.log("=".repeat(78));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
