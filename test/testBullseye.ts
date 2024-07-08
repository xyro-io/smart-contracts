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
import { Bullseye } from "../typechain-types/contracts/Bullseye";
import { Bullseye__factory } from "../typechain-types/factories/contracts/Bullseye__factory";
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
const requireOnTime = "Too early";
const requireMoreThanZeroPlayers = "Not enough players";
const requireValidChainlinkReport = "Old chainlink report";
const requireStartedGame = "Start the game first";
const requirePastEndTime = "Too early to finish";
const requireStartingPrice = "Starting price must be set";
const requireNewPlayer = "You are already in the game";

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
  const feedId = 4;
  const usdtAmount = 100;
  const assetPrice = 600000000;
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
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new Bullseye__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Treasury.setFee(100);
    await USDT.mint(await opponent.getAddress(), parse18("10000000"));
    await USDT.mint(await alice.getAddress(), parse18("10000000"));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
  });

  it("should create bullseye game", async function () {
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      4
    );
    let game = await Game.decodeData();
    expect(game.depositAmount).to.equal(usdtAmount);
  });

  it("should participate high asset guess price", async function () {
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).play(guessPriceOpponent);
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18("100")
    );
  });

  it("should participate low asset guess price", async function () {
    await USDT.connect(alice).approve(Treasury.getAddress(), ethers.MaxUint256);
    await Game.connect(alice).play(guessPriceAlice);
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18("200")
    );
  });

  it("should end bullseye game", async function () {
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceExact.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should cancel game", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      feedId
    );
    const finalPrice = abiEncodeInt192WithTimestamp(
      finalPriceExact.toString(),
      feedId,
      await time.latest()
    );
    await time.increase(fortyFiveMinutes);
    await expect(Game.finalizeGame(finalPrice)).to.emit(
      Game,
      "BullseyeCancelled"
    );
  });

  it("should fail - game not started", async function () {
    await expect(
      Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireStartedGame);
  });

  it("should fail - start new game without finishing previous", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      feedId
    );
    await expect(
      Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedId
      )
    ).to.be.revertedWith(requireFinishedGame);
  });

  it("should fail - play after time is up", async function () {
    await time.increase(fifteenMinutes);
    await expect(Game.connect(alice).play(guessPriceAlice)).to.be.revertedWith(
      requireOpenedGame
    );
    await Game.closeGame();
  });

  it("should fail - too early to finish", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      feedId
    );

    await expect(
      Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requirePastEndTime);
  });

  it("should fail - already participating", async function () {
    await Game.connect(alice).play(guessPriceAlice);
    await expect(Game.connect(alice).play(guessPriceAlice)).to.be.revertedWith(
      requireNewPlayer
    );
  });

  it("should close game and refund (finalzieGame)", async function () {
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(fortyFiveMinutes);
    await expect(
      Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.emit(Game, "BullseyeCancelled");
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should close game and refund (closeGame)", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      feedId
    );
    await Game.connect(alice).play(guessPriceAlice);
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(fortyFiveMinutes);
    await expect(Game.closeGame()).to.emit(Game, "BullseyeCancelled");
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should finish game with 2 players", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      feedId
    );
    await Game.connect(opponent).play(guessPriceOpponent);
    await Game.connect(alice).play(guessPriceAlice);
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceCloser.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should play with permit", async function () {
    let oldBalance = await USDT.balanceOf(owner.getAddress());
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      usdtAmount,
      feedId
    );

    const deadline = (await time.latest()) + fortyFiveMinutes;
    let result = await getPermitSignature(
      owner,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );

    await Game.playWithPermit(guessPriceOpponent, {
      deadline: deadline,
      v: result.v,
      r: result.r,
      s: result.s,
    });
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(oldBalance).to.be.above(newBalance);
  });

  it("should finish game with 3+ players", async function () {
    await Game.connect(opponent).play(guessPriceOpponent);
    await Game.connect(alice).play(guessPriceAlice);
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceCloser.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should return player amount", async function () {
    expect(await Game.getTotalPlayers()).to.be.equal(0);
  });
});
