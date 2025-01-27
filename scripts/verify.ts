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
        constructorArguments: [],
      });
      contracts.Treasury.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.Treasury.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyBullseye() {
  if (contracts.Bullseye.address !== undefined) {
    let targetAddress = contracts.Bullseye.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.Bullseye.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.Bullseye.url = getVerifiedUrl(targetAddress);
    }

    // BullseyeFee75
    targetAddress = contracts.BullseyeFee75.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.BullseyeFee75.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.BullseyeFee75.url = getVerifiedUrl(targetAddress);
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

    // UpDownFee15
    targetAddress = contracts.UpDownFee15.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.UpDownFee15.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.UpDownFee15.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyOneVsOneExactPrice() {
  if (contracts.OneVsOne.address !== undefined) {
    let targetAddress = contracts.OneVsOne.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.OneVsOne.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.OneVsOne.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifySetup() {
  if (contracts.Setup.address !== undefined) {
    let targetAddress = contracts.Setup.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [contracts.Treasury.address],
      });
      contracts.Setup.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.Setup.url = getVerifiedUrl(targetAddress);
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

async function verifyMockUpkeep() {
  if (contracts.MockUpkeep.address !== undefined) {
    let targetAddress = contracts.MockUpkeep.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [],
      });
      contracts.MockVerifier.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.MockVerifier.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyVerifier(verifier: string) {
  if (contracts.RealUpkeep.address !== undefined) {
    let targetAddress = contracts.RealUpkeep.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [verifier],
      });
      contracts.RealUpkeep.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.RealUpkeep.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyBank() {
  if (contracts.RevenueBank.address !== undefined) {
    let targetAddress = contracts.RevenueBank.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [
          contracts.USDC.address,
          contracts.XyroToken.address,
          contracts.Treasury.address,
          "0x59D74185D879b63e8543073fFA73cD5a12Fc4104",
          "0x101F443B4d1b059569D643917553c771E1b9663E",
        ],
      });
      contracts.RevenueBank.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.RevenueBank.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verifyTokenOwner(token: string, owner: string) {
  try {
    await hre.run("verify:verify", {
      address: owner,
      constructorArguments: [token],
    });
    console.log(getVerifiedUrl(owner));
  } catch (e) {
    if (isAlreadyVerified(e, owner)) console.log(getVerifiedUrl(owner));
  }
}

async function verifyTimeLock() {
  if (contracts.TimeLock.address !== undefined) {
    let targetAddress = contracts.TimeLock.address;
    try {
      await hre.run("verify:verify", {
        address: targetAddress,
        constructorArguments: [
          100,
          ["0x59D74185D879b63e8543073fFA73cD5a12Fc4104"],
          ["0x59D74185D879b63e8543073fFA73cD5a12Fc4104"],
          "0x59D74185D879b63e8543073fFA73cD5a12Fc4104",
        ],
        contract: "contracts/TimeLock.sol:TimeLock",
      });
      contracts.TimeLock.url = getVerifiedUrl(targetAddress);
    } catch (e) {
      if (isAlreadyVerified(e, targetAddress))
        contracts.TimeLock.url = getVerifiedUrl(targetAddress);
    }
  }
}

async function verify() {
  await verifyTimeLock();
  await verifyXyroToken();
  await verifyMockUSDC();
  await verifyTreasury();
  await verifyOneVsOneExactPrice();
  await verifyBullseye();
  await verifyUpDown();
  await verifyFrontHelper();
  await verifyMockUpkeep();
  await verifySetup();
  await verifyBank();
  const mainnetVerifierAdr = "0x478Aa2aC9F6D65F84e09D9185d126c3a17c2a93C";
  const testnetVerifierAdr = "0x2ff010DEbC1297f19579B4246cad07bd24F2488A";
  // await verifyVerifier(testnetVerifierAdr);
  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
}
verify();
