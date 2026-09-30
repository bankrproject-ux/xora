require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },

  networks: {
    robinhood: {
      url: "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663
    }
  }
};
