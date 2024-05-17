import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";

async function setupTreasury() {
  const contract = await ethers.getContractAt(
    "Treasury",
    contracts.Treasury.address
  );
  const role = await contract.DISTRIBUTOR_ROLE();
  await wrapFnc([contracts.MockUpkeep.address], contract.setUpkeep);
  await wrapFnc([role, contracts.BullseyeGame.address], contract.grantRole);
  await wrapFnc(
    [role, contracts.ExactPriceOneVsOne.address],
    contract.grantRole
  );
  await wrapFnc([role, contracts.UpDownOneVsOne.address], contract.grantRole);
  await wrapFnc([role, contracts.UpDown.address], contract.grantRole);
}

async function setupBullseye() {
  const contract = await ethers.getContractAt(
    "BullseyeGame",
    contracts.BullseyeGame.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
}

async function setupUpDownOneVsOne() {
  const contract = await ethers.getContractAt(
    "OneVsOneUpDown",
    contracts.UpDownOneVsOne.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
}

async function setupUpDown() {
  const contract = await ethers.getContractAt(
    "UpDownGame",
    contracts.UpDown.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
}

async function setupExactPriceOneVsOne() {
  const contract = await ethers.getContractAt(
    "OneVsOneExactPrice",
    contracts.ExactPriceOneVsOne.address
  );
  await wrapFnc([contracts.Treasury.address], contract.setTreasury);
}

async function main() {
  let [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  await setupTreasury();
  await setupBullseye();
  await setupExactPriceOneVsOne();
  await setupUpDown();
  await setupUpDownOneVsOne();
}
main();
