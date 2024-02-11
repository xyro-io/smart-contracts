const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("UpDownModeUniswap", () => {
  before(async () => {
    [owner, opponent] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    XyroToken = await factory.deploy(parse18("5000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address, XyroToken.address);
    factory = await ethers.getContractFactory("GameFactory");
    GameFactory = await factory.deploy(Treasury.address);
    assetPrice = parse18("2310");
    await Treasury.setFee(100);
    await USDT.mint(opponent.address, parse18("10000000"));
  });

  it("should create exact price bet", async function () {
    await USDT.approve(Treasury.address, ethers.constants.MaxUint256);
    await GameFactory.createExactPriceGame(
      opponent.address,
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      assetPrice.div(100).mul(123),
      parse18("100")
    );
    factory = await ethers.getContractFactory("OneVsOneGameExactPrice");
    Game = await factory.attach(await GameFactory.games(0));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await GameFactory.games(0)
    );
    let bet = await Game.game();
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should accept exact price mode bet", async function () {
    await USDT.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).acceptBet(assetPrice.div(100).mul(105));
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(2);
  });

  it("should end exact price game", async function () {
    oldBalance = await USDT.balanceOf(opponent.address);
    await helpers.time.increase(2700);
    await Game.endGame(assetPrice.div(100).mul(95));
    newBalance = await USDT.balanceOf(opponent.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
