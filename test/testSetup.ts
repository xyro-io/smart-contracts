import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Setup } from "../typechain-types/contracts/Setup";
import { Setup__factory } from "../typechain-types/factories/contracts/Setup__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";

import {
  abiEncodeInt192WithTimestamp,
  calculateRate,
  calculateWonAmount,
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
const noRakeback = "No rakeback available";
const disabledGame = "Game is disabled";
const requireSufficentDepositAmount = "Insufficent deposit amount";
const requireApprovedToken = "Unapproved token";
const requireWrongusdtAmount = "Wrong deposit amount";
const requireLowerFee = "Fee exceeds the cap";
const requireApprovedFeedNumber = "Wrong feed number";
const oldChainlinkReport = "Old chainlink report";

const Status = {
  Default: 0,
  Created: 1,
  Cancelled: 2,
  Finished: 3,
};

describe("Setup Game", () => {
  let owner: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let harry: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: Setup;
  let Upkeep: MockVerifier;
  let currentGameId: string;
  let receipt: any;
  let players: any;
  let usdtAmount: bigint;
  let xyroAmount: bigint;
  const tpPrice = parse18("65000");
  const slPrice = parse18("62000");
  const finalPriceTP = parse18("66000");
  const finalPriceSL = parse18("61000");
  const feedNumber = 1;
  const assetPrice = parse18("62500");
  beforeEach(async () => {
    [owner, bob, alice, harry] = await ethers.getSigners();
    players = [owner, bob, alice, harry];
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    usdtAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await USDT.decimals())));
    XyroToken = await new XyroTokenERC677__factory(owner).deploy(
      parse18((1e13).toString())
    );
    xyroAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await XyroToken.decimals())));

    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()]
    );
    Game = await new Setup__factory(owner).deploy(await Treasury.getAddress());
    Upkeep = await new MockVerifier__factory(owner).deploy();

    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Game.grantRole(await Game.GAME_MASTER_ROLE(), owner.address);
    for (let i = 0; i < players.length; i++) {
      await USDT.mint(players[i].address, parse18("10000000"));
      await USDT.connect(players[i]).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
      await XyroToken.approve(players[i].address, ethers.MaxUint256);
      await XyroToken.transfer(players[i].address, parse18("10000"));
      await XyroToken.connect(players[i]).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
    }
    await Treasury.grantRole(
      await Treasury.DEFAULT_ADMIN_ROLE(),
      await Game.getAddress()
    );
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    //set mock feed ids
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
    await Upkeep.setfeedNumberBatch(feedIds);
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
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      let game = await Game.decodeData(currentGameId);
      let data = await Game.games(currentGameId);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.takeProfitPrice).to.be.equal(slPrice);
      expect(data.stopLossPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
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
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      let game = await Game.decodeData(currentGameId);
      let data = await Game.games(currentGameId);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
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
          await USDT.getAddress(),
          abiEncodeInt192WithTimestamp(
            parse18("63000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(wrongPrice);
    });

    it("should fail - wrong feedNumber startGame", async function () {
      const wrongFeedNumber = 9;
      await expect(
        Game.createSetup(
          false,
          (await time.latest()) + fortyFiveMinutes,
          tpPrice,
          slPrice,
          wrongFeedNumber,
          await USDT.getAddress(),
          abiEncodeInt192WithTimestamp(
            parse18("63000").toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireApprovedFeedNumber);
    });

    it("should fail - game is disabled", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = false;
      await Game.toggleActive();
      await expect(
        Game.createSetup(
          isLong,
          endTime,
          slPrice,
          tpPrice,
          feedNumber,
          await USDT.getAddress(),
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            startTime
          )
        )
      ).to.be.revertedWith(disabledGame);
      await Game.toggleActive();
    });

    it("should fail - wrong sl price (long)", async function () {
      await expect(
        Game.createSetup(
          true,
          (await time.latest()) + fortyFiveMinutes,
          tpPrice,
          slPrice,
          feedNumber,
          await USDT.getAddress(),
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
          await USDT.getAddress(),
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
          await USDT.getAddress(),
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
          await USDT.getAddress(),
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
          await USDT.getAddress(),
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
          await USDT.getAddress(),
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
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      const oldUserBalance = await USDT.balanceOf(bob.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      const newUserBalance = await USDT.balanceOf(bob.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );

      expect(oldUserBalance - newUserBalance).to.be.equal(usdtAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      let data = await Game.games(currentGameId);
      expect(data.totalDepositsSL).to.be.equal(usdtAmount);
    });

    it("should play TP game", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      const oldUserBalance = await USDT.balanceOf(alice.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      const newUserBalance = await USDT.balanceOf(alice.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(oldUserBalance - newUserBalance).to.be.equal(usdtAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      let data = await Game.games(currentGameId);
      expect(data.totalDepositsTP).to.equal(usdtAmount);
    });

    it("should play with deposited amount", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      const oldUserBalance = await USDT.balanceOf(harry.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Treasury.connect(harry).deposit(
        usdtAmount,
        await USDT.getAddress()
      );
      await Game.connect(harry).playWithDeposit(
        true,
        usdtAmount,
        currentGameId
      );
      const newUserBalance = await USDT.balanceOf(harry.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(oldUserBalance - newUserBalance).to.be.equal(usdtAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      let data = await Game.games(currentGameId);
      expect(data.totalDepositsTP).to.equal(usdtAmount);
    });

    it("should fail - insufficent deposit amount", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await expect(
        Game.playWithDeposit(true, usdtAmount, currentGameId)
      ).to.be.revertedWith(requireSufficentDepositAmount);
    });

    it("should fail - Wrong deposit amount", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await expect(
        Game.connect(bob).play(true, 0, currentGameId)
      ).to.be.revertedWith(requireWrongusdtAmount);
    });

    it("should play and rewrite totalDepositsTP", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
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
      expect(oldUserBalance - newUserBalance).to.be.equal(usdtAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      let data = await Game.games(currentGameId);
      expect(data.totalDepositsTP).to.equal(usdtAmount);
    });

    it("should fail - can't enter twice", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(alice).play(false, usdtAmount, currentGameId);
      await expect(
        Game.connect(alice).play(true, usdtAmount, currentGameId)
      ).to.be.revertedWith(isParticipating);
    });

    it("should fail - play wrong status", async function () {
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
        await USDT.getAddress(),
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
        await USDT.getAddress(),
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

    it("should fail - attempt to close game twice", async function () {
      let tx = await Game.createSetup(
        true,
        (await time.latest()) + fortyFiveMinutes,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
      await expect(Game.closeGame(currentGameId)).to.be.revertedWith(
        wrongStatus
      );
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
        await USDT.getAddress(),
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

      expect(oldOwnerBalance - newOwnerBalance).to.be.equal(usdtAmount);
      expect(oldBobBalance - newBobBalance).to.be.equal(usdtAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        usdtAmount * BigInt(2)
      );

      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      await Game.connect(owner).getRefund(currentGameId);
      await Game.connect(bob).getRefund(currentGameId);
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      await Treasury.connect(bob).withdraw(
        await Treasury.deposits(await USDT.getAddress(), bob.address),
        await USDT.getAddress()
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
        await USDT.getAddress(),
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

      expect(oldOwnerBalance - newOwnerBalance).to.be.equal(usdtAmount);
      expect(oldBobBalance - newBobBalance).to.be.equal(usdtAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(
        usdtAmount * BigInt(2)
      );

      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      await Game.connect(owner).getRefund(currentGameId);
      await Game.connect(bob).getRefund(currentGameId);
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      await Treasury.connect(bob).withdraw(
        await Treasury.deposits(await USDT.getAddress(), bob.address),
        await USDT.getAddress()
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
      const oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsSL * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackSL;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceTP);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      const bobRakeback = await Treasury.lockedRakeback(
        currentGameId,
        bob.address
      );
      await Game.connect(alice).retrieveRewards([currentGameId]);
      //get rakeback for bob
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      const finalAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      const wonAmountAlice = calculateWonAmount(
        usdtAmount - (usdtAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(finalBobBalance - oldBobBalance).to.be.equal(bobRakeback);
    });

    it("should end setup game (long) sl wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsTP * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackTP;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceSL);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      const aliceRakeback = await Treasury.lockedRakeback(
        currentGameId,
        alice.address
      );
      await expect(
        Game.connect(alice).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      await Game.connect(bob).retrieveRewards([currentGameId]);
      const finalAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(aliceRakeback);
      const wonAmountBob = calculateWonAmount(
        usdtAmount - (usdtAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalBobBalance - oldBobBalance).to.be.equal(wonAmountBob);
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
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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

    it("should fail - old chainlink report", async function () {
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            endTime + fifteenMinutes
          ),
          currentGameId
        )
      ).to.be.revertedWith(oldChainlinkReport);
    });

    it("should end setup game (short) tp wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const isLong = false;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsSL * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackSL;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceTP);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(tpPrice);
      expect(data.takeProfitPrice).to.be.equal(slPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      const aliceRakeback = await Treasury.lockedRakeback(
        currentGameId,
        alice.address
      );
      await expect(
        Game.connect(alice).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      await Game.connect(bob).retrieveRewards([currentGameId]);
      const finalAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(aliceRakeback);
      const wonAmountBob = calculateWonAmount(
        usdtAmount - (usdtAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalBobBalance - oldBobBalance).to.be.equal(wonAmountBob);
    });

    it("should end setup game (short) sl wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const isLong = false;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsTP * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackTP;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceSL);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(tpPrice);
      expect(data.takeProfitPrice).to.be.equal(slPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      await Game.connect(alice).retrieveRewards([currentGameId]);
      const bobRakeback = await Treasury.lockedRakeback(
        currentGameId,
        bob.address
      );
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      const finalAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      const wonAmountAlice = calculateWonAmount(
        usdtAmount - (usdtAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(finalBobBalance - oldBobBalance).to.be.equal(bobRakeback);
    });

    it("should end setup game with different setup and initiator fees (10%, 5%)", async function () {
      const oldFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const oldAliceBalance = await USDT.balanceOf(alice);
      const oldOwnerBalance = await USDT.balanceOf(owner);
      const oldBobBalance = await USDT.balanceOf(bob);
      const isLong = false;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      await Game.setInitiatorFee(500);
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceSL);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(tpPrice);
      expect(data.takeProfitPrice).to.be.equal(slPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      await Game.connect(alice).retrieveRewards([currentGameId]);
      const bobRakeback = await Treasury.lockedRakeback(
        currentGameId,
        bob.address
      );
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      await Treasury.connect(bob).withdraw(
        await Treasury.deposits(await USDT.getAddress(), bob.address),
        await USDT.getAddress()
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      const finalAliceBalance = await USDT.balanceOf(alice);
      const finalOwnerBalance = await USDT.balanceOf(owner);
      const finalBobBalance = await USDT.balanceOf(bob);
      const finalFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      expect(finalFeeBalance - oldFeeBalance).to.be.equal(
        (usdtAmount * BigInt(10)) / BigInt(100)
      );
      expect(finalOwnerBalance - oldOwnerBalance).to.be.equal(
        (usdtAmount * BigInt(2) * BigInt(5)) / BigInt(100)
      );
      expect(finalAliceBalance).to.be.above(oldAliceBalance);
      expect(oldBobBalance - finalBobBalance).to.be.equal(
        usdtAmount - bobRakeback
      );
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
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
        await USDT.getAddress(),
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
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
        await USDT.getAddress(),
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
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
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
        await USDT.getAddress(),
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
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      expect(oldAliceBalance).to.be.equal(await USDT.balanceOf(alice));
      expect(oldOwnerBalance).to.be.equal(await USDT.balanceOf(owner));
    });

    it("should fail - withdraw rakeback twice", async function () {
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
      tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceTP.toString(),
          feedNumber,
          finalizeTime
        ),
        currentGameId
      );
      receipt = await tx.wait();

      //get rakeback for bob
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.revertedWith(noRakeback);
    });
  });

  describe("Games with XyroToken", async function () {
    it("should fail - attempt to create a game with unapproved token with XyroToken", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = false;
      await expect(
        Game.createSetup(
          isLong,
          endTime,
          slPrice,
          tpPrice,
          feedNumber,
          await XyroToken.getAddress(),
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            startTime
          )
        )
      ).to.be.revertedWith(requireApprovedToken);
    });
    it("should create SL setup game with XyroToken", async function () {
      //approve XyroToken in Treasury
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = false;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        slPrice,
        tpPrice,
        feedNumber,
        await XyroToken.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      let game = await Game.decodeData(currentGameId);
      let data = await Game.games(currentGameId);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(tpPrice);
      expect(data.takeProfitPrice).to.be.equal(slPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.gameStatus).to.be.equal(Status.Created);
    });

    it("should create TP setup game with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await XyroToken.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      let game = await Game.decodeData(currentGameId);
      let data = await Game.games(currentGameId);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.gameStatus).to.be.equal(Status.Created);
    });

    it("should play SL game with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await XyroToken.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      const oldUserBalance = await XyroToken.balanceOf(bob.address);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(bob).play(false, xyroAmount, currentGameId);
      const newUserBalance = await XyroToken.balanceOf(bob.address);
      const newTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      expect(oldUserBalance - newUserBalance).to.be.equal(xyroAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(xyroAmount);
      let data = await Game.games(currentGameId);
      expect(data.totalDepositsSL).to.be.equal(xyroAmount);
    });

    it("should play TP game with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await XyroToken.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      const oldUserBalance = await XyroToken.balanceOf(alice.address);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(alice).play(true, xyroAmount, currentGameId);
      const newUserBalance = await XyroToken.balanceOf(alice.address);
      const newTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      expect(oldUserBalance - newUserBalance).to.be.equal(xyroAmount);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(xyroAmount);
      let data = await Game.games(currentGameId);
      expect(data.totalDepositsTP).to.equal(xyroAmount);
    });

    it("should close setup game with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await XyroToken.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await time.increase(fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Cancelled);
    });

    it("should end setup game (long) tp wins with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await XyroToken.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await XyroToken.getAddress(),
        bob.address
      );
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await XyroToken.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, xyroAmount, currentGameId);
      await Game.connect(alice).play(true, xyroAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsSL * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackSL;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceTP);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      const bobRakeback = await Treasury.lockedRakeback(
        currentGameId,
        bob.address
      );
      await Game.connect(alice).retrieveRewards([currentGameId]);
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");
      const finalAliceBalance = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await XyroToken.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await XyroToken.getAddress(),
        bob.address
      );
      const finalTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      const wonAmountAlice = calculateWonAmount(
        xyroAmount - (xyroAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(finalBobBalance - oldBobBalance).to.be.equal(bobRakeback);
    });
  });

  describe("Various rakeback rates", () => {
    beforeEach(async () => {
      //alice = 3%, bob = 1%, owner = 10%, harry = 0%
      await XyroToken.grantMintAndBurnRoles(bob);
      await XyroToken.connect(bob)["burn(uint256)"](parse18("9000"));
      await XyroToken.grantMintAndBurnRoles(harry);
      await XyroToken.connect(harry)["burn(uint256)"](parse18("10000"));
    });

    it("should check rakeback rates", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      //1%
      await Game.connect(bob).play(true, usdtAmount, currentGameId);
      expect(
        await Treasury.lockedRakeback(currentGameId, bob.address)
      ).to.be.equal(usdtAmount / BigInt(100));
      //3%
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      expect(
        await Treasury.lockedRakeback(currentGameId, alice.address)
      ).to.be.equal((usdtAmount / BigInt(100)) * BigInt(3));
      //0%
      await Game.connect(harry).play(false, usdtAmount, currentGameId);
      expect(
        await Treasury.lockedRakeback(currentGameId, harry.address)
      ).to.be.equal(0);
      //10%
      await Game.play(true, usdtAmount, currentGameId);
      expect(
        await Treasury.lockedRakeback(currentGameId, owner.address)
      ).to.be.equal((usdtAmount / BigInt(100)) * BigInt(10));
    });

    it("should end setup game (long) tp wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const oldHarryBalance = await Treasury.deposits(
        await USDT.getAddress(),
        harry.address
      );
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);
      await Game.connect(owner).play(false, usdtAmount, currentGameId);
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      await Game.connect(harry).play(true, usdtAmount, currentGameId);
      await time.increase(fortyFiveMinutes);
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsSL * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackSL;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceTP);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      const bobRakeback = await Treasury.lockedRakeback(
        currentGameId,
        bob.address
      );
      await Game.connect(alice).retrieveRewards([currentGameId]);
      await Game.connect(harry).retrieveRewards([currentGameId]);
      //get rakeback for bob
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");

      await expect(
        Game.connect(owner).retrieveRewards([currentGameId])
      ).to.be.emit(Treasury, "UsedRakeback");

      const finalAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );

      const finalHarryBalance = await Treasury.deposits(
        await USDT.getAddress(),
        harry.address
      );
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      const wonAmount = calculateWonAmount(
        usdtAmount - (usdtAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(wonAmount);
      expect(finalHarryBalance - oldHarryBalance).to.be.equal(wonAmount);
      expect(finalBobBalance - oldBobBalance).to.be.equal(bobRakeback);
    });
  });

  describe("No rakeback", () => {
    beforeEach(async () => {
      for (let i = 0; i < players.length; i++) {
        await XyroToken.grantMintAndBurnRoles(players[i].address);
        await XyroToken.connect(players[i])["burn(uint256)"](parse18("10000"));
      }
    });

    it("should play SL game", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(bob).play(false, usdtAmount, currentGameId);

      expect(
        await Treasury.lockedRakeback(currentGameId, bob.address)
      ).to.be.equal(0);

      let data = await Game.games(currentGameId);
      expect(data.totalRakebackSL).to.equal(0);
    });

    it("should play TP game", async function () {
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const isLong = true;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          startTime
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt?.logs[0]?.args[0][0];
      await Game.connect(alice).play(true, usdtAmount, currentGameId);
      expect(
        await Treasury.lockedRakeback(currentGameId, alice.address)
      ).to.be.equal(0);

      let data = await Game.games(currentGameId);
      expect(data.totalRakebackTP).to.equal(0);
    });

    it("should end setup game (long) tp wins", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const oldOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const oldBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const isLong = true;
      const startTime = await time.latest();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createSetup(
        isLong,
        endTime,
        tpPrice,
        slPrice,
        feedNumber,
        await USDT.getAddress(),
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
      const finalizeTime = endTime - 60;
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
      let data = await Game.games(currentGameId);
      const wonTeamTotalWithoutFee =
        data.totalDepositsTP -
        (data.totalDepositsTP * (await Game.initiatorFee())) / BigInt(10000);
      const lostTeamTotalWithoutFee =
        data.totalDepositsSL -
        (data.totalDepositsSL * (await Game.initiatorFee())) / BigInt(10000) -
        (data.totalDepositsSL * (await Game.fee())) / BigInt(10000) -
        data.totalRakebackSL;
      const finalRate = calculateRate(
        wonTeamTotalWithoutFee,
        lostTeamTotalWithoutFee
      );
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(data.finalPrice).to.be.equal(finalPriceTP);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(data.stopLossPrice).to.be.equal(slPrice);
      expect(data.takeProfitPrice).to.be.equal(tpPrice);
      expect(data.startingPrice).to.be.equal(assetPrice);
      expect(data.finalRate).to.be.equal(finalRate);
      expect(game.endTime).to.be.equal(finalizeTime);
      expect(game.startTime).to.be.equal(startTime);
      expect(game.initiator).to.be.equal(owner.address);
      const bobRakeback = await Treasury.lockedRakeback(
        currentGameId,
        bob.address
      );
      await Game.connect(alice).retrieveRewards([currentGameId]);
      //get rakeback for bob
      await expect(
        Game.connect(bob).retrieveRewards([currentGameId])
      ).to.be.revertedWith(noRakeback);
      const finalAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const finalOwnerBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      const finalBobBalance = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const finalTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(finalTreasuryBalance).to.be.above(oldTreasuryBalance);
      expect(finalOwnerBalance).to.be.above(oldOwnerBalance);
      const wonAmountAlice = calculateWonAmount(
        usdtAmount - (usdtAmount * (await Game.initiatorFee())) / BigInt(10000),
        finalRate
      );
      expect(finalAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(finalBobBalance - oldBobBalance).to.be.equal(bobRakeback);
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
        await USDT.getAddress(),
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
        usdtAmount,
        BigInt(deadline)
      );
      let alicePermit = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
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
        usdtAmount * BigInt(2)
      );
    });
  });

  describe("Other", async function () {
    it("should fail - change fee to 31%", async function () {
      await expect(Game.setFee(3100)).to.be.revertedWith(requireLowerFee);
    });

    it("should change treasury", async function () {
      let temporaryTreasury = await upgrades.deployProxy(
        await ethers.getContractFactory("Treasury"),
        [await USDT.getAddress(), await XyroToken.getAddress()]
      );
      await Game.setTreasury(await temporaryTreasury.getAddress());
      expect(await Game.treasury()).to.equal(
        await temporaryTreasury.getAddress()
      );
      //return treasury back
      await Game.setTreasury(await Treasury.getAddress());
      expect(await Game.treasury()).to.equal(await Treasury.getAddress());
    });

    it("should toggle game creation", async function () {
      expect(await Game.isActive()).to.be.equal(true);
      await Game.toggleActive();
      expect(await Game.isActive()).to.be.equal(false);
      await Game.toggleActive();
      expect(await Game.isActive()).to.be.equal(true);
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
