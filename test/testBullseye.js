const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("BullseyeGame", () => {
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("MockToken");
    USDT = await factory.deploy(parse18("10000000000000"));
    XyroToken = await factory.deploy(parse18("5000"));
    factory = await ethers.getContractFactory("Treasury");
    Treasury = await factory.deploy(USDT.address, XyroToken.address);
    factory = await ethers.getContractFactory("BullseyeGame");
    Game = await factory.deploy();
    assetPrice = parse18("2310");
    await Game.setTreasury(Treasury.address);
    await Treasury.setFee(100);
    await USDT.mint(opponent.address, parse18("10000000"));
    await USDT.mint(alice.address, parse18("10000000"));
    await Treasury.grantRole(await Treasury.DISTRIBUTOR_ROLE(), Game.address);
  });

  it("should create bullseye game", async function () {
    await USDT.approve(Treasury.address, ethers.constants.MaxUint256);
    await Game.startGame(
      await helpers.time.latest(),
      (await helpers.time.latest()) + 2700,
      parse18("100")
    );
    let bet = await Game.game();
    expect(bet.betAmount).to.equal(parse18("100"));
  });

  it("should bet", async function () {
    await USDT.connect(opponent).approve(
      Treasury.address,
      ethers.constants.MaxUint256
    );
    await Game.connect(opponent).bet(assetPrice.div(100).mul(105));
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

  it("should end bullseye game", async function () {
    oldBalance = await USDT.balanceOf(alice.address);
    await helpers.time.increase(2700);
    await Game.endGame(assetPrice.div(100).mul(95));
    newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
