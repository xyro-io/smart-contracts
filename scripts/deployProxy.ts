import { wrapFnc } from "./helper";
import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const parse18 = ethers.parseEther;

interface ContractData {
  address: string;
  url: string;
}

let contracts: {
    [x: string]: ContractData;
  },
  Treasury,
  Setup,
  ExactPriceOneVsOne,
  UpDownOneVsOne,
  Bullseye,
  UpDown,
  RealUpkeep,
  factory: any;
let deployer: HardhatEthersSigner;
if (fs.existsSync("./contracts.json")) {
  contracts = JSON.parse(fs.readFileSync("contracts.json", "utf8"));
} else {
  contracts = {};
}

async function deployTreasury() {
  factory = await ethers.getContractFactory("Treasury");
  if (
    contracts.Treasury?.address == undefined ||
    contracts.Treasury?.address == ""
  ) {
    Treasury = await upgrades.deployProxy(factory, [
      contracts.USDC.address,
      contracts.XyroToken.address,
    ]);
    contracts.Treasury = { address: "", url: "" };
    contracts.Treasury.address = Treasury.target;
    console.log("Treasury deployed");
  } else {
    console.log("Treasury already deployed skipping...");
  }
}

async function deployBullseye() {
  factory = await ethers.getContractFactory("Bullseye");
  if (
    contracts.Bullseye?.address == undefined ||
    contracts.Bullseye?.address == ""
  ) {
    Bullseye = await upgrades.deployProxy(factory, []);
    contracts.Bullseye = { address: "", url: "" };
    contracts.Bullseye.address = Bullseye.target;
    console.log("Bullseye deployed");
  } else {
    console.log("Bullseye already deployed skipping...");
  }
}

async function deployOneVsOneExactPrice() {
  factory = await ethers.getContractFactory("OneVsOneExactPrice");
  if (
    contracts.ExactPriceOneVsOne?.address == undefined ||
    contracts.ExactPriceOneVsOne?.address == ""
  ) {
    ExactPriceOneVsOne = await upgrades.deployProxy(factory, []);
    contracts.ExactPriceOneVsOne = { address: "", url: "" };
    contracts.ExactPriceOneVsOne.address = ExactPriceOneVsOne.target;
    console.log("ExactPriceOneVsOne deployed");
  } else {
    console.log("ExactPriceOneVsOne already deployed skipping...");
  }
}

async function deployOneVsOneUpDown() {
  factory = await ethers.getContractFactory("OneVsOneUpDown");
  if (
    contracts.UpDownOneVsOne?.address == undefined ||
    contracts.UpDownOneVsOne?.address == ""
  ) {
    UpDownOneVsOne = await upgrades.deployProxy(factory, []);
    contracts.UpDownOneVsOne = { address: "", url: "" };
    contracts.UpDownOneVsOne.address = UpDownOneVsOne.target;
    console.log("UpDownOneVsOne deployed");
  } else {
    console.log("UpDownOneVsOne already deployed skipping...");
  }
}

async function deployUpDown() {
  factory = await ethers.getContractFactory("UpDown");
  if (
    contracts.UpDown?.address == undefined ||
    contracts.UpDown?.address == ""
  ) {
    UpDown = await upgrades.deployProxy(factory, []);
    contracts.UpDown = { address: "", url: "" };
    contracts.UpDown.address = UpDown.target;
    console.log("UpDown deployed");
  } else {
    console.log("UpDown already deployed skipping...");
  }
}

async function deployUpkeep() {
  factory = await ethers.getContractFactory("ClientReportsVerifier");
  if (
    contracts.RealUpkeep?.address == undefined ||
    contracts.RealUpkeep?.address == ""
  ) {
    RealUpkeep = await upgrades.deployProxy(factory, []);
    contracts.RealUpkeep = { address: "", url: "" };
    contracts.RealUpkeep.address = RealUpkeep.target;
    console.log("RealUpkeep deployed");
  } else {
    console.log("RealUpkeep already deployed skipping...");
  }
}

async function deploySetup() {
  factory = await ethers.getContractFactory("Setup");
  if (contracts.Setup?.address == undefined || contracts.Setup?.address == "") {
    Setup = await upgrades.deployProxy(factory, [contracts.Treasury.address]);
    contracts.Setup = { address: "", url: "" };
    contracts.Setup.address = Setup.target;
    console.log("Setup deployed");
  } else {
    console.log("Setup already deployed skipping...");
  }
}

async function main() {
  [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  try {
    await deployTreasury();
    await deployOneVsOneExactPrice();
    await deployOneVsOneUpDown();
    await deploySetup();
    await deployBullseye();
    await deployUpDown();
    await deployUpkeep();
  } catch (e) {
    const json = JSON.stringify(contracts);
    fs.writeFileSync("./contracts.json", json);
  }

  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
  // process.exit();
}
main();
