import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";

async function main() {
  let [deployer] = await ethers.getSigners();
  const feedIds = [
    "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439",
    "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782",
    "0x000387d7c042a9d5c97c15354b531bd01bf6d3a351e190f2394403cf2f79bde9",
    "0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265",
    "0x0003c915006ba88731510bb995c190e80b5c9cfe8cd8a19aaf00e0ed61d0b3bc",
    "0x0003d64b0bdb0046a65e4ebb0a9866215044634524673c65bff4096a197fcff5",
    "0x0003d338ea2ac3be9e026033b1aa601673c37bab5e13851c59966f9f820754d6",
    "0x00032b6edb94b883e95693b8fdae3deeedab2c48dd699cafa43a8d134d344813",
    "0x00035e3ddda6345c3c8ce45639d4449451f1d5828d7a70845e446f04905937cd",
  ];
  console.log("Deployer = ", deployer.address);
  const contract = await ethers.getContractAt(
    "DataStreamsVerifier",
    contracts.RealUpkeep.address
  );
  await contract.setfeedNumberBatch(feedIds);
}
main();
