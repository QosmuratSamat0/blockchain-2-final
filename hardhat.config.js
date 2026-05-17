require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("solidity-coverage");
require("hardhat-gas-reporter");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || "";
const OPTIMISM_API_KEY = process.env.OPTIMISM_API_KEY || "";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
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
    hardhat: {
      chainId: 31337
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 421614
    },
    optimismSepolia: {
      url: process.env.OPTIMISM_SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155420
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 84532
    }
  },
  etherscan: {
    apiKey: {
      arbitrumSepolia: ARBISCAN_API_KEY,
      optimisticSepolia: OPTIMISM_API_KEY,
      baseSepolia: BASESCAN_API_KEY
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD"
  },
  paths: {
    sources: "src",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts"
  }
};
