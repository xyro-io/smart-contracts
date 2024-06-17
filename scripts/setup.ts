import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";

const GAME_MASTER = "0x7684e94E2903b113f7ec37d608C21F8EaA3c9E2e";
const GAME_MASTER_2 = "0xD722d3e907928c70BFf17C5D8B74d329022Aeafc";

async function setupTreasury() {
  const contract = await ethers.getContractAt(
    "Treasury",
    contracts.Treasury.address
  );
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
  await wrapFnc(
    [defaultAdminRole, contracts.SetupsFactory.address],
    contract.grantRole
  );
  await wrapFnc([defaultAdminRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([defaultAdminRole, GAME_MASTER_2], contract.grantRole);
  const role = await contract.DISTRIBUTOR_ROLE();
  await wrapFnc([contracts.RealUpkeep.address], contract.setUpkeep);
  await wrapFnc([role, contracts.Bullseye.address], contract.grantRole);
  await wrapFnc(
    [role, contracts.ExactPriceOneVsOne.address],
    contract.grantRole
  );
  await wrapFnc([role, contracts.UpDownOneVsOne.address], contract.grantRole);
  await wrapFnc([role, contracts.UpDown.address], contract.grantRole);
  await wrapFnc([role, contracts.Setup.address], contract.grantRole);
}

async function setupBullseye() {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
  await wrapFnc([defaultAdminRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([defaultAdminRole, GAME_MASTER_2], contract.grantRole);
}

async function setupUpDownOneVsOne() {
  const contract = await ethers.getContractAt(
    "OneVsOneUpDown",
    contracts.UpDownOneVsOne.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
  await wrapFnc([defaultAdminRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([defaultAdminRole, GAME_MASTER_2], contract.grantRole);
}

async function setupUpDown() {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDown.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
  await wrapFnc([defaultAdminRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([defaultAdminRole, GAME_MASTER_2], contract.grantRole);
}

async function setupExactPriceOneVsOne() {
  const contract = await ethers.getContractAt(
    "OneVsOneExactPrice",
    contracts.ExactPriceOneVsOne.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
  await wrapFnc([defaultAdminRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([defaultAdminRole, GAME_MASTER_2], contract.grantRole);
}

async function setupSetup() {
  const contract = await ethers.getContractAt("Setup", contracts.Setup.address);
  const defaultAdminRole = await contract.DEFAULT_ADMIN_ROLE();
  await wrapFnc([defaultAdminRole, GAME_MASTER], contract.grantRole);
  await wrapFnc([defaultAdminRole, GAME_MASTER_2], contract.grantRole);
}

async function main() {
  let [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  await setupTreasury();
  await setupSetup();
  await setupBullseye();
  await setupExactPriceOneVsOne();
  await setupUpDown();
  await setupUpDownOneVsOne();
}
main();
