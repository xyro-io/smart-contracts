import contracts from "../contracts.json";
import { ethers } from "hardhat";
import { wrapFnc } from "./helper";
const ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

async function main() {
  let [deployer] = await ethers.getSigners();
  //testnet
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
  //mainnet
  // const feedIds = [
  //   "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8",
  //   "0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9",
  //   "0x000335fd3f3ffa06cfd9297b97367f77145d7a5f132e84c736cc471dd98621fe",
  //   "0x00036d7a1251e3f67d6658466b5e9e7fe8418af7feac9567ff322bff95cc2401",
  //   "0x00033a4f1021830ac0e7b7a03f70ed56fecb0ac2a10c8ea5328c240c847b71f3",
  //   "0x00036e9386eda6b177c6f7e9d493e60ae9ebaeb732a271b880b4d6a131d6b3f5",
  //   "0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f",
  //   "0x000367a3674cdd7cc83dbbd7d19f3768b9d1329586e82e32a1bf388fc5ffd0eb",
  //   "0x0003c16c6aed42294f5cb4741f6e59ba2d728f0eae2eb9e6d3f555808c59fc45",
  // ];
  console.log("Deployer = ", deployer.address);
  const contract = await ethers.getContractAt(
    "DataStreamsVerifier",
    contracts.RealUpkeep.address
  );

  await wrapFnc([feedIds], contract.setfeedNumberBatch);

  await wrapFnc([ADMIN_ROLE, contracts.Bullseye.address], contract.grantRole);

  await wrapFnc([ADMIN_ROLE, contracts.OneVsOne.address], contract.grantRole);

  await wrapFnc([ADMIN_ROLE, contracts.Setup.address], contract.grantRole);

  await wrapFnc([ADMIN_ROLE, contracts.UpDown.address], contract.grantRole);
}
main();
