import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";

async function getRatesBullseye(contract: any) {
  const index1 = await contract.getRateIndex(2, false);
  const index2 = await contract.getRateIndex(6, false);
  const index3 = await contract.getRateIndex(6, true);
  const index4 = await contract.getRateIndex(11, false);
  const index5 = await contract.getRateIndex(11, true);

  console.log([index1, index2, index3, index4, index5]);

  for (let idx = 0; idx < 5; idx++) {
    const rate1 = await contract.rates(idx, 0);
    const rate2 = await contract.rates(idx, 1);
    const rate3 = await contract.rates(idx, 2);

    console.log({ idx, rate1, rate2, rate3 });
  }
}

async function getRatesBullseye10() {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );

  return getRatesBullseye(contract);
}

async function getRatesBullseye75() {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.BullseyeFee75.address
  );

  return getRatesBullseye(contract);
}

async function getRatesBullseye5() {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.BullseyeFee5.address
  );

  return getRatesBullseye(contract);
}

async function setupRatesBullseye10(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );

  await wrapFnc([[5000, 3500, 1500], 2, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 6, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 6, true], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 11, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 11, true], contract.setRate);

  await wrapFnc(["1000000000000000000"], contract.setExactRange); // 1e18
}

async function setupRatesBullseye75(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.BullseyeFee75.address
  );

  await wrapFnc([[5000, 3500, 1500], 2, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 6, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 6, true], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 11, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 11, true], contract.setRate);

  await wrapFnc(["1000000000000000000"], contract.setExactRange); // 1e18
}

async function setupRatesBullseye5(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.BullseyeFee5.address
  );

  await wrapFnc([[5000, 3500, 1500], 2, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 6, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 6, true], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 11, false], contract.setRate);
  await wrapFnc([[5000, 3500, 1500], 11, true], contract.setRate);

  await wrapFnc(["1000000000000000000"], contract.setExactRange); // 1e18
}

async function main() {
  let [deployer] = await ethers.getSigners();

  await getRatesBullseye10();
  await setupRatesBullseye10(deployer);

  await getRatesBullseye75();
  await setupRatesBullseye75(deployer);

  await getRatesBullseye5();
  await setupRatesBullseye5(deployer);
  await getRatesBullseye5();
}
main();
