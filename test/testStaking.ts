import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { XyroStaking } from "../typechain-types/contracts/Staking.sol/XyroStaking";
import { XyroStaking__factory } from "../typechain-types/factories/contracts/Staking.sol/XyroStaking__factory";
const parse18 = ethers.parseEther;

describe("Staking", () => {
  let owner: HardhatEthersSigner;
  let XyroToken: XyroToken;
  let Staking: XyroStaking;
  const rate = 125;
  before(async () => {
    [owner] = await ethers.getSigners();

    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
    Staking = await new XyroStaking__factory(owner).deploy(
      await XyroToken.getAddress(),
      rate
    );
    await XyroToken.approve(await Staking.getAddress(), ethers.MaxUint256);
    await XyroToken.transfer(await Staking.getAddress(), parse18("100000"));
  });

  it("should stake", async function () {
    await Staking.stake(parse18("100"));
    expect(await Staking.stakedBalance(owner.address)).to.be.above(0);
  });

  it("should get some tokens", async function () {
    let oldBalance = await XyroToken.balanceOf(owner.address);
    await time.increase(2629743); //4 weeks
    expect(await Staking.earned(owner.address)).to.be.above(0);
    await Staking.unstake(parse18("100"));
    let newBalance = await XyroToken.balanceOf(owner.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
