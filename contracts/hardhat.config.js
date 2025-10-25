require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const { RPC_URL, PRIVATE_KEY, CHAIN_ID } = process.env;

module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    live: {
      url: RPC_URL,
      chainId: parseInt(CHAIN_ID || "11155111", 10),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
