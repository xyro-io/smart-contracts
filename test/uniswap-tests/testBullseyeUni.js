const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("BullseyeUni Game", () => {
  before(async () => {
    [owner, bob, alice] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("UniswapV2Factory");
    UniFactory = await factory.deploy(owner.address);
    factory = await ethers.getContractFactory("UniswapV2Router02");
    UniRouter = await factory.deploy(UniFactory.address, UniFactory.address);
    factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    XyroToken = await factory.deploy(parse18("5000"));
    ETH = await factory.deploy(parse18("10000000000000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address, XyroToken.address);
    factory = await ethers.getContractFactory("BullseyeGameUni");
    Game = await factory.deploy();
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
    assetPrice = parse18((reserves[0] / reserves[1]).toString());
    await Treasury.setFee(100);
    await Game.setTreasury(Treasury.address);
    await Treasury.grantRole(await Treasury.DISTRIBUTOR_ROLE(), Game.address);
    await USDT.mint(bob.address, parse18("10000000"));
    await USDT.mint(alice.address, parse18("10000000"));
    await USDT.approve(Treasury.address, parse18("10000000"));
  });

  it("should create bullseye uniswap game", async function () {
    await USDT.approve(Treasury.address, ethers.constants.MaxUint256);
    await Game.startGame(
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      parse18("100"),
      USDT.address,
      ETH.address
    );
    let bet = await Game.game();
    expect(bet.betAmount).to.equal(parse18("100"));
  });

  it("should bet", async function () {
    await USDT.connect(bob).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(bob).bet(assetPrice.div(100).mul(105));
    expect(await USDT.balanceOf(Treasury.address)).to.equal(parse18("100"));
  });

  it("should bet", async function () {
    await USDT.connect(alice).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(alice).bet(assetPrice.div(100).mul(95));
    expect(await USDT.balanceOf(Treasury.address)).to.equal(parse18("200"));
  });

  it("should end setup game", async function () {
    for (i = 0; i < 10; i++) {
      await UniRouter.swapExactTokensForTokens(
        parse18("20000"),
        0,
        [USDT.address, ETH.address],
        owner.address,
        ethers.constants.MaxUint256
      );
    }
    oldBalance = await USDT.balanceOf(alice.address);
    await helpers.time.increase(2700);
    await Game.endGame(UniFactory.address);
    newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
