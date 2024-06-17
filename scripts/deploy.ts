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
  Setup,
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
  RealUpkeep,
  FrontHelper,
  factory: any;
let deployer: HardhatEthersSigner;
if (fs.existsSync("./contracts.json")) {
  contracts = JSON.parse(fs.readFileSync("contracts.json", "utf8"));
} else {
  contracts = {};
}

async function deployUSDC() {
  factory = await ethers.getContractFactory("MockToken");
  if (contracts.USDC?.address == undefined || contracts.USDC?.address == "") {
    USDC = await wrapFnc([parse18((1e13).toString())], factory);
    contracts.USDC = { address: "", url: "" };
    contracts.USDC.address = USDC.target;
    console.log("MockUSDC deployed");
  } else {
    console.log("MockUSDC already deployed skipping...");
  }
}

async function deployFrontHelper() {
  factory = await ethers.getContractFactory("FrontHelper");
  if (
    contracts.FrontHelper?.address == undefined ||
    contracts.FrontHelper?.address == ""
  ) {
    FrontHelper = await wrapFnc([], factory);
    contracts.FrontHelper = { address: "", url: "" };
    contracts.FrontHelper.address = FrontHelper.target;
    console.log("FrontHelper deployed");
  } else {
    console.log("FrontHelper already deployed skipping...");
  }
}

async function deployXyroToken() {
  factory = await ethers.getContractFactory("XyroToken");
  if (
    contracts.XyroToken?.address == undefined ||
    contracts.XyroToken?.address == ""
  ) {
    XyroToken = await wrapFnc([parse18((1e8).toString())], factory);
    contracts.XyroToken = { address: "", url: "" };
    contracts.XyroToken.address = XyroToken.target;
    console.log("XyroToken deployed");
  } else {
    console.log("XyroToken already deployed skipping...");
  }
}

async function deployTreasury() {
  factory = await ethers.getContractFactory("Treasury");
  if (
    contracts.Treasury?.address == undefined ||
    contracts.Treasury?.address == ""
  ) {
    Treasury = await wrapFnc(
      [contracts.USDC.address, contracts.XyroToken.address],
      factory
    );
    contracts.Treasury = { address: "", url: "" };
    contracts.Treasury.address = Treasury.target;
    console.log("Treasury deployed");
  } else {
    console.log("Treasury already deployed skipping...");
  }
}

async function deployVesting() {
  factory = await ethers.getContractFactory("XyroVesting");
  if (
    contracts.Vesting?.address == undefined ||
    contracts.Vesting?.address == ""
  ) {
    Vesting = await wrapFnc(
      [], // parameters needed
      factory
    );
    contracts.Vesting = { address: "", url: "" };
    contracts.Vesting.address = Vesting.target;
    console.log("Vesting deployed");
  } else {
    console.log("Vesting already deployed skipping...");
  }
}

async function deployStaking() {
  factory = await ethers.getContractFactory("XyroStaking");
  if (
    contracts.Staking?.address == undefined ||
    contracts.Staking?.address == ""
  ) {
    Staking = await wrapFnc(
      [contracts.XyroToken.address, contracts.GovernanceToken.address], // parameters needed
      factory
    );
    contracts.Staking = { address: "", url: "" };
    contracts.Staking.address = Staking.target;
    console.log("Staking deployed");
  } else {
    console.log("Staking already deployed skipping...");
  }
}

async function deploySetupsFactory() {
  factory = await ethers.getContractFactory("SetupsFactory");
  if (
    contracts.SetupsFactory?.address == undefined ||
    contracts.SetupsFactory?.address == ""
  ) {
    SetupsFactory = await wrapFnc([contracts.Treasury.address], factory);
    contracts.SetupsFactory = { address: "", url: "" };
    contracts.SetupsFactory.address = SetupsFactory.target;
    console.log("SetupsFactory deployed");
  } else {
    console.log("SetupsFactory already deployed skipping...");
  }
}

