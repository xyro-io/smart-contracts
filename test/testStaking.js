const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("Staking", () => {
  before(async () => {
    [owner] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("XyroToken");
    XyroToken = await factory.deploy(parse18("1000000000"));
    factory = await ethers.getContractFactory("XyroStaking");
    let rate = 125;
    Staking = await factory.deploy(XyroToken.address, rate);
    await XyroToken.approve(Staking.address, ethers.constants.MaxUint256);
    await XyroToken.transfer(Staking.address, parse18("100000"));
  });

  it("should stake", async function () {
    await Staking.stake(parse18("100"));
    expect(await Staking.stakedBalance(owner.address)).to.be.above(0);
  });

  it("should get some tokens", async function () {
    let oldBalance = await XyroToken.balanceOf(owner.address);
    await helpers.time.increase(2629743); //4 weeks
    expect(await Staking.earned(owner.address)).to.be.above(0);
    await Staking.unstake(parse18("100"));
    let newBalance = await XyroToken.balanceOf(owner.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
