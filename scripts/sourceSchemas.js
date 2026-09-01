/**
 * Meritr — source-chain event schema catalogue.
 *
 * MeritrAttestor does not hard-code any lending protocol's ABI. It reads an on-chain registry
 * of (chainKey, emitter, topic0) -> schema entries describing where the borrower and the amount
 * sit inside a log. This file is the human-readable catalogue the deploy script registers from,
 * and the same source of truth the tests build synthetic proofs against.
 *
 * Adding Compound, Morpho or a new Aave market is an entry here plus a registry transaction —
 * no contract redeployment.
 */
const { id: keccakId } = require("ethers");

// Action discriminators — must match the ACTION_* constants in MeritrAttestor.sol.
const ACTION = { REPAYMENT: 1, COLLATERAL: 2, LIQUIDATION: 3, BORROW: 4 };

/**
 * Attestcoin source-chain keys.
 *
 * NOTE: `chainKey` is the Attestcoin protocol's own chain identifier, which is not necessarily
 * the EVM chain id. The values below use the EVM chain id as the key, which is the convention
 * Creditcoin's testnet bridge examples follow. Confirm against the chain-key registry of the
 * Creditcoin deployment you target before relying on it; `configureSourceChain` makes this a
 * one-transaction correction rather than a redeploy.
 *
 * `genesisTimestamp` + `blockTimeSeconds` let MeritrAttestor derive an approximate wall-clock
 * time for a *proven* block height, which feeds the wallet-maturity score component. Always
 * clamped to `block.timestamp` on-chain, so a height can never manufacture future history.
 */
const CHAINS = {
  ETHEREUM: {
    chainKey: 1n,
    name: "Ethereum",
    genesisTimestamp: 1438269973n, // 2015-07-30
    blockTimeSeconds: 12,
  },
  BASE: {
    chainKey: 8453n,
    name: "Base",
    genesisTimestamp: 1686789347n, // 2023-06-15
    blockTimeSeconds: 2,
  },
  ETHEREUM_SEPOLIA: {
    chainKey: 11155111n,
    name: "Ethereum Sepolia",
    genesisTimestamp: 1655733600n,
    blockTimeSeconds: 12,
  },
  BASE_SEPOLIA: {
    chainKey: 84532n,
    name: "Base Sepolia",
    genesisTimestamp: 1695902400n,
    blockTimeSeconds: 2,
  },
};

/**
 * Aave V3 Pool events.
 *
 * Topic layout drives every field below — `subjectTopic` is the indexed slot carrying the
 * account whose credit is affected, `amountWord` is the 32-byte word index of the amount inside
 * the non-indexed data blob.
 */
