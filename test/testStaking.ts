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
  const rate = 125;
  before(async () => {
    [owner] = await ethers.getSigners();

    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );

    GovernanceToken = await new XyroGovernanceToken__factory(owner).deploy();
    Staking = await new XyroStaking__factory(owner).deploy(
      await XyroToken.getAddress(),
      rate,
      GovernanceToken.getAddress()
    );
    await XyroToken.approve(await Staking.getAddress(), ethers.MaxUint256);
    await XyroToken.transfer(await Staking.getAddress(), parse18("100000"));
  });

  it("should stake & get governance tokens", async function () {
    let oldBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    await Staking.stake(parse18("100"));
    expect(await Staking.stakedBalance(owner.address)).to.be.above(0);
    let newBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    expect(newBalanceGov).to.be.above(oldBalanceGov);
  });

  it("should get some tokens", async function () {
    let oldBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    let oldBalance = await XyroToken.balanceOf(owner.address);
    await time.increase(2629743); //4 weeks
    expect(await Staking.earned(owner.address)).to.be.above(0);
    await Staking.unstake(parse18("100"));
    let newBalance = await XyroToken.balanceOf(owner.address);
    let newBalanceGov = await GovernanceToken.balanceOf(
      await owner.getAddress()
    );
    expect(newBalance).to.be.above(oldBalance);
    expect(oldBalanceGov).to.be.above(newBalanceGov);
  });
});
