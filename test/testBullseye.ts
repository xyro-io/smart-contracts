import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Bullseye } from "../typechain-types/contracts/Bullseye.sol/Bullseye";
import { Bullseye__factory } from "../typechain-types/factories/contracts/Bullseye.sol/Bullseye__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";

import {
  abiEncodeInt192WithTimestamp,
  calculateRakebackRate,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const fifteenMinutes = 900;
const requireFinishedGame = "Finish previous game first";
const requireOpenedGame = "Game is closed for new players";
const requireStartedGame = "Start the game first";
const requirePastEndTime = "Too early to finish";
const requireValidChainlinkReport = "Old chainlink report";
const requireSufficentDepositAmount = "Insufficent deposit amount";
const requireApprovedToken = "Unapproved token";
const maxPlayersReached = "Max player amount reached";

describe("Bullseye", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let john: HardhatEthersSigner;
  let max: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: Bullseye;
  let Upkeep: MockVerifier;
  let players: any;
  let usdtAmount: bigint;
  let xyroAmount: bigint;
  const feedNumber = 4;
  const guessPriceOpponent = parse18("63000");
  const guessPriceAlice = parse18("58000");
  const guessBobPrice = parse18("57000");
  const guessOwnerPrice = parse18("57387");
  const guessMaxPrice = parse18("45000");
  const guessJohnPrice = parse18("70000");
  const finalPriceExact = parse18("58000");
  const finalPriceCloser = parse18("63500");
  beforeEach(async () => {
    [owner, opponent, alice, bob, john, max] = await ethers.getSigners();
    players = [owner, opponent, alice, bob, john, max];
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
    Game = await new Bullseye__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
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
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
  });

  describe("Create game", async function () {
    it("should create bullseye game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(await Game.depositAmount()).to.equal(usdtAmount);
      await Game.closeGame();
    });

    it("should fail - start new game without finishing previous", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );

      await expect(
        Game.startGame(
          (await time.latest()) + fortyFiveMinutes,
          (await time.latest()) + fifteenMinutes,
          usdtAmount,
          feedNumber,
          await USDT.getAddress()
        )
      ).to.be.revertedWith(requireFinishedGame);
      await Game.closeGame();
    });
  });

  describe("Play game", async function () {
    beforeEach(async () => {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
    });
    it("should play", async function () {
      let tx = await Game.connect(opponent).play(guessPriceOpponent);
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[1]?.args;

      expect(newPlayerLog[0]).to.be.equal(opponent.address);
      expect(newPlayerLog[1]).to.be.equal(guessPriceOpponent);
      expect(newPlayerLog[2]).to.be.equal(usdtAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(0);

      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(usdtAmount);
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(opponent.address))) /
          BigInt(100)
      );
      const playerGuessData = await Game.playerGuessData(0);
      expect(playerGuessData.player).to.be.equal(opponent.address);
      expect(playerGuessData.assetPrice).to.be.equal(guessPriceOpponent);
      await Game.closeGame();
    });

    it("should play with deposited amount", async function () {
      await Game.connect(opponent).play(guessPriceOpponent);
      await Treasury.connect(alice).deposit(
        usdtAmount,
        await USDT.getAddress()
      );
      let tx = await Game.connect(alice).playWithDeposit(guessPriceAlice);
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[0]?.args;
      expect(newPlayerLog[0]).to.be.equal(alice.address);
      expect(newPlayerLog[1]).to.be.equal(guessPriceAlice);
      expect(newPlayerLog[2]).to.be.equal(usdtAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(1);
      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
        usdtAmount * BigInt(2)
      );
      const playerGuessData = await Game.playerGuessData(1);
      expect(playerGuessData.player).to.be.equal(alice.address);
      expect(playerGuessData.assetPrice).to.be.equal(guessPriceAlice);
      await Game.closeGame();
    });

    it("should fail - insufficent deposit amount", async function () {
      await expect(Game.playWithDeposit(guessBobPrice)).to.be.revertedWith(
        requireSufficentDepositAmount
      );
      await Game.closeGame();
    });

    it("should fail - play after time is up", async function () {
      await time.increase(fifteenMinutes);
      await expect(
        Game.connect(alice).play(guessPriceAlice)
      ).to.be.revertedWith(requireOpenedGame);
      await Game.closeGame();
    });

    it("should fail - play game before it's started", async function () {
      await Game.closeGame();
      await expect(
        Game.connect(alice).play(guessPriceAlice)
      ).to.be.revertedWith(requireOpenedGame);
    });
  });

  describe("Close game", async function () {
    it("should close game and refund (closeGame)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
      await Game.connect(alice).play(guessPriceAlice);
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await time.increase(fortyFiveMinutes);
      await expect(Game.closeGame()).to.emit(Game, "BullseyeCancelled");
      expect(await Game.getTotalPlayers()).to.be.equal(0);
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.above(oldBalance);
    });
  });

  describe("Finalize game", async function () {
    beforeEach(async () => {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
    });
    it("should fail - game not started", async function () {
      await Game.closeGame();
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireStartedGame);
    });

    it("should fail - too early to finish", async function () {
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requirePastEndTime);
      await Game.closeGame();
    });

    it("should fail - old chainlink report", async function () {
      await Game.connect(opponent).play(guessPriceAlice);
      await Game.connect(alice).play(guessPriceAlice);
      await time.increase(fortyFiveMinutes * 2);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireValidChainlinkReport);
      await Game.closeGame();
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
    });

    it("should close game and refund (finalizeGame)", async function () {
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await Game.connect(alice).play(guessPriceAlice);
      await time.increase(fortyFiveMinutes);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeCancelled");
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.equal(oldBalance);
    });

    it("should finish game with 2 players (same prices)", async function () {
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(alice).play(guessPriceAlice);
      let oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceCloser.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      const withdrawnFeesAlice =
        (usdtAmount * (await Game.fee())) / BigInt(10000);
      const rakebackAlice = await Treasury.lockedRakeback(
        gameId,
        alice.address
      );
      const wonAmountOpponent =
        usdtAmount * BigInt(2) - withdrawnFeesAlice - rakebackAlice;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice);
      expect(newAliceBalance).to.be.equal(oldAliceBalance);
      expect(newOpponentBalance - oldOpponentBalance).to.be.equal(
        wonAmountOpponent
      );
    });

    it("should finish game with 2 players (exact price, first player wins)", async function () {
      let oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      await Game.connect(alice).play(guessPriceAlice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address
      );
      const withdrawnFeesOpponent =
        (usdtAmount * (await Game.fee())) / BigInt(10000);
      const wonAmountAlice =
        usdtAmount * BigInt(2) - rakebackOpponent - withdrawnFeesOpponent;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesOpponent);
      expect(newAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
    });

    it.skip("should finish game with 2 players (the same price, the same time)", async function () {
      let oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      await ethers.provider.send("evm_setAutomine", [false]);

      await Game.connect(alice).play(guessPriceAlice);
      await Game.connect(opponent).play(guessPriceAlice);

      await ethers.provider.send("evm_setAutomine", [true]);

      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      console.log(
        "alice: " + newAliceBalance + ", opponent: " + newOpponentBalance
      );
      // const rakebackOpponent = await Treasury.lockedRakeback(
      //   gameId,
      //   opponent.address
      // );
      // const withdrawnFeesOpponent =
      //   (usdtAmount * (await Game.fee())) / BigInt(10000);
      // const wonAmountAlice =
      //   usdtAmount * BigInt(2) - rakebackOpponent - withdrawnFeesOpponent;
      // expect(
      //   (await Treasury.collectedFee(await USDT.getAddress())) -
      //     oldTreasuryFeeBalance
      // ).to.be.equal(withdrawnFeesOpponent);
      // expect(newAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      // expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
    });

    it("should end bullseye game (exact, 3 players)", async function () {
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      //alice should win exact
      await Game.connect(alice).play(guessPriceAlice);
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address
      );
      const withdrawnFeesOpponent =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      const rakebackBob = await Treasury.lockedRakeback(gameId, bob.address);
      const withdrawnFeesBob =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      let wonAmountAlice =
        usdtAmount * BigInt(3) -
        withdrawnFeesBob -
        withdrawnFeesOpponent -
        rakebackOpponent -
        rakebackBob;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesBob + withdrawnFeesOpponent);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
    });

    it("should end bullseye game (3 players, same guesses)", async function () {
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessBobPrice);
      await Game.connect(alice).play(guessBobPrice);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][1]).to.be.equal(opponent.address);
      expect(finalizeEventLog[0][2]).to.be.equal(alice.address);
      expect(finalizeEventLog[1][0]).to.be.equal(0);
      expect(finalizeEventLog[1][1]).to.be.equal(1);
      expect(finalizeEventLog[1][2]).to.be.equal(2);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address
      );
      const withdrawnFeesPerLostPlayer =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      const rakebackAlice = await Treasury.lockedRakeback(
        gameId,
        alice.address
      );
      let wonAmountBob =
        usdtAmount * BigInt(3) -
        withdrawnFeesPerLostPlayer * BigInt(2) -
        rakebackOpponent -
        rakebackAlice;
      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesPerLostPlayer * BigInt(2));
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOpponentDeposit).to.be.equal(oldOpponentDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (5 players)", async function () {
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessPriceAlice);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );

      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const opponentRakeback = await Treasury.lockedRakeback(
        gameId,
        opponent.address
      );
      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(4);

      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceCloser.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(opponent.address);
      expect(finalizeEventLog[0][1]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(0);
      expect(finalizeEventLog[1][1]).to.be.equal(4);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceCloser);
      expect(finalizeEventLog[3]).to.be.equal(false);

      let wonAmountOpponent =
        usdtAmount * BigInt(5) -
        totalRakeback -
        totalWithdrawnFees +
        opponentRakeback;

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newOpponentDeposit - oldOpponentDeposit).to.be.equal(
        wonAmountOpponent
      );
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
      expect(oldBobDeposit).to.be.equal(newBobDeposit);
    });

    it("should end bullseye game (6 players, exact)", async function () {
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessPriceAlice);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const aliceRakeback = await Treasury.lockedRakeback(
        gameId,
        alice.address
      );
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address
      );
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[3]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(5);
      expect(finalizeEventLog[1][1]).to.be.equal(2);
      expect(finalizeEventLog[1][2]).to.be.equal(0);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(4);
      const totalRakebackOfLostPlayers =
        totalRakeback - aliceRakeback - ownerRakeback;
      const pot =
        usdtAmount * BigInt(6) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;
      let wonAmountAlice = (pot * (await Game.rates(2, 0))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(2, 1))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldBobDeposit).to.be.equal(newBobDeposit);
    });

    it("should end bullseye game (6 players)", async function () {
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessMaxPrice);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address);
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address
      );
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[3]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(4);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback;
      const pot =
        usdtAmount * BigInt(6) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;
      let wonAmountBob = (pot * (await Game.rates(1, 1))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(1, 0))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (10 players)", async function () {
      const signers = await ethers.getSigners();
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessMaxPrice);
      for (let i = 6; i < 10; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        await Game.connect(signers[i]).play(guessMaxPrice + BigInt(i));
      }

      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address);
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address
      );
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[3]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(8);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback;
      const pot =
        usdtAmount * BigInt(10) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;
      let wonAmountBob = (pot * (await Game.rates(1, 1))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(1, 0))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
    });

    it("should end bullseye game (12 players)", async function () {
      const signers = await ethers.getSigners();
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessMaxPrice);
      for (let i = 6; i < 12; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        await Game.connect(signers[i]).play(guessMaxPrice + BigInt(i));
      }
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address);
      const opponentRakeback = await Treasury.lockedRakeback(
        gameId,
        opponent.address
      );
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address
      );
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[4]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(9);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback - opponentRakeback;
      const pot =
        usdtAmount * BigInt(12) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;

      let wonAmountBob = (pot * (await Game.rates(3, 1))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(3, 0))) / BigInt(10000);
      let wonAmountOpponent = (pot * (await Game.rates(3, 2))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(newOpponentDeposit - oldOpponentDeposit).to.be.equal(
        wonAmountOpponent
      );
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (12 players, exact)", async function () {
      const signers = await ethers.getSigners();
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessPriceAlice);
      for (let i = 6; i < 12; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        await Game.connect(signers[i]).play(guessMaxPrice + BigInt(i));
      }
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address);
      const aliceRakeback = await Treasury.lockedRakeback(
        gameId,
        alice.address
      );
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address
      );
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[4]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(5);
      expect(finalizeEventLog[1][1]).to.be.equal(2);
      expect(finalizeEventLog[1][2]).to.be.equal(0);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(9);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback - aliceRakeback;
      const pot =
        usdtAmount * BigInt(12) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;

      let wonAmountBob = (pot * (await Game.rates(4, 2))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(4, 1))) / BigInt(10000);
      let wonAmountAlice = (pot * (await Game.rates(4, 0))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
    });

    it("should fail - max amount of players reached", async function () {
      const signers = await ethers.getSigners();
      for (let i = 0; i < 100; i++) {  
          await USDT.mint(signers[i].address, parse18("10000000"));
          await USDT.connect(signers[i]).approve(
            await Treasury.getAddress(),
            ethers.MaxUint256
          );
          await Game.connect(signers[i]).play(guessMaxPrice + BigInt(i));
        }
    
    await expect(Game.connect(signers[100]).play(guessBobPrice)).to.be.revertedWith(maxPlayersReached);
  });
  
  });

  describe("Games with XyroToken", async function () {
    it("should fail - attempt to create a game with unapproved token", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          xyroAmount,
          feedNumber,
          await XyroToken.getAddress()
        )
      ).to.be.revertedWith(requireApprovedToken);
    });

    it("should create bullseye game with XyroToken", async function () {
      //approve XyroToken in Treasury
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        feedNumber,
        await XyroToken.getAddress()
      );
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(await Game.depositAmount()).to.equal(xyroAmount);
      await Game.closeGame();
    });
    it("should play with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);

      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        xyroAmount,
        feedNumber,
        await XyroToken.getAddress()
      );
      let tx = await Game.connect(opponent).play(guessPriceOpponent);
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[1]?.args;

      expect(newPlayerLog[0]).to.be.equal(opponent.address);
      expect(newPlayerLog[1]).to.be.equal(guessPriceOpponent);
      expect(newPlayerLog[2]).to.be.equal(xyroAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(0);

      expect(await XyroToken.balanceOf(Treasury.getAddress())).to.equal(
        xyroAmount
      );
      const playerGuessData = await Game.playerGuessData(0);
      expect(playerGuessData.player).to.be.equal(opponent.address);
      expect(playerGuessData.assetPrice).to.be.equal(guessPriceOpponent);
      await Game.closeGame();
    });

    it("should end bullseye game (exact, 3 players) with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);

      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        xyroAmount,
        feedNumber,
        await XyroToken.getAddress()
      );
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      //alice should win exact
      await Game.connect(alice).play(guessPriceAlice);
      let oldAliceDeposit = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await XyroToken.getAddress()
      );
      const gameId = await Game.currentGameId();
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);
      const rakebackBob = await Treasury.lockedRakeback(gameId, bob.address);
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address
      );
      const withdrawnFeesPerLostPlayer =
        (xyroAmount * (await Game.fee())) / BigInt(10000);

      let wonAmountAlice =
        xyroAmount * BigInt(3) -
        withdrawnFeesPerLostPlayer * BigInt(2) -
        rakebackBob -
        rakebackOpponent;
      let newAliceDeposit = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      expect(
        await Treasury.collectedFee(await XyroToken.getAddress())
      ).to.be.equal(withdrawnFeesPerLostPlayer * BigInt(2));
      expect(
        (await Treasury.collectedFee(await XyroToken.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesPerLostPlayer * BigInt(2));
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
    });
  });

  describe("Permit", async function () {
    it("should play with permit", async function () {
      let oldBalance = await USDT.balanceOf(owner.getAddress());
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );

      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );

      await Game.playWithPermit(guessPriceOpponent, {
        deadline: deadline,
        v: result.v,
        r: result.r,
        s: result.s,
      });
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(oldBalance).to.be.above(newBalance);
    });
  });

  it("should change exact range", async function () {
    const newRange = 10000;
    const oldRange = await Game.exactRange();
    await Game.setExactRange(newRange);
    expect(await Game.exactRange()).to.be.equal(newRange);
    await Game.setExactRange(oldRange);
    expect(await Game.exactRange()).to.be.equal(oldRange);
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

  it("should return player amount", async function () {
    expect(await Game.getTotalPlayers()).to.be.equal(0);
  });

  describe("Events", async function () {
    it("should emit finalize game event", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
      await Game.connect(alice).play(guessPriceAlice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await time.increase(fortyFiveMinutes);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeFinalized");
    });

    it("should emit cancelled game event if finalizeGame called with 0 and 1 players", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
      await time.increase(fortyFiveMinutes);
      //0 players
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeCancelled");

      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress()
      );
      await Game.connect(alice).play(guessPriceAlice);
      await time.increase(fortyFiveMinutes);
      //1 player
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeCancelled");
    });
  });
});
