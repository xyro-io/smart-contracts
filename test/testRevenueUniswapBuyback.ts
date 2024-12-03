// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { timeout } from "../scripts/helper";
// const parse18 = ethers.parseEther;

// describe("RevenueBank buyback and burn test onchain (eth.sepolia)", () => {
//   let Bank: any;
//   let XyroToken: any;
//   let USDT: any;
//   let owner: HardhatEthersSigner;
//   before(async () => {
//     [owner] = await ethers.getSigners();
//     console.log("Deployer = ", owner.address);
//     let factory = await ethers.getContractFactory("XyroTokenERC677");

//     XyroToken = await factory.attach(
//       "0x17c0f1D18FbD7F95e0C277c07A0942D05AAf1E73"
//     );

//     factory = await ethers.getContractFactory("MockToken");
//     USDT = await factory.attach("0xA05A79907645B1C04DcBC51B760F2f2f16bBa9bF");

//     Bank = await ethers.deployContract("RevenueBank", [
//       "0xA05A79907645B1C04DcBC51B760F2f2f16bBa9bF",
//       "0x17c0f1D18FbD7F95e0C277c07A0942D05AAf1E73",
//       ethers.ZeroAddress,
//     ]);
//     await timeout(20000);
//     // factory = await ethers.getContractFactory("RevenueBank");
//     // Bank = factory.attach("0x89a1A6c54C52A199Bd4a2e2A079398BEb9131646");
//     console.log("Bank address = ", await Bank.getAddress());
//     await XyroToken.grantBurnRole(await Bank.getAddress());
//     const ACCOUNTANT_ROLE = await Bank.ACCOUNTANT_ROLE();
//     await Bank.grantRole(ACCOUNTANT_ROLE, owner.address);
//     await USDT.mint(await Bank.getAddress(), parse18("10"));
//   });

//   it("should buyback and burn Xyro tokens", async function () {
//     const amountToSwap = parse18("10");
//     const pairFee = 3000;
//     const swapRouter = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
//     let tx = await Bank.buybackAndBurn(amountToSwap, pairFee, swapRouter);
//     console.log("buybackAndBurn tx = ", tx.hash);
//   });
// });
