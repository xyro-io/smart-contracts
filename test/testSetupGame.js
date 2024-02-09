const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("Setup Game", () => {
  before(async () => {
    [owner, bob, alice] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    factory = await ethers.getContractFactory("MockToken");
    XyroToken = await factory.deploy(parse18("5000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address, XyroToken.address);
    factory = await ethers.getContractFactory("GameFactory");
    GameFactory = await factory.deploy(Treasury.address);
    assetPrice = parse18("2310");
    await Treasury.setFee(100);
    await USDT.mint(bob.address, parse18("10000000"));
    await USDT.mint(alice.address, parse18("10000000"));
    await USDT.approve(Treasury.address, parse18("10000000"));
  });

  it("should create SL setup game", async function () {
    await GameFactory.createSetupGame(
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      assetPrice.div(100).mul(103),
      assetPrice.div(100).mul(97),
      parse18("100"),
      true
    );
    factory = await ethers.getContractFactory("SetupGame");
    Game = await factory.attach(await GameFactory.games(0));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await GameFactory.games(0)
    );
    let bet = await Game.game();
    console.log(bet.initiator);
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should set asset price", async function () {
    await Game.setStartingPrice(assetPrice);
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(2);
  });

  it("should create SL bet", async function () {
    await USDT.connect(bob).approve(Treasury.address, parse18("10000000"));
    await Game.connect(bob).bet(true, parse18("100"));
    let bet = await Game.game();
    expect(bet.totalBetsSL).to.equal(parse18("200"));
  });

  it("should create TP bet", async function () {
    await USDT.connect(alice).approve(Treasury.address, parse18("10000000"));
    await Game.connect(alice).bet(false, parse18("300"));
    let bet = await Game.game();
    expect(bet.totalBetsTP).to.equal(parse18("300"));
  });

  it("should end setup game", async function () {
    oldBalance = await USDT.balanceOf(bob.address);
    console.log(oldBalance / Math.pow(10, 18));
    await helpers.time.increase(2700);
    await Game.endGame(assetPrice.div(100).mul(95));
    newBalance = await USDT.balanceOf(bob.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create TP setup game", async function () {
    await GameFactory.createSetupGame(
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      assetPrice.div(100).mul(107),
      assetPrice.div(100).mul(90),
      parse18("100"),
      false
    );
    factory = await ethers.getContractFactory("SetupGame");
    Game = await factory.attach(await GameFactory.games(1));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await GameFactory.games(1)
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
    await USDT.connect(bob).approve(Treasury.address, parse18("10000000"));
    await Game.connect(bob).bet(true, parse18("500"));
    let bet = await Game.game();
    expect(bet.totalBetsSL).to.equal(parse18("500"));
  });

  it("should create TP bet", async function () {
    await USDT.connect(alice).approve(Treasury.address, parse18("10000000"));
    await Game.connect(alice).bet(false, parse18("125"));
    let bet = await Game.game();
    expect(bet.totalBetsTP).to.equal(parse18("225"));
  });

  it("should end setup game", async function () {
    oldBalance = await USDT.balanceOf(alice.address);
    console.log(oldBalance / Math.pow(10, 18));
    await helpers.time.increase(2700);
    await Game.endGame(assetPrice.div(100).mul(120));
    newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
