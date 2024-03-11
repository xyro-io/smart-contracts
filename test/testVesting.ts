import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { XyroVesting } from "../typechain-types/contracts/Vesting.sol";
import { XyroVesting__factory } from "../typechain-types/factories/contracts/Vesting.sol/XyroVesting__factory";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
const parse18 = ethers.parseEther;

describe("Vesting", () => {
  let Vesting: XyroVesting;
  let XyroToken: XyroToken;
  let owner: HardhatEthersSigner;
  before(async () => {
    [owner] = await ethers.getSigners();
    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
    const vestingAmount = parse18((5e7).toString());
    const vestingTime = 2629743; // 1 month;
    Vesting = await new XyroVesting__factory(owner).deploy(
      owner.address,
      (await time.latest()) + 10,
      vestingTime,
      vestingAmount,
      await XyroToken.getAddress()
    );

    await XyroToken.approve(await Vesting.getAddress(), ethers.MaxUint256);
    await XyroToken.transfer(await Vesting.getAddress(), vestingAmount);
  });

  it("shouldn't releast tokens if nothing vested", async function () {
    await expect(Vesting.release()).to.be.revertedWith("No tokens to release");
  });

  it("should get some tokens", async function () {
    let oldBalance = await XyroToken.balanceOf(owner.address);
    await time.increase(604800);
    await Vesting.release();
    let newBalance = await XyroToken.balanceOf(owner.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
