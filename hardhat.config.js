require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * Meritr — Creditcoin EVM Testnet (Chain ID 102031).
 *
 * The Attestcoin native query verifier lives at the precompile address
 * 0x0000000000000000000000000000000000000FD2 on Creditcoin networks. Local runs substitute a
 * mock at that address (see test/helpers.js); nothing else about the verification path changes.
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
      // Meritr accrues interest over days; tests advance time explicitly.
      allowUnlimitedContractSize: false,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    creditcoinTestnet: {
      url: process.env.CREDITCOIN_TESTNET_RPC || "https://rpc.cc3-testnet.creditcoin.network",
      chainId: 102031,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    creditcoinDevnet: {
      url: process.env.CREDITCOIN_DEVNET_RPC || "https://rpc.cc3-devnet.creditcoin.network",
      chainId: 102030,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: { creditcoinTestnet: "blockscout" },
    customChains: [
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
