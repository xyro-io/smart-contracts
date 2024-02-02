const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("ExactPriceModeUniswap", () => {
  before(async () => {
    [owner, opponent] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address);
    factory = await ethers.getContractFactory("GameFactory");
    GameFactory = await factory.deploy(Treasury.address);
    assetPrice = parse18("2310");
    await USDT.mint(opponent.address, parse18("10000000"));
    await Treasury.setFee(100);
  });

  it("should create updown bet", async function () {
    await USDT.approve(Treasury.address, ethers.constants.MaxUint256);
    await GameFactory.createUpDownGame(
      opponent.address,
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      false,
      parse18("100")
    );
    factory = await ethers.getContractFactory("OneVsOneGameUpDown");
    Game = await factory.attach(await GameFactory.games(0));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await GameFactory.games(0)
    );
    let bet = await Game.game();
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should set price", async function () {
    await Game.setStartingPrice(assetPrice);
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(1);
  });

  it("should accept updown mode bet", async function () {
    await USDT.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).acceptBet();
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(3);
  });

  it("should end updown game", async function () {
    oldBalance = await USDT.balanceOf(opponent.address);
    await helpers.time.increase(2700);
    await Game.endGame(assetPrice.div(100).mul(103));
    newBalance = await USDT.balanceOf(opponent.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
