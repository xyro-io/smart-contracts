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
  USDC,
  XyroToken,
  Treasury,
  Vesting,
  Setup,
  Staking,
  OneVsOne,
  Bullseye,
  BullseyeFee75,
  GovernanceToken,
  TimeLock,
  MockVerifier,
  DAO,
  UpDown,
  UpDownFee15,
  RealUpkeep,
  FrontHelper,
  RevenueBank,
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
  factory = await ethers.getContractFactory("XyroTokenERC677");
  if (
    contracts.XyroToken?.address == undefined ||
    contracts.XyroToken?.address == ""
  ) {
    XyroToken = await wrapFnc([0], factory);
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
    const factory = await ethers.getContractFactory("Treasury");
    Treasury = await upgrades.deployProxy(
      factory,
      [contracts.USDC.address, contracts.XyroToken.address],
      {
        initializer: "initialize",
      }
    );
    await Treasury.waitForDeployment();
    contracts.Treasury = { address: "", url: "" };
    contracts.Treasury.address = await Treasury.getAddress();
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

async function deployBullseyeFee75() {
  factory = await ethers.getContractFactory("Bullseye");
  if (
    contracts.BullseyeFee75?.address == undefined ||
    contracts.BullseyeFee75?.address == ""
  ) {
    BullseyeFee75 = await wrapFnc([], factory);
    contracts.BullseyeFee75 = { address: "", url: "" };
    contracts.BullseyeFee75.address = BullseyeFee75.target;
    console.log("BullseyeFee75 deployed");
  } else {
    console.log("BullseyeFee75 already deployed skipping...");
  }
}

async function deployOneVsOneExactPrice() {
  factory = await ethers.getContractFactory("OneVsOneExactPrice");
  if (
    contracts.OneVsOne?.address == undefined ||
    contracts.OneVsOne?.address == ""
  ) {
    OneVsOne = await wrapFnc([], factory);
    contracts.OneVsOne = { address: "", url: "" };
    contracts.OneVsOne.address = OneVsOne.target;
    console.log("OneVsOne deployed");
  } else {
    console.log("OneVsOne already deployed skipping...");
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
async function deployUpDownFee15() {
  factory = await ethers.getContractFactory("UpDown");
  if (
    contracts.UpDownFee15?.address == undefined ||
    contracts.UpDownFee15?.address == ""
  ) {
    UpDownFee15 = await wrapFnc([], factory);
    contracts.UpDownFee15 = { address: "", url: "" };
    contracts.UpDownFee15.address = UpDownFee15.target;
    console.log("UpDownFee15 deployed");
  } else {
    console.log("UpDownFee15 already deployed skipping...");
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
    TimeLock = await wrapFnc([100, [deployer], [deployer], deployer], factory);
    contracts.TimeLock = { address: "", url: "" };
    contracts.TimeLock.address = TimeLock.target;
    console.log("TimeLock deployed");
  } else {
    console.log("TimeLock already deployed skipping...");
  }
}

async function deployMockVerifier() {
  factory = await ethers.getContractFactory("MockVerifier");
  if (
    contracts.MockVerifier?.address == undefined ||
    contracts.MockVerifier?.address == ""
  ) {
    MockVerifier = await wrapFnc([], factory);
    contracts.MockVerifier = { address: "", url: "" };
    contracts.MockVerifier.address = MockVerifier.target;
    console.log("MockVerifier deployed");
  } else {
    console.log("MockVerifier already deployed skipping...");
  }
}

async function deployVerifier(verifier: string) {
  factory = await ethers.getContractFactory("DataStreamsVerifier");
  if (
    contracts.RealUpkeep?.address == undefined ||
    contracts.RealUpkeep?.address == ""
  ) {
    //Arb sepolia upkeep
    RealUpkeep = await wrapFnc([verifier], factory);
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

async function deployBank() {
  factory = await ethers.getContractFactory("RevenueBank");
  if (
    contracts.RevenueBank?.address == undefined ||
    contracts.RevenueBank?.address == ""
  ) {
    RevenueBank = await wrapFnc(
      [
        contracts.USDC.address,
        contracts.XyroToken.address,
        contracts.Treasury.address,
        "0x59D74185D879b63e8543073fFA73cD5a12Fc4104",
        "0x101F443B4d1b059569D643917553c771E1b9663E",
      ],
      factory
    );
    contracts.RevenueBank = { address: "", url: "" };
    contracts.RevenueBank.address = RevenueBank.target;
    console.log("RevenueBank deployed");
  } else {
    console.log("RevenueBank already deployed skipping...");
  }
}

async function deployTokenOwner() {
  factory = await ethers.getContractFactory("TokenOwner");
  let TokenOwner = await wrapFnc([""], factory);
  console.log(`Token owner deployed ${TokenOwner.target}`);
}

async function main() {
  [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  try {
    await deployTokenOwner();
    await deployGovernanceToken();
    await deployTimeLock(deployer);
    await deployDAO();
    await deployUSDC();
    await deployXyroToken();
    await deployTreasury();
    await deployStaking();
    await deployOneVsOneExactPrice();
    await deploySetup();
    await deployBullseye();
    await deployBullseyeFee75();
    await deployMockVerifier();
    await deployFrontHelper();
    await deployUpDown();
    await deployUpDownFee15();
    await deployBank();
    const mainnetVerifierAdr = "0x478Aa2aC9F6D65F84e09D9185d126c3a17c2a93C";
    const testnetVerifierAdr = "0x2ff010DEbC1297f19579B4246cad07bd24F2488A";
    // await deployVerifier(testnetVerifierAdr);
  } catch (e) {
    const json = JSON.stringify(contracts);
    fs.writeFileSync("./contracts.json", json);
  }

  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
}
main();
