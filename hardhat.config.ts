import { HardhatUserConfig } from "hardhat/config";
import "hardhat-contract-sizer";
import "hardhat-dependency-compiler";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import "@nomicfoundation/hardhat-ethers";

const config: HardhatUserConfig = {
  networks: {
    mumbai: {
      url: "https://polygon-mumbai.blockpi.network/v1/rpc/public",
      accounts: [
        "4e4057af8c1e669a4a912b96b598c8ce1728454fdb9b6e961b522c23d0c7b513",
      ],
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 25,
    showTimeSpent: true,
    token: "ETH",
    gasPriceApi: "https://api.bscscan.com/api?module=proxy&action=eth_gasPrice",
    coinmarketcap: "d64e6644-6472-4b53-8375-5ae706aec3eb",
  },
};
export default config;
