const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("OneVsOneGame", () => {
  before(async () => {
    [owner, opponent] = await ethers.getSigners();
    console.log("Owner - ", owner.address);
    console.log("Other - ", opponent.address);
    assetPrice = 172100685487713;
    //deploying
    let factory = await ethers.getContractFactory("OneVsOneGame");
    Game = await factory.deploy();
    factory = await ethers.getContractFactory("MockToken");
    Token = await factory.deploy(parse18("10000000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(Token.address);
    //setting up
    await Treasury.grantRole(await Treasury.DISTRIBUTOR_ROLE(), Game.address);
    await Treasury.setFee(100);
    await Game.setTreasury(Treasury.address);
    await Token.mint(opponent.address, parse18("10000000"));
  });

  it("should create exact price bet", async function () {
    await Token.approve(Treasury.address, ethers.constants.MaxUint256);
    await Game.createBet(
      opponent.address,
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      false,
      true,
      Math.floor(assetPrice * 1.23),
      parse18("100")
    );
    let bet = await Game.games(0);
    console.log(bet);
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(2);
  });

  it("should accept exact price mode bet", async function () {
    await Token.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).acceptBet(0, Math.floor(assetPrice * 1.05));
    let bet = await Game.games(0);
    expect(bet.gameStatus).to.equal(3);
  });

  it("should end exact price game", async function () {
    oldBalance = await Token.balanceOf(opponent.address);
    await helpers.time.increase(2700);
    await Game.endGame(0, Math.floor(assetPrice * 1.03));
    newBalance = await Token.balanceOf(opponent.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create updown bet", async function () {
    await Token.approve(Treasury.address, ethers.constants.MaxUint256);
    await Game.createBet(
      opponent.address,
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      true,
      true,
      Math.floor(assetPrice * 0.95),
      parse18("100")
    );
    let bet = await Game.games(1);
    expect(bet.initiator).to.equal(owner.address);
  });

  it("should set price", async function () {
    await Game.setStartingPrice(1, assetPrice);
    let bet = await Game.games(1);
    expect(bet.gameStatus).to.equal(2);
  });

  it("should accept updown bet", async function () {
    await Token.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).acceptBet(1, Math.floor(assetPrice * 1.05));
    let bet = await Game.games(1);
    expect(bet.gameStatus).to.equal(3);
  });

  it("should end updown game", async function () {
    oldBalance = await Token.balanceOf(owner.address);
    await helpers.time.increase(2700);
    await Game.endGame(1, Math.floor(assetPrice * 1.03));
    newBalance = await Token.balanceOf(owner.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
