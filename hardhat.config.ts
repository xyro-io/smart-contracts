import { HardhatUserConfig } from "hardhat/config";
// import "hardhat-contract-sizer";
// import "hardhat-dependency-compiler";
import "hardhat-gas-reporter";
// import "@nomicfoundation/hardhat-ethers";
// import "@typechain/hardhat";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  networks: {
    mumbai: {
      url: "https://polygon-mumbai.blockpi.network/v1/rpc/public",
      accounts: [
        "4e4057af8c1e669a4a912b96b598c8ce1728454fdb9b6e961b522c23d0c7b513",
      ],
    },
    ganache: {
      url: "HTTP://127.0.0.1:8545",
      accounts: [
        "0xb181b71e57dee6063f0dc40376007a071dc55640998fc31b7c451497465bbd23",
        "0xab37fb15374ebcd4b9ce4b9445980a4e55bff31cb587159729670b877b24cc5c",
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
      {
        version: "0.7.6",
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
