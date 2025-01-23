import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
// DEV
// const GAME_MASTER = "0x7684e94E2903b113f7ec37d608C21F8EaA3c9E2e";
// const GAME_MASTER_2 = "0xD722d3e907928c70BFf17C5D8B74d329022Aeafc";
// const ADMIN = "0xa1E10d8822CCA44f6FD4Ee60Aa586eFee6AeD6c0";

// MAINNET
const GAME_MASTER = "0x9F2E0402F09f8F622acAE6005b4ebd3371F35Fe3";
const GAME_MASTER_2 = "0x9188D6C8034e45c20Cf938d3CaC758790776c143";
const ADMIN = "0xAC70849D13F76BFBc25FFcc03AcE05e09040169E";

async function setupTreasury(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Treasury",
    contracts.Treasury.address
  );
  const role = await contract.DISTRIBUTOR_ROLE();
  await wrapFnc([contracts.DataStreamsVerifier.address], contract.setUpkeep);
  await wrapFnc([role, contracts.Bullseye.address], contract.grantRole);
  await wrapFnc([role, contracts.BullseyeFee75.address], contract.grantRole);
  await wrapFnc([role, contracts.OneVsOne.address], contract.grantRole);
  await wrapFnc([role, contracts.UpDown.address], contract.grantRole);
  await wrapFnc([role, contracts.UpDownFee15.address], contract.grantRole);
  await wrapFnc([role, contracts.Setup.address], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupBullseye(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);
  await wrapFnc([1000], contract.setFee);

  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupBullseye75(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.BullseyeFee75.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);
  await wrapFnc([750], contract.setFee);

  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupUpDown(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDown.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);
  await wrapFnc([1000], contract.setFee);

  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupUpDownFee15(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDownFee15.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);
  await wrapFnc([1500], contract.setFee);

  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupExactPriceOneVsOne(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "OneVsOneExactPrice",
    contracts.OneVsOne.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);

  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupSetup(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt("Setup", contracts.Setup.address);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);

  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function main() {
  let [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);

  await setupTreasury(deployer);
  await setupSetup(deployer);
  await setupExactPriceOneVsOne(deployer);
  await setupBullseye(deployer);
  await setupBullseye75(deployer);
  await setupUpDown(deployer);
  await setupUpDownFee15(deployer);
}
main();
