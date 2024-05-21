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
import { SetupsGameFactory } from "../typechain-types/contracts/SetupsGameFactory.sol/SetupsGameFactory";
import { SetupsGameFactory__factory } from "../typechain-types/factories/contracts/SetupsGameFactory.sol/SetupsGameFactory__factory";
import { Setups } from "../typechain-types/contracts/Setups";
import { Setups__factory } from "../typechain-types/factories/contracts/Setups__factory";
import { MockUpkeep } from "../typechain-types/contracts/MockUpkeep";
import { MockUpkeep__factory } from "../typechain-types/factories/contracts/MockUpkeep__factory";
import { abiEncodeInt192 } from "../scripts/helper";
const parse18 = ethers.parseEther;

describe("Setup Game", () => {
  let owner: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: Setups;
  let Factory: SetupsGameFactory;
  let Upkeep: MockUpkeep;
  const feedId = "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
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
    Factory = await new SetupsGameFactory__factory(owner).deploy(
      Treasury.getAddress()
    );
    Upkeep = await new MockUpkeep__factory(owner).deploy();
    await Treasury.setFee(100);
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await USDT.mint(bob.address, parse18("1000"));
    await USDT.mint(alice.address, parse18("1000"));
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
  });

  it("should create SL setup game", async function () {
    await Factory.createSetups(
      await time.latest(),
      (await time.latest()) + 2700,
      (assetPrice / BigInt(100)) * BigInt(103),
      (assetPrice / BigInt(100)) * BigInt(97),
      true,
      feedId,
    );
    let gameAddress = await Factory.games(0);
    Game = Setups__factory.connect(gameAddress, owner);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Factory.games(0)
    );
    let bet = await Game.game();
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should create SL bet", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(bob).play(true, parse18("100"));
    let bet = await Game.game();
    expect(bet.totalDepositsSL).to.equal(parse18("100"));
  });

  it("should create TP bet", async function () {
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(alice).play(false, parse18("300"));
    let bet = await Game.game();
    expect(bet.totalDepositsTP).to.equal(parse18("300"));
  });

  it("should end setup game", async function () {
    let oldBalance = await USDT.balanceOf(bob.address);
    await time.increase(2700);
    await Game.finalizeGame(
      abiEncodeInt192(((assetPrice / BigInt(100)) * BigInt(95)).toString(),feedId)
    );
    let newBalance = await USDT.balanceOf(bob.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create TP setup game", async function () {
    await Factory.createSetups(
      await time.latest(),
      (await time.latest()) + 2700,
      (assetPrice / BigInt(100)) * BigInt(107),
      (assetPrice / BigInt(100)) * BigInt(90),
      false,
      feedId,
    );
    Game = Game = Setups__factory.connect(await Factory.games(1), owner);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Factory.games(1)
    );
    let bet = await Game.game();
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should create SL bet", async function () {
    await USDT.connect(bob).approve(
      await Treasury.getAddress(),
      parse18("10000000")
    );
    await Game.connect(bob).play(true, parse18("500"));
    let bet = await Game.game();
    expect(bet.totalDepositsSL).to.equal(parse18("500"));
  });

  it("should create TP bet", async function () {
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      parse18("10000000")
    );
    await Game.connect(alice).play(false, parse18("125"));
    let bet = await Game.game();
    expect(bet.totalDepositsTP).to.equal(parse18("125"));
  });

  it("should end setup game", async function () {
    let oldBalance = await USDT.balanceOf(alice.address);
    await time.increase(2700);
    await Game.finalizeGame(
      abiEncodeInt192(((assetPrice / BigInt(100)) * BigInt(120)).toString(),feedId)
    );
    let newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
