import { wrapFnc } from "./helper";
import { ethers } from "hardhat";

const parse18 = ethers.parseEther;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer = ", deployer.address);
  const factory = await ethers.getContractFactory("XyroToken");
  let XyroToken = await wrapFnc([parse18((1e9).toString())], factory);
  console.log("XyroToken deployed = ", XyroToken.target);
}
main();
