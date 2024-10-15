import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const GAME_MASTER = "0x70C737C3bC41368E5744057bE53E4542724278c0";
const GAME_MASTER_2 = "0x5EbE1aF9BF0dD91BBc463FE30511C89D577bf3D5";
const GAME_MASTER_3 = "0x7684e94E2903b113f7ec37d608C21F8EaA3c9E2e";
const GAME_MASTER_4 = "0xD722d3e907928c70BFf17C5D8B74d329022Aeafc";
const ADMIN = "";
const ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

async function setupTreasury(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Treasury",
    contracts.Treasury.address
  );
  const role = await contract.DISTRIBUTOR_ROLE();
  await wrapFnc([contracts.RealUpkeep.address], contract.setUpkeep);
  await wrapFnc([role, contracts.Bullseye.address], contract.grantRole);
  await wrapFnc([role, contracts.OneVsOne.address], contract.grantRole);
  await wrapFnc([role, contracts.UpDown.address], contract.grantRole);
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
  await wrapFnc([gameMasterRole, GAME_MASTER_3], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_4], contract.grantRole);
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
  await wrapFnc([gameMasterRole, GAME_MASTER_3], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_4], contract.grantRole);
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
  await wrapFnc([gameMasterRole, GAME_MASTER_3], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_4], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function setupSetup(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt("Setup", contracts.Setup.address);
  const gameMasterRole = await contract.GAME_MASTER_ROLE();
  await wrapFnc([gameMasterRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_2], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_3], contract.grantRole);
  await wrapFnc([gameMasterRole, GAME_MASTER_4], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, ADMIN], contract.grantRole);
  await wrapFnc([ADMIN_ROLE, deployer.address], contract.renounceRole);
}

async function main() {
  let [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  await setupTreasury(deployer);
  await setupSetup(deployer);
  await setupBullseye(deployer);
  await setupExactPriceOneVsOne(deployer);
  await setupUpDown(deployer);
}
main();
