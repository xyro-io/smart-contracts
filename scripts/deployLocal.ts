import { wrapFnc } from "./helper";
import { ethers } from "hardhat";
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
  USDC,
  XyroToken,
  Treasury,
  Vesting,
  Staking,
  SetupsFactory,
  ExactPriceOneVsOne,
  UpDownOneVsOne,
  Bullseye,
  GovernanceToken,
  TimeLock,
  MockUpkeep,
  DAO,
  UpDown,
  factory: any;
let deployer: HardhatEthersSigner;
contracts = {};

async function deployUSDC() {
  factory = await ethers.getContractFactory("MockToken");
  USDC = await wrapFnc([parse18((1e13).toString())], factory);
  contracts.USDC = { address: "", url: "" };
  contracts.USDC.address = USDC.target;
  console.log("MockUSDC deployed");
}

async function deployXyroToken() {
  factory = await ethers.getContractFactory("XyroToken");
  XyroToken = await wrapFnc([parse18((1e8).toString())], factory);
  contracts.XyroToken = { address: "", url: "" };
  contracts.XyroToken.address = XyroToken.target;
  console.log("XyroToken deployed");
}

async function deployTreasury() {
  factory = await ethers.getContractFactory("Treasury");
  Treasury = await wrapFnc(
    [contracts.USDC.address, contracts.XyroToken.address],
    factory
  );
  contracts.Treasury = { address: "", url: "" };
  contracts.Treasury.address = Treasury.target;
  console.log("Treasury deployed");
}

async function deployVesting() {
  factory = await ethers.getContractFactory("XyroVesting");
  Vesting = await wrapFnc(
    [], // parameters needed
    factory
  );
  contracts.Vesting = { address: "", url: "" };
  contracts.Vesting.address = Vesting.target;
  console.log("Vesting deployed");
}

async function deployStaking() {
  factory = await ethers.getContractFactory("XyroStaking");
  Staking = await wrapFnc(
    [contracts.XyroToken.address, contracts.GovernanceToken.address], // parameters needed
    factory
  );
  contracts.Staking = { address: "", url: "" };
  contracts.Staking.address = Staking.target;
  console.log("Staking deployed");
}

async function deploySetupsFactory() {
  factory = await ethers.getContractFactory("SetupsFactory");
  SetupsFactory = await wrapFnc([contracts.Treasury.address], factory);
  contracts.SetupsFactory = { address: "", url: "" };
  contracts.SetupsFactory.address = SetupsFactory.target;
  console.log("SetupsFactory deployed");
}

async function deployBullseye() {
  factory = await ethers.getContractFactory("Bullseye");
  Bullseye = await wrapFnc([], factory);
  contracts.Bullseye = { address: "", url: "" };
  contracts.Bullseye.address = Bullseye.target;
  console.log("Bullseye deployed");
}

async function deployOneVsOneExactPrice() {
  factory = await ethers.getContractFactory("OneVsOneExactPrice");
  ExactPriceOneVsOne = await wrapFnc([], factory);
  contracts.ExactPriceOneVsOne = { address: "", url: "" };
  contracts.ExactPriceOneVsOne.address = ExactPriceOneVsOne.target;
  console.log("ExactPriceOneVsOne deployed");
}

async function deployOneVsOneUpDown() {
  factory = await ethers.getContractFactory("OneVsOneUpDown");
  UpDownOneVsOne = await wrapFnc([], factory);
  contracts.UpDownOneVsOne = { address: "", url: "" };
  contracts.UpDownOneVsOne.address = UpDownOneVsOne.target;
  console.log("UpDownOneVsOne deployed");
}

async function deployUpDown() {
  factory = await ethers.getContractFactory("UpDown");
  UpDown = await wrapFnc([], factory);
  contracts.UpDown = { address: "", url: "" };
  contracts.UpDown.address = UpDown.target;
  console.log("UpDown deployed");
}

async function deployGovernanceToken() {
  factory = await ethers.getContractFactory("XyroGovernanceToken");
  GovernanceToken = await wrapFnc([], factory);
  contracts.GovernanceToken = { address: "", url: "" };
  contracts.GovernanceToken.address = GovernanceToken.target;
  console.log("GovernanceToken deployed");
}

async function deployTimeLock(deployer: HardhatEthersSigner) {
  factory = await ethers.getContractFactory("TimeLock");
  TimeLock = await wrapFnc([1, [], [], deployer], factory);
  contracts.TimeLock = { address: "", url: "" };
  contracts.TimeLock.address = TimeLock.target;
  console.log("TimeLock deployed");
}

async function deployUpkeep() {
  factory = await ethers.getContractFactory("MockUpkeep");
  MockUpkeep = await wrapFnc([], factory);
  contracts.MockUpkeep = { address: "", url: "" };
  contracts.MockUpkeep.address = MockUpkeep.target;
  console.log("MockUpkeep deployed");
}

async function deployDAO() {
  factory = await ethers.getContractFactory("XyroGovernorContract");
  DAO = await wrapFnc(
    [contracts.GovernanceToken.address, contracts.TimeLock.address, 60, 3, 2],
    factory
  );
  contracts.DAO = { address: "", url: "" };
  contracts.DAO.address = DAO.target;
  console.log("DAO deployed");
}

async function main() {
  [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  try {
    await deployGovernanceToken();
    await deployTimeLock(deployer);
    await deployDAO();
    await deployUSDC();
    await deployXyroToken();
    await deployTreasury();
    await deployStaking();
    await deployOneVsOneExactPrice();
    await deployOneVsOneUpDown();
    await deploySetupsFactory();
    await deployBullseye();
    await deployUpkeep();
    await deployUpDown();
  } catch (e) {
    const json = JSON.stringify(contracts);
    fs.writeFileSync("./contracts.json", json);
  }

  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
}
main();
