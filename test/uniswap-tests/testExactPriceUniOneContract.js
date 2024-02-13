const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("UpDownModeUniswap", () => {
  before(async () => {
    [owner, opponent] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("UniswapV2Factory");
    UniFactory = await factory.deploy(owner.address);
    factory = await ethers.getContractFactory("UniswapV2Router02");
    UniRouter = await factory.deploy(UniFactory.address, UniFactory.address);
    factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    XyroToken = await factory.deploy(parse18("5000"));
    ETH = await factory.deploy(parse18("10000000000000"));
    factory = await ethers.getContractFactory("OneVsOneGameExactPriceUni");
    Game = await factory.deploy();
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address, XyroToken.address);

    await USDT.mint(opponent.address, parse18("10000000"));
    await Treasury.grantRole(await Treasury.DISTRIBUTOR_ROLE(), Game.address);
    await Treasury.setFee(100);
    await Game.setTreasury(Treasury.address);
    await UniFactory.createPair(USDT.address, ETH.address);
    await USDT.approve(UniRouter.address, ethers.constants.MaxUint256);
    await ETH.approve(UniRouter.address, ethers.constants.MaxUint256);
    await UniRouter.addLiquidity(
      USDT.address,
      ETH.address,
      parse18("23080000"),
      parse18("10000"),
      parse18("23080000"),
      parse18("10000"),
      owner.address,
      ethers.constants.MaxUint256
    );
    factory = await ethers.getContractFactory("UniswapV2Pair");
    Pair = await factory.attach(
      await UniFactory.getPair(USDT.address, ETH.address)
    );
    reserves = await Pair.getReserves();
    assetPrice = await Game.getTokenPrice(
      ETH.address,
      USDT.address,
      UniFactory.address
    );
  });
  it("should swap", async function () {
    oldBalance = await USDT.balanceOf(owner.address);
    await UniRouter.swapExactTokensForTokens(
      parse18("2"),
      0,
      [ETH.address, USDT.address],
      owner.address,
      ethers.constants.MaxUint256
    );
    newBalance = await USDT.balanceOf(owner.address);
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create exact price bet", async function () {
    await USDT.approve(Treasury.address, ethers.constants.MaxUint256);
    await Game.createBet(
      opponent.address,
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      assetPrice.div(100).mul(123),
      parse18("100"),
      ETH.address,
      USDT.address
    );
    let bet = await Game.games(0);
    expect(bet.initiator).to.equal(owner.address);
    expect(bet.gameStatus).to.equal(0);
  });

  it("should accept exact price mode bet", async function () {
    await USDT.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).acceptBet(0, assetPrice.div(100).mul(105));
    let bet = await Game.games(0);
    expect(bet.gameStatus).to.equal(2);
  });

  it("should end exact price game", async function () {
    oldBalance = await USDT.balanceOf(opponent.address);
    await helpers.time.increase(2700);
    await Game.endGame(0, UniFactory.address);
    newBalance = await USDT.balanceOf(opponent.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
