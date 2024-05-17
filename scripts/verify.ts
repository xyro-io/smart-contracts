import * as fs from "fs";
import hre from "hardhat";
import { ethers } from "hardhat";

const parse18 = ethers.parseEther;

interface ContractData {
  address: string;
  url: string;
}

let contracts: {
  [x: string]: ContractData;
};
if (fs.existsSync("./contracts.json")) {
  contracts = JSON.parse(fs.readFileSync("contracts.json", "utf8"));
}

function isAlreadyVerified(error: any, verifiedAddress: string) {
  if (
    error.toString().includes("Already Verified") ||
    error.toString().includes("already verified")
  ) {
    console.log("Already verified");
    console.log(`https://sepolia.arbiscan.io/address/${verifiedAddress}#code`);
    return true;
  } else {
    console.log(error);
  }
}

function getVerifiedUrl(verifiedAddress: string) {
  return `https://sepolia.arbiscan.io/address/${verifiedAddress}#code`;
}

async function verifyMockUSDC() {
  if (contracts.USDC.address !== undefined) {
    let targetAddress = contracts.USDC.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [parse18((1e13).toString())],
      });
      contracts.USDC.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.USDC.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyXyroToken() {
  if (contracts.XyroToken.address !== undefined) {
    let targetAddress = contracts.XyroToken.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [parse18((1e8).toString())],
      });
      contracts.XyroToken.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.XyroToken.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyTreasury() {
  if (contracts.Treasury.address !== undefined) {
    let targetAddress = contracts.Treasury.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [
          contracts.USDC.address,
          contracts.XyroToken.address,
        ],
      });
      contracts.Treasury.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.Treasury.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyBullseye() {
  if (contracts.BullseyeGame.address !== undefined) {
    let targetAddress = contracts.BullseyeGame.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.BullseyeGame.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.BullseyeGame.url = getVerifiedUrl(targetAddress);
    }
  }
}

// async function verifySetups() {
//   await hre.run("verify:verify", {
//     address: "0xc06d0686CC730d95d121Ec28A0802090aA41D7d5",
//     constructorArguments: [
//       false,
//       1709625250,
//       1709626500,
//       12412,
//       123,
//       "0x5E48e2020143fCAba88fE1329fa0805f6FEc90E3",
//       "30000000000000000000",
//     ],
//   });
// }

async function verifyGameFactory() {
  if (contracts.GameFactory.address !== undefined) {
    let targetAddress = contracts.GameFactory.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [contracts.Treasury.address],
      });
      contracts.GameFactory.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.GameFactory.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyOneVsOneExactPrice() {
  if (contracts.ExactPriceOneVsOne.address !== undefined) {
    let targetAddress = contracts.ExactPriceOneVsOne.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.ExactPriceOneVsOne.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.ExactPriceOneVsOne.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyOneVsOneUpDown() {
  if (contracts.UpDownOneVsOne.address !== undefined) {
    let targetAddress = contracts.UpDownOneVsOne.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.UpDownOneVsOne.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.UpDownOneVsOne.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyUpDown() {
  if (contracts.UpDown.address !== undefined) {
    let targetAddress = contracts.UpDown.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.UpDown.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.UpDown.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyFrontHelper() {
  if (contracts.FrontHelper.address !== undefined) {
    let targetAddress = contracts.FrontHelper.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.FrontHelper.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.FrontHelper.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyUpkeep() {
  if (contracts.MockUpkeep.address !== undefined) {
    let targetAddress = contracts.MockUpkeep.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.MockUpkeep.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.MockUpkeep.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyRealUpkeep() {
  if (contracts.RealUpkeep.address !== undefined) {
    let targetAddress = contracts.RealUpkeep.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.RealUpkeep.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.RealUpkeep.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verify() {
  await verifyXyroToken();
  await verifyMockUSDC();
  await verifyTreasury();
  await verifyOneVsOneExactPrice();
  await verifyOneVsOneUpDown();
  await verifyGameFactory();
  await verifyBullseye();
  await verifyUpDown();
  await verifyFrontHelper();
  await verifyUpkeep();
  await verifyRealUpkeep();
  // await verifySetups();
  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
}
verify();