async function deployBullseye() {
  factory = await ethers.getContractFactory("Bullseye");
  if (
    contracts.Bullseye?.address == undefined ||
    contracts.Bullseye?.address == ""
  ) {
    Bullseye = await wrapFnc([], factory);
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
    ExactPriceOneVsOne = await wrapFnc([], factory);
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
    UpDownOneVsOne = await wrapFnc([], factory);
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
    UpDown = await wrapFnc([], factory);
    contracts.UpDown = { address: "", url: "" };
    contracts.UpDown.address = UpDown.target;
    console.log("UpDown deployed");
  } else {
    console.log("UpDown already deployed skipping...");
  }
}

async function deployGovernanceToken() {
  factory = await ethers.getContractFactory("XyroGovernanceToken");
  if (
    contracts.GovernanceToken?.address == undefined ||
    contracts.GovernanceToken?.address == ""
  ) {
    GovernanceToken = await wrapFnc([], factory);
    contracts.GovernanceToken = { address: "", url: "" };
    contracts.GovernanceToken.address = GovernanceToken.target;
    console.log("GovernanceToken deployed");
  } else {
    console.log("GovernanceToken already deployed skipping...");
  }
}

async function deployTimeLock(deployer: HardhatEthersSigner) {
  factory = await ethers.getContractFactory("TimeLock");
  if (
    contracts.TimeLock?.address == undefined ||
    contracts.TimeLock?.address == ""
  ) {
    TimeLock = await wrapFnc([1, [], [], deployer], factory);
    contracts.TimeLock = { address: "", url: "" };
    contracts.TimeLock.address = TimeLock.target;
    console.log("TimeLock deployed");
  } else {
    console.log("TimeLock already deployed skipping...");
  }
}

async function deployMockUpkeep() {
  factory = await ethers.getContractFactory("MockUpkeep");
  if (
    contracts.MockUpkeep?.address == undefined ||
    contracts.MockUpkeep?.address == ""
  ) {
    MockUpkeep = await wrapFnc([], factory);
    contracts.MockUpkeep = { address: "", url: "" };
    contracts.MockUpkeep.address = MockUpkeep.target;
    console.log("MockUpkeep deployed");
  } else {
    console.log("MockUpkeep already deployed skipping...");
  }
}

async function deployUpkeep() {
  factory = await ethers.getContractFactory("ClientReportsVerifier");
  if (
    contracts.RealUpkeep?.address == undefined ||
    contracts.RealUpkeep?.address == ""
  ) {
    RealUpkeep = await wrapFnc([], factory);
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
    Setup = await wrapFnc([contracts.Treasury.address], factory);
    contracts.Setup = { address: "", url: "" };
    contracts.Setup.address = Setup.target;
    console.log("Setup deployed");
  } else {
    console.log("Setup already deployed skipping...");
  }
}

async function deployDAO() {
  factory = await ethers.getContractFactory("XyroGovernorContract");
  if (contracts.DAO?.address == undefined || contracts.DAO?.address == "") {
    DAO = await wrapFnc(
      [contracts.GovernanceToken.address, contracts.TimeLock.address, 60, 3, 2],
      factory
    );
    contracts.DAO = { address: "", url: "" };
    contracts.DAO.address = DAO.target;
    console.log("DAO deployed");
  } else {
    console.log("DAO already deployed skipping...");
  }
}

async function main() {
  [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  try {
    // await deployGovernanceToken();
    // await deployTimeLock(deployer);
    // await deployDAO();
    await deployUSDC();
    await deployXyroToken();
    await deployTreasury();
    // await deployStaking();
    await deployOneVsOneExactPrice();
    await deployOneVsOneUpDown();
    await deploySetup();
    // await deploySetupsFactory();
    await deployBullseye();
    // await deployMockUpkeep();
    // await deployFrontHelper();
    await deployUpDown();
    // await deployUpkeep();
  } catch (e) {
    const json = JSON.stringify(contracts);
    fs.writeFileSync("./contracts.json", json);
  }

  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
  // process.exit();
}
main();
