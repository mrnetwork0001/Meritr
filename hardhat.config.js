require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * Meritr - Creditcoin EVM.
 *
 * Primary target is Creditcoin **Testnet** (Chain ID 102031): the hackathon requires a testnet
 * deployment, the Attestcoin proof-builder service is only publicly reachable there, and testnet
 * attests Ethereum *mainnet* under chainKey 3 - so a testnet deployment still scores borrowers
 * on real Ethereum credit history.
 *
 * Mainnet is 102030 and devnet is 102032. All three chain ids were verified live against their
 * public RPC endpoints, because an earlier revision of this file had 102030 mislabelled as
 * devnet.
 *
 * The Attestcoin native query verifier lives at the precompile address
 * 0x0000000000000000000000000000000000000FD2 on all three. Local runs substitute a mock at that
 * address (see test/helpers.js); nothing else about the verification path changes.
 */
module.exports = {
  solidity: {
    // @gluwa/asc-contracts pins ^0.8.28; Meritr matches it so the ASC sources compile as shipped.
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: false,
    },
    localhost: {
      // Overridable so a local run can coexist with another node already on 8545
      // (anvil, a second hardhat instance) instead of fighting it for the port.
      url: process.env.HARDHAT_LOCALHOST_RPC || "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Meritr's primary target. Chain ids verified live against the public RPCs:
    //   102030 mainnet · 102031 testnet · 102032 devnet
    creditcoinMainnet: {
      url: process.env.CREDITCOIN_MAINNET_RPC || "https://mainnet3.creditcoin.network",
      chainId: 102030,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    creditcoinTestnet: {
      url: process.env.CREDITCOIN_TESTNET_RPC || "https://rpc.cc3-testnet.creditcoin.network",
      chainId: 102031,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    creditcoinDevnet: {
      url: process.env.CREDITCOIN_DEVNET_RPC || "https://rpc.cc3-devnet.creditcoin.network",
      chainId: 102032,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      creditcoinMainnet: "blockscout",
      creditcoinTestnet: "blockscout",
    },
    customChains: [
      {
        network: "creditcoinMainnet",
        chainId: 102030,
        urls: {
          apiURL: "https://creditcoin.blockscout.com/api",
          browserURL: "https://creditcoin.blockscout.com",
        },
      },
      {
        network: "creditcoinTestnet",
        chainId: 102031,
        urls: {
          apiURL: "https://creditcoin-testnet.blockscout.com/api",
          browserURL: "https://creditcoin-testnet.blockscout.com",
        },
      },
    ],
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 120000 },
};
