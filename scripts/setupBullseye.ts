import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";
const ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

async function setupRatesBullseye(deployer: HardhatEthersSigner) {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  await contract.setRate([5000, 3500, 1500], 2, false);
  await contract.setRate([5000, 3500, 1500], 6, false);
  await contract.setRate([5000, 3500, 1500], 6, true);
  await contract.setRate([5000, 3500, 1500], 11, false);
  await contract.setRate([5000, 3500, 1500], 11, true);

  await contract.setExactRange("1000000000000000000"); // 1e18
}

async function main() {
  await setupRatesBullseye();
}
main();
