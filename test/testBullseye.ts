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
const requireNewPlayer = "You are already in the game";
const requireSufficentDepositAmount = "Insufficent deposit amount";

describe("Bullseye", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: Bullseye;
  let Upkeep: MockVerifier;
  const feedNumber = 4;
  const usdtAmount = 100;
  const guessPriceOpponent = 630000000;
  const guessPriceAlice = 580000000;
  const guessBobPrice = 570000000;
  const finalPriceExact = parse18("58000");
  const finalPriceCloser = parse18("63500");
  before(async () => {
    [owner, opponent, alice, bob] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("1255000"));
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
      await Game.connect(opponent).play(guessPriceOpponent);
      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
        parse18(usdtAmount.toString())
      );
      const playerGuessData = await Game.decodeGuess(0);
      expect(playerGuessData.player).to.be.equal(opponent.address);
      expect(playerGuessData.assetPrice).to.be.equal(guessPriceOpponent);
    });

    it("should play with deposited amount", async function () {
      await Treasury.connect(alice).deposit(usdtAmount);
      await Game.connect(alice).playWithDeposit(guessPriceAlice);
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
    });
    it("should close game and refund (finalzieGame)", async function () {
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

    it("should finish game with 2 players (exact price)", async function () {
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
        (parse18((2 * usdtAmount).toString()) *
          (await Game.twoPlayersRate(1))) /
        BigInt(10000);
      const withdrawnFeesAlice =
        (wonAmountAlice * (await Game.fee())) / BigInt(10000);

      const wonAmountOpponent =
        (parse18((2 * usdtAmount).toString()) *
          (await Game.twoPlayersRate(0))) /
        BigInt(10000);
      const withdrawnFeesOpponent =
        (wonAmountOpponent * (await Game.fee())) / BigInt(10000);

      expect(newAliceBalance - oldAliceBalance).to.be.equal(
        wonAmountAlice - withdrawnFeesAlice
      );
      expect(newOpponentBalance - oldOpponentBalance).to.be.equal(
        wonAmountOpponent - withdrawnFeesOpponent
      );
    });

    it("should end bullseye game", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber
      );
      await Game.connect(opponent).play(guessPriceOpponent);
      await Game.connect(alice).play(guessPriceAlice);
      await Game.connect(bob).play(guessBobPrice);
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await Treasury.connect(alice).withdraw(
        (await Treasury.deposits(alice.address)) / BigInt(Math.pow(10, 18))
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.above(oldBalance);
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

  it("should change exact rate", async function () {
    const newRange = 10000;
    const oldRange = 100;
    expect(await Game.exactRange()).to.be.equal(oldRange);
    await Game.setExactRange(newRange);
    expect(await Game.exactRange()).to.be.equal(newRange);
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
