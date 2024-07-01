import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Treasury__factory } from "../typechain-types/factories/contracts/Treasury.sol/Treasury__factory";
import { Setup2 } from "../typechain-types/contracts/Setup2";
import { Setup2__factory } from "../typechain-types/factories/contracts/Setup2__factory";
import { MockVerifierOptimized } from "../typechain-types/contracts/mock/MockVerifierOptimized";
import { MockVerifierOptimized__factory } from "../typechain-types/factories/contracts/mock/MockVerifierOptimized__factory";
import {
  abiEncodeInt192WithTimestamp,
  abiEncodeInt192WithTimestampOld,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const fifteenMinutes = 900;
const monthUnix = 2629743;
const highGameDuration = "Max game duration must be lower";
const lowGameDuration = "Min game duration must be higher";
const wrongStatus = "Wrong status!";
const gameClosed = "Game is closed for new players";
const isParticipating = "You are already in the game";
const oldReport = "Old chainlink report";
const cantEnd = "Can't end";

describe("Setup Game", () => {
  let owner: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: Setup2;
  let Upkeep: MockVerifierOptimized;
  let currentGameId: string;
  const tpPrice = parse18("2500");
  const slPrice = parse18("2000");
  const finalPriceTP = parse18("2600");
  const finalPriceSL = parse18("1900");
  const feedId =
    "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
  const assetPrice = parse18("2310");
  before(async () => {
    [owner, bob, alice] = await ethers.getSigners();

    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new Setup2__factory(owner).deploy(await Treasury.getAddress());
    Upkeep = await new MockVerifierOptimized__factory(owner).deploy();
    await Treasury.setFee(100);
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await USDT.mint(bob.address, parse18("1000"));
    await USDT.mint(alice.address, parse18("1000"));
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await Treasury.grantRole(
      await Treasury.DEFAULT_ADMIN_ROLE(),
      await Game.getAddress()
    );
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
  });

  it("should create SL setup game", async function () {
    let tx = await Game.createSetup(
      false,
      (await time.latest()) + fortyFiveMinutes,
      13000,
      10000,
      1,
      abiEncodeInt192WithTimestamp(
        assetPrice.toString(),
        1,
        await time.latest()
      )
    );
    const receipt = await tx.wait();
    // console.log(receipt?.logs[0]?.args[0][0]);
    currentGameId = receipt?.logs[0]?.args[0][0];
    let bet = await Game.decodeData(currentGameId);
    console.log(bet);

    // expect(bet.initiator).to.equal(owner.address);
    // expect(bet.gameStatus).to.equal(0);
  });

  it("should create SL bet", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(bob).play(false, 10, currentGameId);
    let bet = await Game.decodeData(currentGameId);
    console.log(bet);
    expect(bet.totalDepositsSL).to.equal(10);
  });

  // it("should create TP bet", async function () {
  //   await USDT.connect(alice).approve(
  //     await Treasury.getAddress(),
  //     ethers.MaxUint256
  //   );
  //   await Game.connect(alice).play(true, parse18("300"), currentGameId);
  //   let bet = await Game.games(currentGameId);
  //   expect(bet.totalDepositsTP).to.equal(parse18("300"));
  // });

  // it("should end setup game", async function () {
  //   let oldBalance = await USDT.balanceOf(bob.address);
  //   await time.increase(fortyFiveMinutes);
  //   await Game.finalizeGame(
  //     abiEncodeInt192WithTimestamp(
  //       finalPriceSL.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     currentGameId
  //   );
  //   let newBalance = await USDT.balanceOf(bob.address);
  //   expect(newBalance).to.be.above(oldBalance);
  // });

  // it("should create TP setup game", async function () {
  //   let tx = await Game.createSetup(
  //     false,
  //     (await time.latest()) + fortyFiveMinutes,
  //     tpPrice,
  //     slPrice,
  //     abiEncodeInt192WithTimestamp(
  //       finalPriceSL.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     feedId
  //   );
  //   const receipt = await tx.wait();
  //   currentGameId = receipt!.logs[0]!.args[0];
  //   let bet = await Game.games(currentGameId);
  //   expect(bet.initiator).to.equal(owner.address);
  //   expect(bet.gameStatus).to.equal(0);
  // });

  // it("should create SL game", async function () {
  //   await USDT.connect(bob).approve(
  //     await Treasury.getAddress(),
  //     ethers.MaxUint256
  //   );
  //   await Game.connect(bob).play(false, parse18("500"), currentGameId);
  //   let game = await Game.games(currentGameId);
  //   expect(game.totalDepositsSL).to.equal(parse18("500"));
  // });

  // it("should create TP game", async function () {
  //   await USDT.connect(alice).approve(
  //     await Treasury.getAddress(),
  //     ethers.MaxUint256
  //   );
  //   await Game.connect(alice).play(true, parse18("125"), currentGameId);
  //   let game = await Game.games(currentGameId);
  //   expect(game.totalDepositsTP).to.equal(parse18("125"));
  // });

  // it("should end setup game", async function () {
  //   let oldBalance = await USDT.balanceOf(bob.address);
  //   await time.increase(fortyFiveMinutes);
  //   await Game.finalizeGame(
  //     abiEncodeInt192WithTimestamp(
  //       finalPriceTP.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     currentGameId
  //   );
  //   let newBalance = await USDT.balanceOf(bob.address);
  //   expect(newBalance).to.be.above(oldBalance);
  // });

  // it("should fail - high game duration", async function () {
  //   await expect(
  //     Game.createSetup(
  //       true,
  //       (await time.latest()) + monthUnix * 12,
  //       tpPrice,
  //       slPrice,
  //       abiEncodeInt192WithTimestamp(
  //         assetPrice.toString(),
  //         feedId,
  //         await time.latest()
  //       ),
  //       feedId
  //     )
  //   ).to.be.revertedWith(highGameDuration);
  // });

  // it("should fail - low game duration", async function () {
  //   await expect(
  //     Game.createSetup(
  //       true,
  //       (await time.latest()) + fifteenMinutes,
  //       tpPrice,
  //       slPrice,
  //       abiEncodeInt192WithTimestamp(
  //         assetPrice.toString(),
  //         feedId,
  //         await time.latest()
  //       ),
  //       feedId
  //     )
  //   ).to.be.revertedWith(lowGameDuration);
  // });

  // it("should close setup game", async function () {
  //   let tx = await Game.createSetup(
  //     true,
  //     (await time.latest()) + fortyFiveMinutes,
  //     tpPrice,
  //     slPrice,
  //     abiEncodeInt192WithTimestamp(
  //       assetPrice.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     feedId
  //   );
  //   const receipt = await tx.wait();
  //   currentGameId = receipt!.logs[0]!.args[0];
  //   await time.increase(fortyFiveMinutes);
  //   await Game.closeGame(currentGameId);
  //   let game = await Game.games(currentGameId);
  //   expect(game.gameStatus).to.equal(1);
  // });

  // it("should change treasury", async function () {
  //   let temporaryTreasury = await new Treasury__factory(owner).deploy(
  //     await USDT.getAddress(),
  //     await XyroToken.getAddress()
  //   );
  //   await Game.setTreasury(await temporaryTreasury.getAddress());
  //   expect(await Game.treasury()).to.equal(
  //     await temporaryTreasury.getAddress()
  //   );
  //   //return treasury back
  //   await Game.setTreasury(await Treasury.getAddress());
  //   expect(await Game.treasury()).to.equal(await Treasury.getAddress());
  // });

  // it("should refund if only tp team count = 0", async function () {
  //   let oldAliceBalance = await USDT.balanceOf(alice);
  //   let oldOwnerBalance = await USDT.balanceOf(owner);
  //   let tx = await Game.createSetup(
  //     true,
  //     (await time.latest()) + fortyFiveMinutes,
  //     tpPrice,
  //     slPrice,
  //     abiEncodeInt192WithTimestamp(
  //       assetPrice.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     feedId
  //   );
  //   const receipt = await tx.wait();
  //   currentGameId = receipt!.logs[0]!.args[0];
  //   await Game.connect(alice).play(false, parse18("100"), currentGameId);
  //   await Game.connect(owner).play(false, parse18("100"), currentGameId);
  //   await Game.finalizeGame(
  //     abiEncodeInt192WithTimestamp(
  //       finalPriceTP.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     currentGameId
  //   );
  //   expect(oldAliceBalance).to.be.equal(await USDT.balanceOf(alice));
  //   expect(oldOwnerBalance).to.be.equal(await USDT.balanceOf(owner));
  // });

  // it("should fail - play wrong status", async function () {
  //   await expect(
  //     Game.play(true, parse18("100"), currentGameId)
  //   ).to.be.revertedWith(wrongStatus);
  // });

  // it("should play with permit", async function () {
  //   let oldTreasuryBalance = await USDT.balanceOf(await Treasury.getAddress());
  //   let tx = await Game.createSetup(
  //     true,
  //     (await time.latest()) + fortyFiveMinutes,
  //     tpPrice,
  //     slPrice,
  //     abiEncodeInt192WithTimestamp(
  //       assetPrice.toString(),
  //       feedId,
  //       await time.latest()
  //     ),
  //     feedId
  //   );
  //   const receipt = await tx.wait();
  //   currentGameId = receipt!.logs[0]!.args[0];
  //   const deadline = (await time.latest()) + fortyFiveMinutes;
  //   let ownerPermit = await getPermitSignature(
  //     owner,
  //     USDT,
  //     await Treasury.getAddress(),
  //     parse18("100"),
  //     BigInt(deadline)
  //   );
  //   let alicePermit = await getPermitSignature(
  //     alice,
  //     USDT,
  //     await Treasury.getAddress(),
  //     parse18("100"),
  //     BigInt(deadline)
  //   );
  //   await Game.playWithPermit(false, parse18("100"), currentGameId, {
  //     deadline: deadline,
  //     v: ownerPermit.v,
  //     r: ownerPermit.r,
  //     s: ownerPermit.s,
  //   });
  //   await Game.connect(alice).playWithPermit(
  //     true,
  //     parse18("100"),
  //     currentGameId,
  //     {
  //       deadline: deadline,
  //       v: alicePermit.v,
  //       r: alicePermit.r,
  //       s: alicePermit.s,
  //     }
  //   );
  //   let newTreasuryBalance = await USDT.balanceOf(await Treasury.getAddress());
  //   expect(newTreasuryBalance).to.be.above(oldTreasuryBalance);
  // });

  // it("should change min and max game duration", async function () {
  //   let min = await Game.minDuration();
  //   let max = await Game.maxDuration();

  //   //increase by 1 minute
  //   await Game.changeGameDuration(max + BigInt(60), min + BigInt(60));
  //   expect(await Game.minDuration()).to.equal(min + BigInt(60));
  //   expect(await Game.maxDuration()).to.equal(max + BigInt(60));
  // });
});
