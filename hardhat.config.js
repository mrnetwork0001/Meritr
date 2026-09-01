require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    creditcoinTestnet: {
      url: process.env.CREDITCOIN_TESTNET_RPC || "https://rpc.cc3-testnet.creditcoin.network",
      chainId: 102031,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  }
};
