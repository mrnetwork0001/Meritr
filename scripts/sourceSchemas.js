/**
 * Meritr — source-chain event schema catalogue.
 *
 * MeritrAttestor does not hard-code any lending protocol's ABI. It reads an on-chain registry of
 * (chainKey, emitter, topic0) -> schema entries describing where the borrower and the amount sit
 * inside a log. This file is the human-readable catalogue the deploy script registers from, and
 * the same source of truth the tests build proofs against.
 *
 * ── The chainKey trap ────────────────────────────────────────────────────────────────────────
 * `chainKey` is the Attestcoin protocol's own identifier for a source chain. It is NOT the EVM
 * chain id, and — critically — the SAME source chain has a DIFFERENT chainKey depending on which
 * Creditcoin network you are on:
 *
 *     source chain        Creditcoin mainnet (102030)   Creditcoin testnet (102031)
 *     Ethereum (id 1)     chainKey 1                    chainKey 3
 *     Sepolia (11155111)  not supported                 chainKey 1
 *
 * Those values were read from the ChainInfo precompile at 0x…0FD3 via `get_supported_chains()`,
 * not inferred. Registering a schema under the wrong key is silent: the proof simply never
 * matches and the borrower's history never lands. `verifyChainKeys.js` re-checks this catalogue
 * against the live precompile.
 */
const { id: keccakId } = require("ethers");

/** Action discriminators — must match the ACTION_* constants in MeritrAttestor.sol. */
const ACTION = { REPAYMENT: 1, COLLATERAL: 2, LIQUIDATION: 3, BORROW: 4 };

/** The ChainInfo precompile, sibling of the query verifier at 0xFD2. */
const CHAIN_INFO_PRECOMPILE = "0x0000000000000000000000000000000000000FD3";

const CREDITCOIN = { MAINNET: 102030, TESTNET: 102031, DEVNET: 102032 };

/**
 * Aave V3 Pool events.
 *
 * Topic layout drives every field. `subjectTopic` is the indexed slot carrying the account whose
 * credit is affected; `amountWord` is the 32-byte word index of the amount in the data blob.
 */
const AAVE_V3_EVENTS = {
  // Repay(address indexed reserve, address indexed user, address indexed repayer,
  //       uint256 amount, bool useATokens)
  //   topics: [sig, reserve, user, repayer]   data: [amount, useATokens]
  //   subjectTopic 2 selects `user` — the borrower whose debt shrank, not the payer.
  REPAY: {
    signature: "Repay(address,address,address,uint256,bool)",
    topic0: keccakId("Repay(address,address,address,uint256,bool)"),
    schema: {
      enabled: true,
      action: ACTION.REPAYMENT,
      subjectTopic: 2,
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
      subjectTopic: 2,
      subjectWord: 0,
      reserveTopic: 1,
      amountWord: 1,
      fallbackAsset: "0x0000000000000000000000000000000000000000",
    },
  },

  // Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount,
  //        DataTypes.InterestRateMode interestRateMode, uint256 borrowRate,
  //        uint16 indexed referralCode)   — the enum hashes as uint8.
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
  LIQUIDATION: {
    signature: "LiquidationCall(address,address,address,uint256,uint256,address,bool)",
    topic0: keccakId("LiquidationCall(address,address,address,uint256,uint256,address,bool)"),
    schema: {
      enabled: true,
      action: ACTION.LIQUIDATION,
      subjectTopic: 3,
      subjectWord: 0,
      reserveTopic: 2,
      amountWord: 0,
      fallbackAsset: "0x0000000000000000000000000000000000000000",
    },
  },
};

/**
 * Aave V3 deployments Meritr reads credit history from.
 *
 * Every address below was verified on-chain — contract code present, and ERC-20 `symbol()` /
 * `decimals()` read back — rather than copied from documentation. Only stablecoin reserves are
 * registered, pinned to $1.00; a volatile reserve needs a real feed first, and the attestor
 * deliberately records activity but zero dollar value for an asset nobody has priced.
 */
const AAVE_ETHEREUM = {
  name: "Ethereum",
  evmChainId: 1,
  // Approximate wall-clock derivation for a proven block height. Ethereum genesis + ~12s blocks.
  genesisTimestamp: 1438269973n,
  blockTimeSeconds: 12,
  protocol: "Aave V3",
  pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  assets: [
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, priceE8: 100000000n },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, priceE8: 100000000n },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, priceE8: 100000000n },
  ],
};

const AAVE_SEPOLIA = {
  name: "Sepolia",
  evmChainId: 11155111,
  genesisTimestamp: 1655733600n,
  blockTimeSeconds: 12,
  protocol: "Aave V3",
  pool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  assets: [
    { symbol: "USDC", address: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", decimals: 6, priceE8: 100000000n },
    { symbol: "DAI", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", decimals: 18, priceE8: 100000000n },
    { symbol: "USDT", address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", decimals: 6, priceE8: 100000000n },
  ],
};

/**
 * chainKey assignments per Creditcoin network, read from the ChainInfo precompile.
 *
 * Creditcoin testnet is Meritr's primary target: the hackathon requires a testnet deployment,
 * the Attestcoin proof-builder service is only publicly reachable there, and — the part that
 * matters most — testnet attests **Ethereum mainnet** under chainKey 3. So a testnet deployment
 * scores borrowers on real Ethereum economic history, not on throwaway Sepolia activity.
 */
const CATALOGUES = {
  [CREDITCOIN.TESTNET]: [
    { chainKey: 3n, ...AAVE_ETHEREUM },
    { chainKey: 1n, ...AAVE_SEPOLIA },
  ],
  [CREDITCOIN.MAINNET]: [
    // Mainnet currently registers Ethereum only.
    { chainKey: 1n, ...AAVE_ETHEREUM },
  ],
  [CREDITCOIN.DEVNET]: [
    { chainKey: 3n, ...AAVE_ETHEREUM },
    { chainKey: 1n, ...AAVE_SEPOLIA },
  ],
};

/**
 * Source-chain catalogue for a given Creditcoin network.
 * Falls back to the testnet catalogue for local chains, which is what the tests and the local
 * scenario run against.
 */
function deploymentsFor(creditcoinChainId) {
  return CATALOGUES[Number(creditcoinChainId)] ?? CATALOGUES[CREDITCOIN.TESTNET];
}

/** Look up one source chain's entry within a Creditcoin network's catalogue. */
function sourceChain(creditcoinChainId, evmChainId) {
  return deploymentsFor(creditcoinChainId).find((c) => c.evmChainId === evmChainId);
}

/**
 * Named source-chain fixtures for tests and local scenarios.
 *
 * Local runs have no ChainInfo precompile, so there is no authoritative key to honour; these use
 * the Creditcoin *testnet* assignments so a test exercises the same keys the primary deployment
 * will. Never import these in deployment code — use `deploymentsFor(chainId)` so the key always
 * matches the network being deployed to.
 */
const TEST_CHAINS = {
  ETHEREUM: { chainKey: 3n, ...AAVE_ETHEREUM },
  SEPOLIA: { chainKey: 1n, ...AAVE_SEPOLIA },
};

module.exports = {
  ACTION,
  CREDITCOIN,
  TEST_CHAINS,
  CHAIN_INFO_PRECOMPILE,
  AAVE_V3_EVENTS,
  AAVE_ETHEREUM,
  AAVE_SEPOLIA,
  CATALOGUES,
  deploymentsFor,
  sourceChain,
};
