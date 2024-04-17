import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { XyroStaking } from "../typechain-types/contracts/Staking.sol/XyroStaking";
import { XyroStaking__factory } from "../typechain-types/factories/contracts/Staking.sol/XyroStaking__factory";
import { XyroGovernanceToken } from "../typechain-types/contracts/XyroVotingToken.sol/XyroGovernanceToken";
import { XyroGovernanceToken__factory } from "../typechain-types/factories/contracts/XyroVotingToken.sol/XyroGovernanceToken__factory";
const parse18 = ethers.parseEther;

describe("Staking", () => {
  let owner: HardhatEthersSigner;
  let XyroToken: XyroToken;
  let Staking: XyroStaking;
  let GovernanceToken: XyroGovernanceToken;
  const day = 86400;
  before(async () => {
    [owner] = await ethers.getSigners();

    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );

    GovernanceToken = await new XyroGovernanceToken__factory(owner).deploy();
    Staking = await new XyroStaking__factory(owner).deploy(
      await XyroToken.getAddress(),
      GovernanceToken.getAddress()
    );
    await XyroToken.approve(await Staking.getAddress(), ethers.MaxUint256);
    await XyroToken.transfer(await Staking.getAddress(), parse18("100000"));
  });

  it("should stake & get governance tokens", async function () {
    let oldBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    await Staking.stake(parse18("100"), 30 * day);
    expect(await Staking.stakedBalance()).to.be.above(0);
    let newBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    expect(newBalanceGov).to.be.above(oldBalanceGov);
  });

  it("should unstake tokens and get reward", async function () {
    let oldBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    let oldBalance = await XyroToken.balanceOf(owner.address);
    await time.increase(31 * day);
    expect(await Staking.earned(0)).to.be.above(0);
    await Staking.unstake(0);
    let newBalance = await XyroToken.balanceOf(owner.address);
    let newBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    expect(newBalance - oldBalance).to.be.equal(parse18("125"));
    expect(oldBalanceGov).to.be.above(newBalanceGov);
  });
});
