const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("ExactPriceModeUniswap", () => {
  before(async () => {
    [owner, opponent] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("UniswapV2Factory");
    UniFactory = await factory.deploy(owner.address);
    factory = await ethers.getContractFactory("UniswapV2Router02");
    UniRouter = await factory.deploy(UniFactory.address, UniFactory.address);
    factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    factory = await ethers.getContractFactory("MockToken");
    ETH = await factory.deploy(parse18("10000000000000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address);
    factory = await ethers.getContractFactory("GameFactory");
    GameFactory = await factory.deploy(Treasury.address);

    await USDT.mint(opponent.address, parse18("10000000"));
    await Treasury.setFee(100);
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
    // console.log(
    //   (await Game.getTokenPrice(
    //     ETH.address,
    //     USDT.address,
    //     UniFactory.address
    //   )) / Math.pow(10, 18)
    // );
  });

  it("should create updown bet", async function () {
    await USDT.approve(Treasury.address, ethers.constants.MaxUint256);
    await GameFactory.createUpDownGame(
      opponent.address,
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      false,
      parse18("100"),
      UniFactory.address,
      USDT.address,
      ETH.address
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

  it("should accept updown mode bet", async function () {
    await USDT.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).acceptBet();
    let bet = await Game.game();
    expect(bet.gameStatus).to.equal(2);
  });

  it("should end updown game", async function () {
    //price change
    await UniRouter.swapExactTokensForTokens(
      parse18("200"),
      0,
      [ETH.address, USDT.address],
      owner.address,
      ethers.constants.MaxUint256
    );
    oldBalance = await USDT.balanceOf(opponent.address);
    await helpers.time.increase(2700);
    await Game.endGame(UniFactory.address);
    newBalance = await USDT.balanceOf(opponent.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});