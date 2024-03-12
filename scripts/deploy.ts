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
  GameFactory,
  ExactPrice,
  UpDown,
  BullseyeGame,
  factory: any;
let deployer: HardhatEthersSigner;
if (fs.existsSync("./contracts.json")) {
  contracts = JSON.parse(fs.readFileSync("contracts.json", "utf8"));
  console.log(contracts);
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

async function deployXyroToken() {
  factory = await ethers.getContractFactory("XyroToken");
  if (
    contracts.XyroToken?.address == undefined ||
    contracts.XyroToken?.address == ""
  ) {
    XyroToken = await wrapFnc([parse18((1e13).toString())], factory);
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
      [], // parameters needed
      factory
    );
    contracts.Staking = { address: "", url: "" };
    contracts.Staking.address = Staking.target;
    console.log("Staking deployed");
  } else {
    console.log("Staking already deployed skipping...");
  }
}

async function deployGameFactory() {
  factory = await ethers.getContractFactory("GameFactory");
  if (
    contracts.GameFactory?.address == undefined ||
    contracts.GameFactory?.address == ""
  ) {
    GameFactory = await wrapFnc([contracts.Treasury.address], factory);
    contracts.GameFactory = { address: "", url: "" };
    contracts.GameFactory.address = GameFactory.target;
    console.log("GameFactory deployed");
  } else {
    console.log("GameFactory already deployed skipping...");
  }
}

async function deployBullseye() {
  factory = await ethers.getContractFactory("BullseyeGame");
  if (
    contracts.BullseyeGame?.address == undefined ||
    contracts.BullseyeGame?.address == ""
  ) {
    BullseyeGame = await wrapFnc([contracts.Treasury.address], factory);
    contracts.BullseyeGame = { address: "", url: "" };
    contracts.BullseyeGame.address = BullseyeGame.target;
    console.log("BullseyeGame deployed");
  } else {
    console.log("BullseyeGame already deployed skipping...");
  }
}

async function deployExactPriceStandalone() {
  factory = await ethers.getContractFactory("ExactPriceStandalone");
  if (
    contracts.ExactPrice?.address == undefined ||
    contracts.ExactPrice?.address == ""
  ) {
    ExactPrice = await wrapFnc([], factory);
    await wrapFnc([contracts.Treasury.address], ExactPrice.setTreasury);
    contracts.ExactPrice = { address: "", url: "" };
    contracts.ExactPrice.address = ExactPrice.target;
    console.log("ExactPrice deployed");
  } else {
    console.log("ExactPrice already deployed skipping...");
  }
}

async function deployUpDownStandalone() {
  factory = await ethers.getContractFactory("UpDownStandalone");
  if (
    contracts.UpDown?.address == undefined ||
    contracts.UpDown?.address == ""
  ) {
    UpDown = await wrapFnc([], factory);
    await wrapFnc([contracts.Treasury.address], UpDown.setTreasury);
    contracts.UpDown = { address: "", url: "" };
    contracts.UpDown.address = UpDown.target;
    console.log("UpDown deployed");
  } else {
    console.log("UpDown already deployed skipping...");
  }
}

async function main() {
  [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  await deployUSDC();
  await deployXyroToken();
  await deployTreasury();
  await deployExactPriceStandalone();
  await deployUpDownStandalone();
  await deployGameFactory();
  await deployBullseye();
  const json = JSON.stringify(contracts);
  fs.writeFileSync("./contracts.json", json);
}
main();
