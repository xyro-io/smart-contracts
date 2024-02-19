const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const parse18 = ethers.utils.parseEther;
const parse6 = (ether) => ethers.utils.parseUnits(ether, 6);

describe("Vesting", () => {
  before(async () => {
    [owner] = await ethers.getSigners();

    let factory = await ethers.getContractFactory("XyroToken");
    XyroToken = await factory.deploy(parse18("1000000000"));
    factory = await ethers.getContractFactory("XyroVesting");
    let vestingAmount = parse18("50000000");
    let vestingTime = 2629743; // 1 month;
    Vesting = await factory.deploy(
      owner.address,
      (await helpers.time.latest()) + 10,
      vestingTime,
      vestingAmount,
      XyroToken.address
    );

    await XyroToken.approve(Vesting.address, ethers.constants.MaxUint256);
    await XyroToken.transfer(Vesting.address, vestingAmount);
  });

  it("shouldn't releast tokens if nothing vested", async function () {
    await expect(Vesting.release()).to.be.revertedWith("No tokens to release");
  });

  it("should get some tokens", async function () {
    let oldBalance = await XyroToken.balanceOf(owner.address);
    await helpers.time.increase(604800);
    await Vesting.release();
    let newBalance = await XyroToken.balanceOf(owner.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
