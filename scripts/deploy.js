/**
 * Meritr - one-command deployment.
 *
 *   npx hardhat run scripts/deploy.js --network creditcoinMainnet   # chain 102030
 *   npx hardhat run scripts/deploy.js --network creditcoinTestnet   # chain 102031
 *
 * Deploys all four subsystems, wires their roles, and registers the source-chain event schemas
 * that teach MeritrAttestor how to read Aave V3 logs on its registered source chains. The resulting
 * address book is written to `deployments/<network>.json`, which the FastAPI backend, the DeAI
 * agent and the Next.js frontend all read - so a fresh deploy propagates everywhere with no
 * hand-edited config.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { AAVE_V3_EVENTS, deploymentsFor } = require("./sourceSchemas");
const { verifyCatalogue } = require("./verifyChainKeys");

const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
const ONE_USD_E8 = 100_000_000n;

/**
 * Chain ids where the Attestcoin native query verifier exists as a runtime precompile.
 * Verified live against the public RPCs: 102030 mainnet, 102031 testnet, 102032 devnet.
 */
const CREDITCOIN_CHAIN_IDS = new Set([102030n, 102031n, 102032n]);
const MAINNET_CHAIN_ID = 102030n;

function log(msg) {
  console.log(msg);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  log("=".repeat(78));
  log("  MERITR - Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS");
  log("=".repeat(78));
  log(`  Network      : ${network.name} (chainId ${net.chainId})`);
  log(`  Deployer     : ${deployer.address}`);
  log(`  Balance      : ${ethers.formatEther(balance)} CTC`);

  // --- Precompile preflight -------------------------------------------------
  const isCreditcoin = CREDITCOIN_CHAIN_IDS.has(net.chainId);
  const precompileCode = await ethers.provider.getCode(PRECOMPILE);
  const precompileVisible = precompileCode !== "0x";

  if (isCreditcoin) {
    log(`  Attestcoin   : precompile ${PRECOMPILE} (native runtime)`);
  } else if (precompileVisible) {
    log(`  Attestcoin   : mock verifier installed at ${PRECOMPILE}`);
  } else {
    log(`  Attestcoin   : WARNING - no verifier at ${PRECOMPILE} on this network.`);
    log("                 Ingestion will revert until one exists. Deploy to a Creditcoin");
    log("                 network (102030/102031/102032), or run scripts/simulate.js locally.");
  }
  if (balance === 0n) {
    throw new Error(
      "Deployer has zero balance. Fund the account before deploying."
    );
  }

  // --- Mainnet gate ---------------------------------------------------------
  // Meritr is configured for mainnet, but a lending protocol holding real deposits is not
  // something a script should be able to deploy by accident, or on the strength of a default.
  // Both guards below are one environment variable to clear - they exist to make the step
  // deliberate, not to obstruct it.
  const isMainnet = net.chainId === MAINNET_CHAIN_ID;
  if (isMainnet) {
    log("");
    log("  ** CREDITCOIN MAINNET **");
    log("  These contracts custody real deposits and have not been audited.");
    if (process.env.MERITR_CONFIRM_MAINNET !== "yes") {
      throw new Error(
        "Refusing to deploy to Creditcoin mainnet without explicit confirmation.\n" +
          "Re-run with MERITR_CONFIRM_MAINNET=yes once you intend this."
      );
    }
  }
  log("=".repeat(78));

  // --- 1. Attestcoin ingestion ---------------------------------------------
  log("\n[1/4] MeritrAttestor - Attestcoin cross-chain ingestion");
  const Attestor = await ethers.getContractFactory("MeritrAttestor");
  const attestor = await Attestor.deploy(deployer.address);
  await attestor.waitForDeployment();
  const attestorAddress = await attestor.getAddress();
  log(`      deployed -> ${attestorAddress}`);

  // --- 2. Soulbound passport ------------------------------------------------
  log("\n[2/4] MeritrPassport - soulbound cross-chain credit passport");
  const Passport = await ethers.getContractFactory("MeritrPassport");
  const passport = await Passport.deploy(deployer.address, attestorAddress);
  await passport.waitForDeployment();
  const passportAddress = await passport.getAddress();
  log(`      deployed -> ${passportAddress}`);

  // --- 3. Demo assets -------------------------------------------------------
  // Creditcoin testnet has no canonical stablecoin, so Meritr ships its own demo pair. Point
  // the vault at real tokens by setting MERITR_ASSET / MERITR_COLLATERAL instead.
  log("\n[3/4] Market assets");
  let assetAddress = process.env.MERITR_ASSET;
  let collateralAddress = process.env.MERITR_COLLATERAL;
  let assetDecimals = Number(process.env.MERITR_ASSET_DECIMALS || 6);
  let collateralDecimals = Number(process.env.MERITR_COLLATERAL_DECIMALS || 18);

  if (!assetAddress || !collateralAddress) {
    // MockERC20 has an open `mint`. On a testnet that is a convenience; on mainnet it is a
    // token anyone can print, so the vault must be pointed at real assets instead.
    if (isMainnet && process.env.MERITR_ALLOW_MOCK_TOKENS !== "yes") {
      throw new Error(
        "Refusing to deploy freely-mintable demo tokens to mainnet.\n" +
          "Set MERITR_ASSET / MERITR_COLLATERAL (plus their *_DECIMALS) to real token " +
          "addresses, or set MERITR_ALLOW_MOCK_TOKENS=yes if you genuinely want demo tokens."
      );
    }
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await ERC20.deploy("Meritr USD", "mUSD", 6);
    await asset.waitForDeployment();
    const coll = await ERC20.deploy("Meritr Wrapped Ether", "mWETH", 18);
    await coll.waitForDeployment();
    assetAddress = await asset.getAddress();
    collateralAddress = await coll.getAddress();
    assetDecimals = 6;
    collateralDecimals = 18;
    log(`      mUSD  (asset)      -> ${assetAddress}`);
    log(`      mWETH (collateral) -> ${collateralAddress}`);
  } else {
    log(`      asset      -> ${assetAddress} (${assetDecimals} decimals)`);
    log(`      collateral -> ${collateralAddress} (${collateralDecimals} decimals)`);
  }

  // --- 4. Vault -------------------------------------------------------------
  log("\n[4/4] MeritrVault - autonomous restructuring credit vault");
  const Vault = await ethers.getContractFactory("MeritrVault");
  const vault = await Vault.deploy(
    deployer.address,
    assetAddress,
    assetDecimals,
    collateralAddress,
    collateralDecimals,
    attestorAddress,
    passportAddress,
    ONE_USD_E8,
    3000n * ONE_USD_E8
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  log(`      deployed -> ${vaultAddress}`);

  // --- Wiring ---------------------------------------------------------------
  log("\n[wiring] roles");
  const agentAddress = process.env.RISK_AGENT_ADDRESS || deployer.address;
  await (await vault.grantRole(await vault.RISK_AGENT_ROLE(), agentAddress)).wait();
  log(`      RISK_AGENT_ROLE -> ${agentAddress}`);
  await (await passport.grantRole(await passport.REFRESHER_ROLE(), agentAddress)).wait();
  log(`      REFRESHER_ROLE  -> ${agentAddress}`);

  // --- Source-chain registry ------------------------------------------------
  log("\n[registry] source chains, assets and event schemas");
  // Mainnet Creditcoin reads mainnet source history; testnet reads testnet. Registering
  // Sepolia pools on mainnet would score borrowers on activity that costs nothing to fake.
  const catalogue = deploymentsFor(net.chainId);
  log(`      catalogue: ${catalogue.length} source chain(s) for Creditcoin ${net.chainId}`);

  // A wrong chainKey is silent: proofs simply never match and no history ever lands. Check the
  // catalogue against the chain's own ChainInfo registry before writing any of it onchain.
  const check = await verifyCatalogue(ethers.provider, net.chainId);
  if (check.ok === false) {
    throw new Error(
      "chainKey mismatch against the onchain registry:\n  " + check.problems.join("\n  ")
    );
  }
  log(`      chainKeys: ${check.ok === null ? "no registry on this network (local)" : "verified against 0x…0FD3"}`);
  const registered = [];
  for (const c of catalogue) {
    await (
      await attestor.configureSourceChain(
        c.chainKey,
        c.name,
        c.genesisTimestamp,
        c.blockTimeSeconds,
        true
      )
    ).wait();
    log(`      chain  ${c.name} (chainKey ${c.chainKey}, EVM ${c.evmChainId})`);

    for (const a of c.assets) {
      await (await attestor.configureAsset(c.chainKey, a.address, a.decimals, a.priceE8)).wait();
      log(`        asset  ${a.symbol.padEnd(5)} ${a.address}`);
    }

    for (const [name, evt] of Object.entries(AAVE_V3_EVENTS)) {
      await (await attestor.registerSchema(c.chainKey, c.pool, evt.topic0, evt.schema)).wait();
      log(`        event  ${name.padEnd(11)} ${evt.signature}`);
    }

    registered.push({
      chainKey: c.chainKey.toString(),
      name: c.name,
      evmChainId: c.evmChainId,
      protocol: c.protocol,
      pool: c.pool,
      assets: c.assets.map((a) => ({ ...a, priceE8: a.priceE8.toString() })),
    });
  }

  // --- Address book ---------------------------------------------------------
  const book = {
    network: network.name,
    chainId: net.chainId.toString(),
    deployedAt: new Date().toISOString(),
    // Where log scans should start. Public RPCs cap eth_getLogs ranges, so scanning from
    // genesis on a live chain fails - and fails *silently*, leaving the agent and the
    // dashboard convinced the book is empty.
    deployedAtBlock: await ethers.provider.getBlockNumber(),
    deployer: deployer.address,
    riskAgent: agentAddress,
    attestcoinPrecompile: PRECOMPILE,
    contracts: {
      MeritrAttestor: attestorAddress,
      MeritrPassport: passportAddress,
      MeritrVault: vaultAddress,
      asset: assetAddress,
      collateral: collateralAddress,
    },
    decimals: { asset: assetDecimals, collateral: collateralDecimals },
    sourceChains: registered,
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(book, null, 2));

  log("\n" + "=".repeat(78));
  log("  DEPLOYMENT COMPLETE");
  log("=".repeat(78));
  log(`  MeritrAttestor  ${attestorAddress}`);
  log(`  MeritrPassport  ${passportAddress}`);
  log(`  MeritrVault     ${vaultAddress}`);
  log(`  Asset (mUSD)    ${assetAddress}`);
  log(`  Collateral      ${collateralAddress}`);
  log(`\n  Address book -> deployments/${network.name}.json`);
  if (net.chainId === MAINNET_CHAIN_ID) {
    log(`  Explorer     -> https://creditcoin.blockscout.com/address/${vaultAddress}`);
  } else if (net.chainId === 102031n) {
    log(`  Explorer     -> https://creditcoin-testnet.blockscout.com/address/${vaultAddress}`);
  }
  log("\n  Next:");
  log("    python3 -m agents.underwriter --once     # run the DeAI risk agent");
  log("    npm run backend                          # FastAPI risk API on :8000");
  log("    npm run dev                              # Next.js dashboard on :3000");
  log("=".repeat(78));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
