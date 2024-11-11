import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Treasury__factory } from "../typechain-types/factories/contracts/Treasury.sol/Treasury__factory";
import { Bullseye } from "../typechain-types/contracts/Bullseye.sol/Bullseye";
import { Bullseye__factory } from "../typechain-types/factories/contracts/Bullseye.sol/Bullseye__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import {
  abiEncodeInt192WithTimestamp,
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

describe("Bullseye", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let john: HardhatEthersSigner;
  let max: HardhatEthersSigner;
  let USDT: MockToken;
  let Treasury: Treasury;
  let Game: Bullseye;
  let Upkeep: MockVerifier;
  const feedNumber = 4;
  const usdtAmount = 100;
  const guessPriceOpponent = 630000000;
  const guessPriceAlice = 580000000;
  const guessBobPrice = 570000000;
  const guessOwnerPrice = 573870000;
  const guessMaxPrice = 450000000;
  const guessJohnPrice = 700000000;
  const finalPriceExact = parse18("58000");
  const finalPriceCloser = parse18("63500");
  before(async () => {
    [owner, opponent, alice, bob, john, max] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress()
    );
    Game = await new Bullseye__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Game.grantRole(await Game.GAME_MASTER_ROLE(), owner.address);
    await USDT.mint(await opponent.getAddress(), parse18("10000000"));
    await USDT.mint(await alice.getAddress(), parse18("10000000"));
    await USDT.mint(await bob.getAddress(), parse18("10000000"));
    await USDT.mint(await john.getAddress(), parse18("10000000"));
    await USDT.mint(await max.getAddress(), parse18("10000000"));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
    await USDT.connect(alice).approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(bob).approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(john).approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(max).approve(Treasury.getAddress(), ethers.MaxUint256);
  });

  describe("Create game", async function () {
    it("should create bullseye game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(endTime, stopPredictAt, usdtAmount, feedNumber);
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(game.depositAmount).to.equal(usdtAmount);
    });

    it("should fail - start new game without finishing previous", async function () {
      await expect(
        Game.startGame(
          (await time.latest()) + fortyFiveMinutes,
          (await time.latest()) + fifteenMinutes,
          usdtAmount,
          feedNumber
        )
      ).to.be.revertedWith(requireFinishedGame);
    });
  });

  describe("Play game", async function () {
    it("should play", async function () {
      let tx = await Game.connect(opponent).play(guessPriceOpponent);
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[1]?.args;

      expect(newPlayerLog[0]).to.be.equal(opponent.address);
      expect(newPlayerLog[1]).to.be.equal(guessPriceOpponent);
      expect(newPlayerLog[2]).to.be.equal(usdtAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(0);

      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
        parse18(usdtAmount.toString())
      );
      const playerGuessData = await Game.decodeGuess(0);
      expect(playerGuessData.player).to.be.equal(opponent.address);
      expect(playerGuessData.assetPrice).to.be.equal(guessPriceOpponent);
    });

    it("should play with deposited amount", async function () {
      await Treasury.connect(alice).deposit(usdtAmount);
      let tx = await Game.connect(alice).playWithDeposit(guessPriceAlice);
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[0]?.args;

      expect(newPlayerLog[0]).to.be.equal(alice.address);
      expect(newPlayerLog[1]).to.be.equal(guessPriceAlice);
      expect(newPlayerLog[2]).to.be.equal(usdtAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(1);

      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
        parse18((usdtAmount * 2).toString())
      );
      const playerGuessData = await Game.decodeGuess(1);
      expect(playerGuessData.player).to.be.equal(alice.address);
      expect(playerGuessData.assetPrice).to.be.equal(guessPriceAlice);
    });

    it("should fail - insufficent deposit amount", async function () {
      await expect(Game.playWithDeposit(guessBobPrice)).to.be.revertedWith(
        requireSufficentDepositAmount
      );
    });

    it("should fail - play after time is up", async function () {
      await time.increase(fifteenMinutes);
      await expect(
        Game.connect(alice).play(guessPriceAlice)
      ).to.be.revertedWith(requireOpenedGame);
      await Game.closeGame();
    });
  });

  describe("Close game", async function () {
    it("should close game and refund (closeGame)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(alice).play(guessPriceAlice);
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await time.increase(fortyFiveMinutes);
      await expect(Game.closeGame()).to.emit(Game, "BullseyeCancelled");
      expect(await Game.getTotalPlayers()).to.be.equal(0);
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.above(oldBalance);
    });
  });

  describe("Finalize game", async function () {
    it("should fail - game not started", async function () {
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
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );

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
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
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
        (await Treasury.deposits(opponent.address)) / BigInt(Math.pow(10, 18))
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
    });

    it("should close game and refund (finalzieGame)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
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
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.equal(oldBalance);
    });

    it("should finish game with 2 players (same prices)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(alice).play(guessPriceAlice);
      let oldAliceBalance = await Treasury.deposits(alice.address);
      let oldOpponentBalance = await Treasury.deposits(opponent.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceCloser.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(alice.address);
      let newOpponentBalance = await Treasury.deposits(opponent.address);
      const wonAmountAlice =
        (parse18((2 * usdtAmount).toString()) * (await Game.rates(0, 1))) /
        BigInt(10000);
      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);

      const wonAmountOpponent =
        (parse18((2 * usdtAmount).toString()) * (await Game.rates(0, 0))) /
        BigInt(10000);
      const withdrawnFeesOpponent =
        (wonAmountOpponent * (await Game.fee())) / BigInt(10000);
      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice + withdrawnFeesOpponent);
      expect(newAliceBalance - oldAliceBalance).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
      expect(newOpponentBalance - oldOpponentBalance).to.be.equal(
        wonAmountOpponent - withdrawnFeesOpponent
      );
    });

    it("should finish game with 2 players (exact price, second player wins)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      let oldAliceBalance = await Treasury.deposits(alice.address);
      let oldOpponentBalance = await Treasury.deposits(opponent.address);
      await Game.connect(opponent).play(guessPriceAlice);
      await Game.connect(alice).play(guessPriceAlice);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(alice.address);
      let newOpponentBalance = await Treasury.deposits(opponent.address);
      const wonAmountAlice = parse18((2 * usdtAmount).toString());
      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice);
      expect(newAliceBalance - oldAliceBalance).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
      expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
    });

    it("should finish game with 2 players (exact price, first player wins)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      let oldAliceBalance = await Treasury.deposits(alice.address);
      let oldOpponentBalance = await Treasury.deposits(opponent.address);
      await Game.connect(alice).play(guessPriceAlice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(alice.address);
      let newOpponentBalance = await Treasury.deposits(opponent.address);
      const wonAmountAlice = parse18((2 * usdtAmount).toString());
      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice);
      expect(newAliceBalance - oldAliceBalance).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
      expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
    });

    it("should end bullseye game (exact, 3 players)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      //alice should win exact
      await Game.connect(alice).play(guessPriceAlice);
      let oldAliceDeposit = await Treasury.deposits(alice.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
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
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact / BigInt(1e14));
      expect(finalizeEventLog[3]).to.be.equal(true);
      let wonAmountAlice = parse18((3 * usdtAmount).toString());
      let newAliceDeposit = await Treasury.deposits(alice.address);
      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
    });

    it("should end bullseye game (3 players, same guesses)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessBobPrice);
      await Game.connect(alice).play(guessBobPrice);
      let oldBobDeposit = await Treasury.deposits(bob.address);
      let oldOpponentDeposit = await Treasury.deposits(opponent.address);
      let oldAliceDeposit = await Treasury.deposits(alice.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[4]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][1]).to.be.equal(opponent.address);
      expect(finalizeEventLog[0][2]).to.be.equal(alice.address);
      expect(finalizeEventLog[1][0]).to.be.equal(0);
      expect(finalizeEventLog[1][1]).to.be.equal(1);
      expect(finalizeEventLog[1][2]).to.be.equal(2);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact / BigInt(1e14));
      expect(finalizeEventLog[3]).to.be.equal(false);

      let wonAmountBob =
        (parse18((3 * usdtAmount).toString()) * (await Game.rates(0, 0))) /
        BigInt(10000);
      let wonAmountOpponent =
        (parse18((3 * usdtAmount).toString()) * (await Game.rates(0, 1))) /
        BigInt(10000);

      let newBobDeposit = await Treasury.deposits(bob.address);
      let newOpponentDeposit = await Treasury.deposits(opponent.address);
      let newAliceDeposit = await Treasury.deposits(alice.address);

      const withdrawnFeesBob =
        (wonAmountBob * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesOpponent =
        (wonAmountOpponent * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesBob + withdrawnFeesOpponent);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(
        wonAmountBob - withdrawnFeesBob
      );
      expect(newOpponentDeposit - oldOpponentDeposit).to.be.equal(
        wonAmountOpponent - withdrawnFeesOpponent
      );
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (6 players, exact)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessPriceAlice);
      let oldBobDeposit = await Treasury.deposits(bob.address);
      let oldOpponentDeposit = await Treasury.deposits(opponent.address);
      let oldAliceDeposit = await Treasury.deposits(alice.address);
      let oldOwnerDeposit = await Treasury.deposits(owner.address);
      let oldJohnDeposit = await Treasury.deposits(john.address);
      let oldMaxDeposit = await Treasury.deposits(max.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
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
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact / BigInt(1e14));
      expect(finalizeEventLog[3]).to.be.equal(true);

      let wonAmountAlice =
        (parse18((6 * usdtAmount).toString()) * (await Game.rates(3, 0))) /
        BigInt(10000);
      let wonAmountOwner =
        (parse18((6 * usdtAmount).toString()) * (await Game.rates(3, 1))) /
        BigInt(10000);

      let newBobDeposit = await Treasury.deposits(bob.address);
      let newOpponentDeposit = await Treasury.deposits(opponent.address);
      let newAliceDeposit = await Treasury.deposits(alice.address);
      let newOwnerDeposit = await Treasury.deposits(owner.address);
      let newJohnDeposit = await Treasury.deposits(john.address);
      let newMaxDeposit = await Treasury.deposits(max.address);

      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesOwner =
        (wonAmountOwner * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice + withdrawnFeesOwner);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(
        wonAmountOwner - withdrawnFeesOwner
      );
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldBobDeposit).to.be.equal(newBobDeposit);
    });

    it("should end bullseye game (6 players)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(bob).play(guessBobPrice);
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(owner).play(guessOwnerPrice);
      await Game.connect(john).play(guessJohnPrice);
      await Game.connect(max).play(guessMaxPrice);
      await Game.connect(alice).play(guessMaxPrice);
      let oldBobDeposit = await Treasury.deposits(bob.address);
      let oldOpponentDeposit = await Treasury.deposits(opponent.address);
      let oldAliceDeposit = await Treasury.deposits(alice.address);
      let oldOwnerDeposit = await Treasury.deposits(owner.address);
      let oldJohnDeposit = await Treasury.deposits(john.address);
      let oldMaxDeposit = await Treasury.deposits(max.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
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
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact / BigInt(1e14));
      expect(finalizeEventLog[3]).to.be.equal(false);

      let wonAmountBob =
        (parse18((6 * usdtAmount).toString()) * (await Game.rates(2, 1))) /
        BigInt(10000);
      let wonAmountOwner =
        (parse18((6 * usdtAmount).toString()) * (await Game.rates(2, 0))) /
        BigInt(10000);

      let newBobDeposit = await Treasury.deposits(bob.address);
      let newOpponentDeposit = await Treasury.deposits(opponent.address);
      let newAliceDeposit = await Treasury.deposits(alice.address);
      let newOwnerDeposit = await Treasury.deposits(owner.address);
      let newJohnDeposit = await Treasury.deposits(john.address);
      let newMaxDeposit = await Treasury.deposits(max.address);

      const withdrawnFeesBob =
        (wonAmountBob * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesOwner =
        (wonAmountOwner * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesOwner + withdrawnFeesBob);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(
        wonAmountBob - withdrawnFeesBob
      );
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(
        wonAmountOwner - withdrawnFeesOwner
      );
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (12 players)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
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
        await Game.connect(signers[i]).play(guessMaxPrice + i);
      }
      let oldBobDeposit = await Treasury.deposits(bob.address);
      let oldOpponentDeposit = await Treasury.deposits(opponent.address);
      let oldAliceDeposit = await Treasury.deposits(alice.address);
      let oldOwnerDeposit = await Treasury.deposits(owner.address);
      let oldJohnDeposit = await Treasury.deposits(john.address);
      let oldMaxDeposit = await Treasury.deposits(max.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[6]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact / BigInt(1e14));
      expect(finalizeEventLog[3]).to.be.equal(false);

      let wonAmountBob =
        (parse18((12 * usdtAmount).toString()) * (await Game.rates(4, 1))) /
        BigInt(10000);
      let wonAmountOwner =
        (parse18((12 * usdtAmount).toString()) * (await Game.rates(4, 0))) /
        BigInt(10000);
      let wonAmountOpponent =
        (parse18((12 * usdtAmount).toString()) * (await Game.rates(4, 2))) /
        BigInt(10000);

      let newBobDeposit = await Treasury.deposits(bob.address);
      let newOpponentDeposit = await Treasury.deposits(opponent.address);
      let newAliceDeposit = await Treasury.deposits(alice.address);
      let newOwnerDeposit = await Treasury.deposits(owner.address);
      let newJohnDeposit = await Treasury.deposits(john.address);
      let newMaxDeposit = await Treasury.deposits(max.address);

      const withdrawnFeesBob =
        (wonAmountBob * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesOwner =
        (wonAmountOwner * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesOpponent =
        (wonAmountOpponent * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(
        withdrawnFeesOpponent + withdrawnFeesOwner + withdrawnFeesBob
      );
      expect(newBobDeposit - oldBobDeposit).to.be.equal(
        wonAmountBob - withdrawnFeesBob
      );
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(
        wonAmountOwner - withdrawnFeesOwner
      );
      expect(newOpponentDeposit - oldOpponentDeposit).to.be.equal(
        wonAmountOpponent - withdrawnFeesOpponent
      );
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (12 players, exact)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
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
        await Game.connect(signers[i]).play(guessMaxPrice + i);
      }
      let oldBobDeposit = await Treasury.deposits(bob.address);
      let oldOpponentDeposit = await Treasury.deposits(opponent.address);
      let oldAliceDeposit = await Treasury.deposits(alice.address);
      let oldOwnerDeposit = await Treasury.deposits(owner.address);
      let oldJohnDeposit = await Treasury.deposits(john.address);
      let oldMaxDeposit = await Treasury.deposits(max.address);
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee();
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[6]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(5);
      expect(finalizeEventLog[1][1]).to.be.equal(2);
      expect(finalizeEventLog[1][2]).to.be.equal(0);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact / BigInt(1e14));
      expect(finalizeEventLog[3]).to.be.equal(true);

      let wonAmountBob =
        (parse18((12 * usdtAmount).toString()) * (await Game.rates(5, 2))) /
        BigInt(10000);
      let wonAmountOwner =
        (parse18((12 * usdtAmount).toString()) * (await Game.rates(5, 1))) /
        BigInt(10000);
      let wonAmountAlice =
        (parse18((12 * usdtAmount).toString()) * (await Game.rates(5, 0))) /
        BigInt(10000);

      let newBobDeposit = await Treasury.deposits(bob.address);
      let newOpponentDeposit = await Treasury.deposits(opponent.address);
      let newAliceDeposit = await Treasury.deposits(alice.address);
      let newOwnerDeposit = await Treasury.deposits(owner.address);
      let newJohnDeposit = await Treasury.deposits(john.address);
      let newMaxDeposit = await Treasury.deposits(max.address);

      const withdrawnFeesBob =
        (wonAmountBob * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesOwner =
        (wonAmountOwner * (await Game.fee())) / BigInt(10000);
      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);

      expect(
        (await Treasury.collectedFee()) - oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice + withdrawnFeesOwner + withdrawnFeesBob);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(
        wonAmountBob - withdrawnFeesBob
      );
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(
        wonAmountOwner - withdrawnFeesOwner
      );
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
    });
  });

  describe("Permit", async function () {
    it("should play with permit", async function () {
      let oldBalance = await USDT.balanceOf(owner.getAddress());
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );

      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );

      await Game.playWithPermit(guessPriceOpponent, {
        deadline: deadline,
        v: result.v,
        r: result.r,
        s: result.s,
      });
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
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

  it("should return player amount", async function () {
    expect(await Game.getTotalPlayers()).to.be.equal(0);
  });
});
