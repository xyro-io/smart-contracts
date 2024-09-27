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
const zeroAddress = "Zero address";
const wrongDepositAmount = "Wrong deposit amount";
const wrongAmount = "Wrong amount";

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
  const DENOMINATOR = 10000;
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
    await Treasury.connect(alice).withdraw(depositAmount);
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
    const usedFee = 100;

    await Treasury.connect(mockContract).distributeWithoutFee(
      rate, //won amount
      alice.address,
      usedFee,
      depositAmount
    );
    const newDepositBalance = await Treasury.deposits(alice.address);
    expect(newDepositBalance).to.be.above(oldDepositBalance);
  });

  it("Should withdraw collected fees", async function () {
    const collectedFees = await Treasury.collectedFee();
    const oldOwnerBalance = await USDT.balanceOf(owner.address);
    await Treasury.withdrawFees(
      owner.address,
      collectedFees / BigInt(Math.pow(10, 18))
    );
    const newOwnerBalance = await USDT.balanceOf(owner.address);
    expect(newOwnerBalance - oldOwnerBalance).to.be.equal(collectedFees);
  });

  it("Should calculate Setup rate", async function () {
    const setupFee = 1000;
    const initiatorFee = await Treasury.setupInitiatorFee();
    const oldAliceDepositBalance = await Treasury.deposits(alice.address);
    const collectedFee =
      (parse18(depositAmount.toString()) * BigInt(setupFee)) /
      BigInt(DENOMINATOR);
    const oldFeeAmount = await Treasury.collectedFee();
    await Treasury.connect(mockContract).calculateSetupRate(
      depositAmount,
      depositAmount,
      setupFee,
      alice.address
    );
    const newAliceDepositBalance = await Treasury.deposits(alice.address);
    const initiatorFeeEarned =
      (parse18((depositAmount * 2).toString()) * BigInt(initiatorFee)) /
      BigInt(DENOMINATOR);
    expect(newAliceDepositBalance - oldAliceDepositBalance).to.be.equal(
      initiatorFeeEarned
    );
    const newFeeAmount = await Treasury.collectedFee();
    expect(newFeeAmount - oldFeeAmount).to.be.equal(collectedFee);
  });

  it("Should calculate UpDown rate", async function () {
    const updownFee = 1500;
    const collectedFee =
      (parse18((depositAmount * 2).toString()) * BigInt(updownFee)) /
      BigInt(DENOMINATOR);
    const oldFeeAmount = await Treasury.collectedFee();
    await Treasury.connect(mockContract).calculateUpDownRate(
      depositAmount,
      depositAmount,
      updownFee
    );
    const newFeeAmount = await Treasury.collectedFee();
    expect(newFeeAmount - oldFeeAmount).to.be.equal(collectedFee);
  });

  it("Should set new upkeep", async function () {
    const newUpkeep = await new MockVerifier__factory(owner).deploy();
    await Treasury.setUpkeep(await newUpkeep.getAddress());
    expect(await Treasury.upkeep()).to.be.equal(await newUpkeep.getAddress());
  });

  it("Should change deposit amount", async function () {
    const newDepositAmount = 1000;
    await Treasury.changeMinDepositAmount(newDepositAmount);
    expect(await Treasury.minDepositAmount()).to.be.equal(newDepositAmount);
  });

  it("Should fail - zero address", async function () {
    await expect(Treasury.setToken(ethers.ZeroAddress)).to.be.revertedWith(
      zeroAddress
    );
  });

  it("Should fail - wrong deposit amount", async function () {
    await expect(Treasury.deposit(100)).to.be.revertedWith(wrongDepositAmount);
  });

  it("Should fail - wrong amount refund", async function () {
    await expect(
      Treasury.connect(mockContract).refund(100000, alice.address)
    ).to.be.revertedWith(wrongAmount);
  });

  it("Should fail - wrong amount withdraw", async function () {
    await expect(Treasury.withdraw(100000)).to.be.revertedWith(wrongAmount);
  });

  it("Should fail - wrong amount refundWithFee", async function () {
    await expect(
      Treasury.connect(mockContract).refundWithFees(100000, alice.address, 100)
    ).to.be.revertedWith(wrongAmount);
  });

  it("Should fail - wrong amount withdrawFees", async function () {
    await expect(
      Treasury.withdrawFees(alice.address, 1000000)
    ).to.be.revertedWith(wrongAmount);
  });
});
