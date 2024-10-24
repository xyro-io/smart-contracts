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
import { Setup } from "../typechain-types/contracts/Setup";
import { Setup__factory } from "../typechain-types/factories/contracts/Setup__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import {
  abiEncodeInt192WithTimestamp,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const fifteenMinutes = 900;
const monthUnix = 2629743;
const highGameDuration = "Max game duration must be lower";
const lowGameDuration = "Min game duration must be higher";
const wrongPrice = "Wrong tp or sl price";
const wrongStatus = "Wrong status!";
const gameClosed = "Game is closed for new players";
const isParticipating = "You are already in the game";
const dontExist = "Game doesn't exist";
const cantEnd = "Can't end";
const youLost = "You lost";
const requireSufficentDepositAmount = "Insufficent deposit amount";
const Status = {
  Created: 0,
  Cancelled: 1,
  Finished: 2,
};

describe("Setup Game", () => {
  let owner: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let harry: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: Setup;
  let Upkeep: MockVerifier;
  let currentGameId: string;
  let receipt: any;
  const tpPrice = 650000000;
  const slPrice = 620000000;
  const usdtAmount = 100;
  const finalPriceTP = parse18("66000");
  const finalPriceSL = parse18("61000");
  const feedNumber = 1;
  const assetPrice = parse18("62500");
  before(async () => {
    [owner, bob, alice, harry] = await ethers.getSigners();

    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("12600001"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress()
    );
    Game = await new Setup__factory(owner).deploy(await Treasury.getAddress());
    Upkeep = await new MockVerifier__factory(owner).deploy();

    await Treasury.setUpkeep(await Upkeep.getAddress());
    await USDT.mint(bob.address, parse18("1000"));
    await USDT.mint(alice.address, parse18("1000"));
    await USDT.mint(harry.address, parse18("1000"));
    await Game.grantRole(await Game.GAME_MASTER_ROLE(), owner.address);
    await XyroToken.transfer(bob.address, parse18("1260000"));

    await Treasury.grantRole(
      await Treasury.DEFAULT_ADMIN_ROLE(),
      await Game.getAddress()
    );
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );

    await USDT.connect(harry).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
  });

  describe("Create game", async function () {
    it("should create SL setup game", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = false;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      let game = await Game.decodeData(currentGameId);

      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.stopLossPrice).to.be.equal(tpPrice);
      expect(game.takeProfitPrice).to.be.equal(slPrice);
      expect(game.startringPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
      expect(game.endTime).to.be.equal(endTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.gameStatus).to.be.equal(Status.Created);
    });

    it("should create TP setup game", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      let game = await Game.decodeData(currentGameId);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.stopLossPrice).to.be.equal(slPrice);
      expect(game.takeProfitPrice).to.be.equal(tpPrice);
      expect(game.startringPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
      expect(game.endTime).to.be.equal(endTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.gameStatus).to.be.equal(Status.Created);
    });

    it("should fail - wrong sl price (short)", async function () {
      await expect(
        Game.createSetup(
          false,
          (await time.latest()) + fortyFiveMinutes,
          tpPrice,
          slPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            parse18("63000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(wrongPrice);
    });

    it("should fail - wrong sl price (long)", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + fortyFiveMinutes,
          tpPrice,
          slPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            parse18("50000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(wrongPrice);
    });

    it("should fail - wrong tp price (long)", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + fortyFiveMinutes,
          tpPrice,
          slPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            parse18("66000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(wrongPrice);
    });

    it("should fail - wrong tp price (short)", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + fortyFiveMinutes,
          slPrice,
          tpPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            parse18("50000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(wrongPrice);
    });

    it("should fail - wrong sl price (short)", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + fortyFiveMinutes,
          slPrice,
          tpPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            parse18("63000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(wrongPrice);
    });

    it("should fail - high game duration", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + monthUnix * 12,
          tpPrice,
          slPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(highGameDuration);
    });

    it("should fail - low game duration", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + fifteenMinutes,
          tpPrice,
          slPrice,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(lowGameDuration);
    });
  });

  describe("Play game", async function () {
    it("should play SL game", async function () {
      const oldUserBalance = await USDT.balanceOf(bob.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      const newUserBalance = await USDT.balanceOf(bob.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let game = await Game.decodeData(currentGameId);

      expect(oldUserBalance - newUserBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(game.totalDepositsSL).to.be.equal(usdtAmount);
    });

    it("should play TP game", async function () {
      const oldUserBalance = await USDT.balanceOf(alice.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      const newUserBalance = await USDT.balanceOf(alice.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let game = await Game.decodeData(currentGameId);
      expect(oldUserBalance - newUserBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(game.totalDepositsTP).to.equal(usdtAmount);
    });

    it("should play with deposited amount", async function () {
      const oldUserBalance = await USDT.balanceOf(harry.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Treasury.connect(harry).deposit(usdtAmount);
      await Game.connect(harry).playWithDeposit(
        true,
        usdtAmount,
        currentGameId
      );
      const newUserBalance = await USDT.balanceOf(harry.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let game = await Game.decodeData(currentGameId);
      expect(oldUserBalance - newUserBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(game.totalDepositsTP).to.equal(usdtAmount * 2);
    });

    it("should fail - totalDepositTP > max uint32", async function () {
      const maxUint32 = 4294967295;
      await expect(
        Game.connect(owner).play(true, maxUint32, currentGameId)
      ).to.be.revertedWith(gameClosed);
    });

    it("should fail - insufficent deposit amount", async function () {
      await expect(
        Game.playWithDeposit(true, usdtAmount, currentGameId)
      ).to.be.revertedWith(requireSufficentDepositAmount);
    });

    it("should play and rewrite totalDepositsTP", async function () {
      const oldUserBalance = await USDT.balanceOf(owner.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(owner).play(true, usdtAmount, currentGameId);
      const newUserBalance = await USDT.balanceOf(owner.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let game = await Game.decodeData(currentGameId);
      expect(oldUserBalance - newUserBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(game.totalDepositsTP).to.equal(usdtAmount * 3);
    });

    it("should fail - can't enter twice", async function () {
      await expect(
        Game.connect(alice).play(false, usdtAmount, currentGameId)
      ).to.be.revertedWith(isParticipating);
    });

    it("should fail - play wrong status", async function () {
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      await expect(
        Game.play(true, usdtAmount, currentGameId)
      ).to.be.revertedWith(wrongStatus);
    });

    it("should fail - enter time is up", async function () {
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      await time.increase(fortyFiveMinutes);
      currentGameId = receipt?.logs[0]?.args[0][0];
      await expect(
        Game.connect(alice).play(false, usdtAmount, currentGameId)
      ).to.be.revertedWith(gameClosed);
      await Game.closeGame(currentGameId);
    });
  });
  describe("Close game", async function () {
    it("should close setup game", async function () {
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Cancelled);
    });

    it("should close game and refund for TP team", async function () {
      const oldOwnerBalance = await USDT.balanceOf(owner.address);
      const oldBobBalance = await USDT.balanceOf(bob.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];

      await Game.play(true, usdtAmount, currentGameId);
      await Game.connect(bob).play(true, usdtAmount, currentGameId);

      let newOwnerBalance = await USDT.balanceOf(owner.address);
      let newBobBalance = await USDT.balanceOf(bob.address);
      let newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );

      expect(oldOwnerBalance - newOwnerBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(oldBobBalance - newBobBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18((usdtAmount * 2).toString())
      );

      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      await Game.connect(owner).getRefund(currentGameId);
      await Game.connect(bob).getRefund(currentGameId);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(bob).withdraw(
        (await Treasury.deposits(bob.address)) / BigInt(Math.pow(10, 18))
      );
      newOwnerBalance = await USDT.balanceOf(owner.address);
      newBobBalance = await USDT.balanceOf(bob.address);
      newTreasuryBalance = await USDT.balanceOf(await Treasury.getAddress());

      expect(oldOwnerBalance).to.be.equal(newOwnerBalance);
      expect(oldBobBalance).to.be.equal(newBobBalance);
      expect(oldTreasuryBalance).to.be.equal(newTreasuryBalance);

      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Cancelled);
    });

    it("should close game and refund for TP team", async function () {
      const oldOwnerBalance = await USDT.balanceOf(owner.address);
      const oldBobBalance = await USDT.balanceOf(bob.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.play(false, usdtAmount, currentGameId);
      await Game.connect(bob).play(false, usdtAmount, currentGameId);

      let newOwnerBalance = await USDT.balanceOf(owner.address);
      let newBobBalance = await USDT.balanceOf(bob.address);
      let newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );

      expect(oldOwnerBalance - newOwnerBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(oldBobBalance - newBobBalance).to.be.equal(
        parse18(usdtAmount.toString())
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18((usdtAmount * 2).toString())
      );

      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      await Game.connect(owner).getRefund(currentGameId);
      await Game.connect(bob).getRefund(currentGameId);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(bob).withdraw(
        (await Treasury.deposits(bob.address)) / BigInt(Math.pow(10, 18))
      );
      newOwnerBalance = await USDT.balanceOf(owner.address);
      newBobBalance = await USDT.balanceOf(bob.address);
      newTreasuryBalance = await USDT.balanceOf(await Treasury.getAddress());

      expect(oldOwnerBalance).to.be.equal(newOwnerBalance);
      expect(oldBobBalance).to.be.equal(newBobBalance);
      expect(oldTreasuryBalance).to.be.equal(newTreasuryBalance);

      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Cancelled);
    });

    it("should fail - close not exitsting game", async function () {
      const notExistingGameId =
        "0x0003481a2f7fe21c01d427f39035541d2b7a53db9c76234dc36082e6ad6db7f5";
      await expect(Game.closeGame(notExistingGameId)).to.be.revertedWith(
        dontExist
      );
    });
  });

  describe("Finalize game", async function () {
    it("should end setup game (long) tp wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await USDT.balanceOf(alice);
      const oldOwnerBalance = await USDT.balanceOf(owner);
      const oldBobBalance = await USDT.balanceOf(bob);
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceTP.toString(),
          feedNumber,
          finalizeTime
        ),
        currentGameId
      );
      receipt = await tx.wait();
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(game.finalPrice).to.be.equal(
        finalPriceTP / BigInt(Math.pow(10, 14))
      );
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.stopLossPrice).to.be.equal(slPrice);
      expect(game.takeProfitPrice).to.be.equal(tpPrice);
      expect(game.startringPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      await Game.connect(alice).retrieveRewards(currentGameId);
      await expect(
        Game.connect(bob).retrieveRewards(currentGameId)
      ).to.be.revertedWith(youLost);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(bob).withdraw(
        (await Treasury.deposits(bob.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      const finalAliceBalance = await USDT.balanceOf(alice);
      const finalOwnerBalance = await USDT.balanceOf(owner);
      const finalBobBalance = await USDT.balanceOf(bob);
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      expect(finalAliceBalance).to.be.above(oldAliceBalance);
      expect(oldBobBalance).to.be.above(finalBobBalance);
    });

    it("should end setup game (long) sl wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await USDT.balanceOf(alice);
      const oldOwnerBalance = await USDT.balanceOf(owner);
      const oldBobBalance = await USDT.balanceOf(bob);
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceSL.toString(),
          feedNumber,
          finalizeTime
        ),
        currentGameId
      );
      receipt = await tx.wait();
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(game.finalPrice).to.be.equal(
        finalPriceSL / BigInt(Math.pow(10, 14))
      );
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.stopLossPrice).to.be.equal(slPrice);
      expect(game.takeProfitPrice).to.be.equal(tpPrice);
      expect(game.startringPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      await expect(
        Game.connect(alice).retrieveRewards(currentGameId)
      ).to.be.revertedWith(youLost);
      await Game.connect(bob).retrieveRewards(currentGameId);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(bob).withdraw(
        (await Treasury.deposits(bob.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      const finalAliceBalance = await USDT.balanceOf(alice);
      const finalOwnerBalance = await USDT.balanceOf(owner);
      const finalBobBalance = await USDT.balanceOf(bob);
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      expect(oldAliceBalance).to.be.above(finalAliceBalance);
      expect(finalBobBalance).to.be.above(oldBobBalance);
    });

    it("should fail - can't end (long)", async function () {
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            finalizeTime
          ),
          currentGameId
        )
      ).to.be.revertedWith(cantEnd);
    });

    it("should end setup game (short) tp wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await USDT.balanceOf(alice);
      const oldOwnerBalance = await USDT.balanceOf(owner);
      const oldBobBalance = await USDT.balanceOf(bob);
      const isLong = false;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceTP.toString(),
          feedNumber,
          finalizeTime
        ),
        currentGameId
      );
      receipt = await tx.wait();
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(game.finalPrice).to.be.equal(
        finalPriceTP / BigInt(Math.pow(10, 14))
      );
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.stopLossPrice).to.be.equal(tpPrice);
      expect(game.takeProfitPrice).to.be.equal(slPrice);
      expect(game.startringPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      await expect(
        Game.connect(alice).retrieveRewards(currentGameId)
      ).to.be.revertedWith(youLost);
      await Game.connect(bob).retrieveRewards(currentGameId);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(bob).withdraw(
        (await Treasury.deposits(bob.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      const finalAliceBalance = await USDT.balanceOf(alice);
      const finalOwnerBalance = await USDT.balanceOf(owner);
      const finalBobBalance = await USDT.balanceOf(bob);
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      expect(oldAliceBalance).to.be.above(finalAliceBalance);
      expect(finalBobBalance).to.be.above(oldBobBalance);
    });

    it("should end setup game (short) sl wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await USDT.balanceOf(alice);
      const oldOwnerBalance = await USDT.balanceOf(owner);
      const oldBobBalance = await USDT.balanceOf(bob);
      const isLong = false;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceSL.toString(),
          feedNumber,
          finalizeTime
        ),
        currentGameId
      );
      receipt = await tx.wait();
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(game.finalPrice).to.be.equal(
        finalPriceSL / BigInt(Math.pow(10, 14))
      );
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.stopLossPrice).to.be.equal(tpPrice);
      expect(game.takeProfitPrice).to.be.equal(slPrice);
      expect(game.startringPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      await Game.connect(alice).retrieveRewards(currentGameId);
      await expect(
        Game.connect(bob).retrieveRewards(currentGameId)
      ).to.be.revertedWith(youLost);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(bob).withdraw(
        (await Treasury.deposits(bob.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      const finalAliceBalance = await USDT.balanceOf(alice);
      const finalOwnerBalance = await USDT.balanceOf(owner);
      const finalBobBalance = await USDT.balanceOf(bob);
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      expect(finalAliceBalance).to.be.above(oldAliceBalance);
      expect(oldBobBalance).to.be.above(finalBobBalance);
    });

    it("should fail - can't end (short)", async function () {
      const isLong = false;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            finalizeTime
          ),
          currentGameId
        )
      ).to.be.revertedWith(cantEnd);
    });

    it("should fail - wrong status", async function () {
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceSL.toString(),
            feedNumber,
            (await time.latest()) + fortyFiveMinutes
          ),
          currentGameId
        )
      ).to.be.revertedWith(wrongStatus);
    });

    it("should fail - wrong caller", async function () {
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = await time.latest();
      await expect(
        Game.connect(alice).finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceSL.toString(),
            feedNumber,
            finalizeTime
          ),
          currentGameId
        )
      ).to.be.revertedWithCustomError(Game, "AccessControlUnauthorizedAccount");
    });

    it("should refund if only tp team count = 0", async function () {
      let oldAliceBalance = await USDT.balanceOf(alice);
      let oldOwnerBalance = await USDT.balanceOf(owner);
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(alice).play(false, usdtAmount, currentGameId);
      await Game.connect(owner).play(false, usdtAmount, currentGameId);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceTP.toString(),
          feedNumber,
          await time.latest()
        ),
        currentGameId
      );
      await Game.connect(alice).getRefund(currentGameId);
      await Game.connect(owner).getRefund(currentGameId);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      expect(oldAliceBalance).to.be.equal(await USDT.balanceOf(alice));
      expect(oldOwnerBalance).to.be.equal(await USDT.balanceOf(owner));
    });

    it("should refund if only sl team count = 0", async function () {
      let oldAliceBalance = await USDT.balanceOf(alice);
      let oldOwnerBalance = await USDT.balanceOf(owner);
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await Game.connect(owner).play(true, usdtAmount, currentGameId);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceTP.toString(),
          feedNumber,
          await time.latest()
        ),
        currentGameId
      );
      await Game.connect(alice).getRefund(currentGameId);
      await Game.connect(owner).getRefund(currentGameId);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      expect(oldAliceBalance).to.be.equal(await USDT.balanceOf(alice));
      expect(oldOwnerBalance).to.be.equal(await USDT.balanceOf(owner));
    });
  });
  describe("Permit", async function () {
    it("should play with permit", async function () {
      let oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      let alicePermit = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await Game.playWithPermit(false, usdtAmount, currentGameId, {
        deadline: deadline,
        v: ownerPermit.v,
        r: ownerPermit.r,
        s: ownerPermit.s,
      });
      await Game.connect(alice).playWithPermit(
        true,
        usdtAmount,
        currentGameId,
        {
          deadline: deadline,
          v: alicePermit.v,
          r: alicePermit.r,
          s: alicePermit.s,
        }
      );
      let newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        parse18((usdtAmount * 2).toString())
      );
    });
  });

  describe("Other", async function () {
    it("should change treasury", async function () {
      let temporaryTreasury = await new Treasury__factory(owner).deploy(
        await USDT.getAddress()
      );
      await Game.setTreasury(await temporaryTreasury.getAddress());
      expect(await Game.treasury()).to.equal(
        await temporaryTreasury.getAddress()
      );
      //return treasury back
      await Game.setTreasury(await Treasury.getAddress());
      expect(await Game.treasury()).to.equal(await Treasury.getAddress());
    });

    it("should change min and max game duration", async function () {
      let min = await Game.minDuration();
      let max = await Game.maxDuration();

      //increase by 1 minute
      await Game.changeGameDuration(max + BigInt(60), min + BigInt(60));
      expect(await Game.minDuration()).to.equal(min + BigInt(60));
      expect(await Game.maxDuration()).to.equal(max + BigInt(60));
    });
  });
});
