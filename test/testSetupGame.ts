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
import { GameFactory } from "../typechain-types/contracts/GameFactory.sol/GameFactory";
import { GameFactory__factory } from "../typechain-types/factories/contracts/GameFactory.sol/GameFactory__factory";
import { SetupGame } from "../typechain-types/contracts/SetupGame";
import { SetupGame__factory } from "../typechain-types/factories/contracts/SetupGame__factory";
const parse18 = ethers.parseEther;

describe("Setup Game", () => {
  let owner: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: SetupGame;
  let Factory: GameFactory;
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
    Factory = await new GameFactory__factory(owner).deploy(
      Treasury.getAddress()
    );
    await Treasury.setFee(100);
    await USDT.mint(bob.address, parse18("1000"));
    await USDT.mint(alice.address, parse18("1000"));
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
  });

  it("should create SL setup game", async function () {
    await Factory.createSetupGame(
      await time.latest(),
      (await time.latest()) + 2700,
      (assetPrice / BigInt(100)) * BigInt(103),
      (assetPrice / BigInt(100)) * BigInt(97),
      parse18("100"),
      true
    );
    let gameAddress = await Factory.games(0);
    Game = SetupGame__factory.connect(gameAddress, owner);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Factory.games(0)
    );
    let bet = await Game.game();
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should set asset price", async function () {
    await Game.setStartingPrice(assetPrice);
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(2);
  });

  it("should create SL bet", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(bob).bet(true, parse18("100"));
    let bet = await Game.game();
    expect(bet.totalBetsSL).to.equal(parse18("200"));
  });

  it("should create TP bet", async function () {
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(alice).bet(false, parse18("300"));
    let bet = await Game.game();
    expect(bet.totalBetsTP).to.equal(parse18("300"));
  });

  it("should end setup game", async function () {
    let oldBalance = await USDT.balanceOf(bob.address);
    await time.increase(2700);
    await Game.finalizeGame((assetPrice / BigInt(100)) * BigInt(95));
    let newBalance = await USDT.balanceOf(bob.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create TP setup game", async function () {
    await Factory.createSetupGame(
      await time.latest(),
      (await time.latest()) + 2700,
      (assetPrice / BigInt(100)) * BigInt(107),
      (assetPrice / BigInt(100)) * BigInt(90),
      parse18("100"),
      false
    );
    Game = Game = SetupGame__factory.connect(await Factory.games(1), owner);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Factory.games(1)
    );
    let bet = await Game.game();
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should set asset price", async function () {
    await Game.setStartingPrice(assetPrice);
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(2);
  });

  it("should create SL bet", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      parse18("10000000")
    );
    await Game.connect(bob).bet(true, parse18("500"));
    let bet = await Game.game();
    expect(bet.totalBetsSL).to.equal(parse18("500"));
  });

  it("should create TP bet", async function () {
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      parse18("10000000")
    );
    await Game.connect(alice).bet(false, parse18("125"));
    let bet = await Game.game();
    expect(bet.totalBetsTP).to.equal(parse18("225"));
  });

  it("should end setup game", async function () {
    let oldBalance = await USDT.balanceOf(alice.address);
    await time.increase(2700);
    await Game.finalizeGame((assetPrice / BigInt(100)) * BigInt(120));
    let newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
