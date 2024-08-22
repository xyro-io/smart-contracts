import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Treasury__factory } from "../typechain-types/factories/contracts/Treasury.sol/Treasury__factory";
import { OneVsOneExactPrice } from "../typechain-types/contracts/OneVsOneExactPrice";
import { OneVsOneExactPrice__factory } from "../typechain-types/factories/contracts/OneVsOneExactPrice__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
const parse18 = ethers.parseEther;
const insufficentDepositAmount = "Insufficent deposit amount";
const invalidRole = "Invalid role";

describe("Treasury", () => {
  let mockContract: HardhatEthersSigner;
  let mockDAO: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: OneVsOneExactPrice;
  let Upkeep: MockVerifier;
  const depositAmount = 100;
  before(async () => {
    [owner, mockContract, alice, mockDAO] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    await USDT.mint(alice.address, parse18("100000"));
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("2500"));
    await XyroToken.mint(alice.address, parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new OneVsOneExactPrice__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Treasury.setFee(100);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      mockContract.address
    );
    await Treasury.grantRole(await Treasury.DAO_ROLE(), mockDAO.address);
    await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
  });

  it("Should set token", async function () {
    const newToken = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    await Treasury.setToken(await newToken.getAddress());
    expect(await Treasury.approvedToken()).to.be.equal(
      await newToken.getAddress()
    );
    await Treasury.setToken(await USDT.getAddress());
    expect(await Treasury.approvedToken()).to.be.equal(await USDT.getAddress());
  });

  it("Should fail - set token", async function () {
    const newToken = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    await expect(
      Treasury.connect(alice).setToken(await newToken.getAddress())
    ).to.be.revertedWithCustomError(
      Treasury,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("Should set fee by admin", async function () {
    const newFee = 105;
    await Treasury.setFee(newFee);
    expect(await Treasury.fee()).to.be.equal(newFee);
  });

  it("Should set fee by DAO", async function () {
    const oldFee = 100;
    await Treasury.connect(mockDAO).setFee(oldFee);
    expect(await Treasury.fee()).to.be.equal(oldFee);
  });

  it("Should fail - set fee", async function () {
    const newFee = 105;
    await expect(Treasury.connect(alice).setFee(newFee)).to.be.revertedWith(
      invalidRole
    );
  });

  it("Should set Setup fee by admin", async function () {
    const newFee = 105;
    await Treasury.setSetupFee(newFee);
    expect(await Treasury.setupInitiatorFee()).to.be.equal(newFee);
  });

  it("Should set Setup fee by DAO", async function () {
    const oldFee = 100;
    await Treasury.connect(mockDAO).setSetupFee(oldFee);
    expect(await Treasury.setupInitiatorFee()).to.be.equal(oldFee);
  });

  it("Should fail - set Setup fee", async function () {
    const newFee = 105;
    await expect(
      Treasury.connect(alice).setSetupFee(newFee)
    ).to.be.revertedWith(invalidRole);
  });

  it("Should deposit", async function () {
    expect(await Treasury.deposits(alice.address)).to.be.equal(0);
    await Treasury.connect(alice).deposit(depositAmount);
    expect(await Treasury.deposits(alice.address)).to.be.equal(
      parse18(depositAmount.toString())
    );
  });

  it("Should deposit and lock", async function () {
    expect(await Treasury.locked(alice.address)).to.be.equal(0);
    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      alice.address
    );
    expect(await Treasury.locked(alice.address)).to.be.equal(
      parse18(depositAmount.toString())
    );
  });

  it("Should deposit with permit", async function () {});

  it("Should deposit and lock with permit", async function () {});

  it("Should withdraw", async function () {
    const oldBalance = await USDT.balanceOf(alice.address);
    await Treasury.connect(alice).withdraw();
    const newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance - oldBalance).to.be.equal(
      parse18(depositAmount.toString())
    );
  });

  it("Should lock", async function () {
    const oldLockedBalance = await Treasury.locked(alice.address);
    await Treasury.connect(alice).deposit(depositAmount);
    await Treasury.connect(mockContract).lock(depositAmount, alice.address);
    const newLockedBalance = await Treasury.locked(alice.address);
    expect(newLockedBalance - oldLockedBalance).to.be.equal(
      parse18(depositAmount.toString())
    );
  });

  it("Should fail - not enough deposited tokens", async function () {
    await expect(
      Treasury.connect(mockContract).lock(depositAmount, alice.address)
    ).to.be.revertedWith(insufficentDepositAmount);
  });

  it("Should refund", async function () {
    const oldDepositBalance = await Treasury.deposits(alice.address);
    await Treasury.connect(mockContract).refund(depositAmount, alice.address);
    const newDepositBalance = await Treasury.deposits(alice.address);
    expect(newDepositBalance).to.be.above(oldDepositBalance);
  });

  it("Should distribute", async function () {
    const oldDepositBalance = await Treasury.deposits(alice.address);
    const oldFeeBalance = await Treasury.collectedFee();
    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      owner.address
    );

    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      alice.address
    );

    const gameFee = 100;

    await Treasury.connect(mockContract).distribute(
      depositAmount * 2, //won amount
      alice.address,
      depositAmount,
      gameFee
    );
    const newDepositBalance = await Treasury.deposits(alice.address);
    const newFeeBalance = await Treasury.collectedFee();
    expect(newDepositBalance).to.be.above(oldDepositBalance);
    expect(newFeeBalance).to.be.above(oldFeeBalance);
  });

  it("Should distribute without fee", async function () {
    const oldDepositBalance = await Treasury.deposits(alice.address);
    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      owner.address
    );

    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      alice.address
    );

    const rate = 10000;

    await Treasury.connect(mockContract).distributeWithoutFee(
      rate, //won amount
      alice.address,
      depositAmount
    );
    const newDepositBalance = await Treasury.deposits(alice.address);
    expect(newDepositBalance).to.be.above(oldDepositBalance);
  });

  it("Should withdraw collected fees", async function () {
    const collectedFees = await Treasury.collectedFee();
    const oldOwnerBalance = await USDT.balanceOf(owner.address);
    await Treasury.withdrawFees(owner.address);
    const newOwnerBalance = await USDT.balanceOf(owner.address);
    expect(newOwnerBalance - oldOwnerBalance).to.be.equal(collectedFees);
  });

  it("Should calculate Setup rate", async function () {});

  it("Should calculate UpDown rate", async function () {});

  it("Should get rakeback amount", async function () {
    expect(await Treasury.earnedRakeback(alice.address)).to.be.above(0);
  });

  it("Should withdraw rakeback", async function () {
    const oldXyroBalance = await XyroToken.balanceOf(alice.address);
    const rakebackAmount = await Treasury.earnedRakeback(alice.address);
    await Treasury.connect(alice).withdrawRakeback(rakebackAmount);
    const newXyroBalance = await XyroToken.balanceOf(alice.address);
    expect(newXyroBalance - oldXyroBalance).to.be.equal(rakebackAmount);
  });

  it("Should get commission cut", async function () {
    expect(await Treasury.getCommissionCut(owner.address)).to.be.equal(1000);
  });

  it("Should set new upkeep", async function () {
    const newUpkeep = await new MockVerifier__factory(owner).deploy();
    await Treasury.setUpkeep(await newUpkeep.getAddress());
    expect(await Treasury.upkeep()).to.be.equal(await newUpkeep.getAddress());
  });
});