const AAVE_V3_EVENTS = {
  // Repay(address indexed reserve, address indexed user, address indexed repayer,
  //       uint256 amount, bool useATokens)
  //   topics: [sig, reserve, user, repayer]   data: [amount, useATokens]
  REPAY: {
    signature: "Repay(address,address,address,uint256,bool)",
    topic0: keccakId("Repay(address,address,address,uint256,bool)"),
    schema: {
      enabled: true,
      action: ACTION.REPAYMENT,
      subjectTopic: 2, // `user` — the borrower whose debt shrank, not the payer
      subjectWord: 0,
      reserveTopic: 1,
      amountWord: 0,
      fallbackAsset: "0x0000000000000000000000000000000000000000",
    },
  },

  // Supply(address indexed reserve, address user, address indexed onBehalfOf,
  //        uint256 amount, uint16 indexed referralCode)
  //   topics: [sig, reserve, onBehalfOf, referralCode]   data: [user, amount]
  SUPPLY: {
    signature: "Supply(address,address,address,uint256,uint16)",
    topic0: keccakId("Supply(address,address,address,uint256,uint16)"),
    schema: {
      enabled: true,
      action: ACTION.COLLATERAL,
      subjectTopic: 2, // `onBehalfOf` — the account actually credited with the collateral
      subjectWord: 0,
      reserveTopic: 1,
      amountWord: 1,
      fallbackAsset: "0x0000000000000000000000000000000000000000",
    },
  },

  // Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount,
  //        DataTypes.InterestRateMode interestRateMode, uint256 borrowRate,
  //        uint16 indexed referralCode)
  //   The enum encodes as uint8 in the signature hash.
  //   topics: [sig, reserve, onBehalfOf, referralCode]
  //   data:   [user, amount, interestRateMode, borrowRate]
  BORROW: {
    signature: "Borrow(address,address,address,uint256,uint8,uint256,uint16)",
    topic0: keccakId("Borrow(address,address,address,uint256,uint8,uint256,uint16)"),
    schema: {
      enabled: true,
      action: ACTION.BORROW,
      subjectTopic: 2,
      subjectWord: 0,
      reserveTopic: 1,
      amountWord: 1,
      fallbackAsset: "0x0000000000000000000000000000000000000000",
    },
  },

  // LiquidationCall(address indexed collateralAsset, address indexed debtAsset,
  //                 address indexed user, uint256 debtToCover,
  //                 uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)
  //   topics: [sig, collateralAsset, debtAsset, user]
  //   data:   [debtToCover, liquidatedCollateralAmount, liquidator, receiveAToken]
  LIQUIDATION: {
    signature:
      "LiquidationCall(address,address,address,uint256,uint256,address,bool)",
    topic0: keccakId(
      "LiquidationCall(address,address,address,uint256,uint256,address,bool)"
    ),
    schema: {
      enabled: true,
      action: ACTION.LIQUIDATION,
      subjectTopic: 3, // `user` — the liquidated borrower
      subjectWord: 0,
      reserveTopic: 2, // `debtAsset`
      amountWord: 0,
      fallbackAsset: "0x0000000000000000000000000000000000000000",
    },
  },
};

/**
 * Aave V3 deployments Meritr reads credit history from, per source chain.
 *
 * Every address below was verified on-chain (contract code present; ERC-20 `symbol()` and
 * `decimals()` read back) rather than copied from documentation.
 *
 * Prices are USD 1e8. Only stablecoin reserves are registered, pinned to $1.00 — a volatile
 * reserve needs a real price feed before it can be added, and MeritrAttestor deliberately
 * records activity but *zero dollar value* for any asset nobody has priced.
 */
const MAINNET_DEPLOYMENTS = [
  {
    chain: CHAINS.ETHEREUM,
    protocol: "Aave V3",
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    assets: [
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, priceE8: 100000000n },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, priceE8: 100000000n },
      { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, priceE8: 100000000n },
    ],
  },
  {
    chain: CHAINS.BASE,
    protocol: "Aave V3",
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    assets: [
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, priceE8: 100000000n },
    ],
  },
];

/** Testnet equivalents, used when deploying to Creditcoin testnet or devnet. */
const TESTNET_DEPLOYMENTS = [
  {
    chain: CHAINS.ETHEREUM_SEPOLIA,
    protocol: "Aave V3",
    pool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    assets: [
      { symbol: "USDC", address: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", decimals: 6, priceE8: 100000000n },
      { symbol: "DAI", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", decimals: 18, priceE8: 100000000n },
      { symbol: "USDT", address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", decimals: 6, priceE8: 100000000n },
    ],
  },
  {
    chain: CHAINS.BASE_SEPOLIA,
    protocol: "Aave V3",
    pool: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b",
    assets: [
      { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6, priceE8: 100000000n },
    ],
  },
];

/**
 * Pick the source-chain catalogue that matches the Creditcoin network being deployed to.
 * Mainnet reads mainnet history; testnet and devnet read testnet history. Registering Sepolia
 * pools on mainnet would score borrowers on activity that costs nothing to manufacture.
 */
function deploymentsFor(creditcoinChainId) {
  return Number(creditcoinChainId) === 102030 ? MAINNET_DEPLOYMENTS : TESTNET_DEPLOYMENTS;
}

/** Default export kept pointing at mainnet, which is Meritr's primary target. */
const DEPLOYMENTS = MAINNET_DEPLOYMENTS;

module.exports = {
  ACTION,
  CHAINS,
  AAVE_V3_EVENTS,
  DEPLOYMENTS,
  MAINNET_DEPLOYMENTS,
  TESTNET_DEPLOYMENTS,
  deploymentsFor,
};
