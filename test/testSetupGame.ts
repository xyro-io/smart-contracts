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
import { SetupsFactory } from "../typechain-types/contracts/SetupsFactory.sol";
import { SetupsFactory__factory } from "../typechain-types/factories/contracts/SetupsFactory.sol/SetupsFactory__factory";
import { Setups } from "../typechain-types/contracts/Setups";
import { Setups__factory } from "../typechain-types/factories/contracts/Setups__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import {
  abiEncodeInt192WithTimestamp,
  getPermitSignature,
} from "../scripts/helper";
import { extendEnvironment } from "hardhat/config";

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
  let Game: Setups;
  let Factory: SetupsFactory;
  let Upkeep: MockVerifier;
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
    Factory = await new SetupsFactory__factory(owner).deploy(
      Treasury.getAddress()
    );
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Treasury.setFee(100);
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await USDT.mint(bob.address, parse18("1000"));
    await USDT.mint(alice.address, parse18("1000"));
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await Treasury.grantRole(
      await Treasury.DEFAULT_ADMIN_ROLE(),
      await Factory.getAddress()
    );
  });

  it("should create SL setup game", async function () {
    await Factory.createSetups(
      (await time.latest()) + fortyFiveMinutes,
      tpPrice,
      slPrice,
      true,
      feedId
    );
    let gameAddress = await Factory.games(0);
    Game = Setups__factory.connect(gameAddress, owner);
    let game = await Game.game();
    expect(game.initiator).to.equal(owner.address);
    expect(game.gameStatus).to.equal(0);
  });

  it("should create SL game", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(bob).play(false, parse18("100"));
    let game = await Game.game();
    expect(game.totalDepositsSL).to.equal(parse18("100"));
  });

  it("should create TP game", async function () {
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(alice).play(true, parse18("300"));
    let game = await Game.game();
    expect(game.totalDepositsTP).to.equal(parse18("300"));
  });

  it("should end setup game", async function () {
    let oldBalance = await USDT.balanceOf(bob.address);
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceSL.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(bob.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create TP setup game", async function () {
    await Factory.createSetups(
      (await time.latest()) + fortyFiveMinutes,
      tpPrice,
      slPrice,
      false,
      feedId
    );
    Game = Setups__factory.connect(await Factory.games(1), owner);
    let game = await Game.game();
    expect(game.initiator).to.equal(owner.address);
    expect(game.gameStatus).to.equal(0);
  });

  it("should create SL game", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(bob).play(false, parse18("500"));
    let game = await Game.game();
    expect(game.totalDepositsSL).to.equal(parse18("500"));
  });

  it("should create TP game", async function () {
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(alice).play(true, parse18("125"));
    let game = await Game.game();
    expect(game.totalDepositsTP).to.equal(parse18("125"));
  });

  it("should end setup game", async function () {
    let oldBalance = await USDT.balanceOf(bob.address);
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceTP.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(bob.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should fail - high game duration", async function () {
    await expect(
      Factory.createSetups(
        (await time.latest()) + monthUnix * 12,
        tpPrice,
        slPrice,
        true,
        feedId
      )
    ).to.be.revertedWith(highGameDuration);
  });

  it("should fail - low game duration", async function () {
    await expect(
      Factory.createSetups(
        (await time.latest()) + fifteenMinutes,
        tpPrice,
        slPrice,
        true,
        feedId
      )
    ).to.be.revertedWith(lowGameDuration);
  });

  it("should close setup game", async function () {
    await Factory.createSetups(
      (await time.latest()) + fortyFiveMinutes,
      tpPrice,
      slPrice,
      false,
      feedId
    );
    Game = Setups__factory.connect(await Factory.games(2), owner);
    await time.increase(fortyFiveMinutes);
    await Game.closeGame();
    let game = await Game.game();
    expect(game.gameStatus).to.equal(1);
  });

  it("should play with permit", async function () {
    let oldTreasuryBalance = await USDT.balanceOf(await Treasury.getAddress());
    await Factory.createSetups(
      (await time.latest()) + fortyFiveMinutes,
      tpPrice,
      slPrice,
      false,
      feedId
    );
    const deadline = (await time.latest()) + fortyFiveMinutes;
    let ownerPermit = await getPermitSignature(
      owner,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    let alicePermit = await getPermitSignature(
      alice,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    Game = Setups__factory.connect(await Factory.games(3), owner);
    await Game.playWithPermit(false, parse18("100"), {
      deadline: deadline,
      v: ownerPermit.v,
      r: ownerPermit.r,
      s: ownerPermit.s,
    });
    await Game.connect(alice).playWithPermit(true, parse18("100"), {
      deadline: deadline,
      v: alicePermit.v,
      r: alicePermit.r,
      s: alicePermit.s,
    });
    let newTreasuryBalance = await USDT.balanceOf(await Treasury.getAddress());
    expect(newTreasuryBalance).to.be.above(oldTreasuryBalance);
  });

  it("should change treasury", async function () {
    let temporaryTreasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    await Factory.setTreasury(await temporaryTreasury.getAddress());
    expect(await Factory.treasury()).to.equal(
      await temporaryTreasury.getAddress()
    );
    //return treasury back
    await Factory.setTreasury(await Treasury.getAddress());
    expect(await Factory.treasury()).to.equal(await Treasury.getAddress());
  });

  it("should change min and max game duration", async function () {
    let min = await Factory.minDuration();
    let max = await Factory.maxDuration();

    //increase by 1 minute
    await Factory.changeGameDuration(max + BigInt(60), min + BigInt(60));
    expect(await Factory.minDuration()).to.equal(min + BigInt(60));
    expect(await Factory.maxDuration()).to.equal(max + BigInt(60));
  });
});
