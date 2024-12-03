import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { OneVsOneExactPrice } from "../typechain-types/contracts/OneVsOneExactPrice";
import { OneVsOneExactPrice__factory } from "../typechain-types/factories/contracts/OneVsOneExactPrice__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
const parse18 = ethers.parseEther;
const insufficentDepositAmount = "Insufficent deposit amount";
const zeroAddress = "Zero address";
const wrongDepositAmount = "Wrong deposit amount";
const wrongAmount = "Wrong amount";

describe("Treasury", () => {
  let mockContract: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: OneVsOneExactPrice;
  let Upkeep: MockVerifier;
  const depositAmount = 100000000;
  before(async () => {
    [owner, mockContract, alice] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    await USDT.mint(alice.address, parse18("100000"));
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("2500"));
    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()]
    );
    Game = await new OneVsOneExactPrice__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      mockContract.address
    );
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
    await Treasury.setToken(await newToken.getAddress(), true);
    expect(
      await Treasury.approvedTokens(await newToken.getAddress())
    ).to.be.equal(true);
    await Treasury.setToken(await USDT.getAddress(), false);
    expect(await Treasury.approvedTokens(await USDT.getAddress())).to.be.equal(
      false
    );
    await Treasury.setToken(await USDT.getAddress(), true);
  });

  it("Should fail - set token", async function () {
    const newToken = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    await expect(
      Treasury.connect(alice).setToken(await newToken.getAddress(), true)
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

  it("Should fail - set Setup fee", async function () {
    const newFee = 105;
    await expect(
      Treasury.connect(alice).setSetupFee(newFee)
    ).to.be.revertedWithCustomError(
      Treasury,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("Should deposit", async function () {
    expect(
      await Treasury.deposits(await USDT.getAddress(), alice.address)
    ).to.be.equal(0);
    await Treasury.connect(alice).deposit(
      depositAmount,
      await USDT.getAddress()
    );
    expect(
      await Treasury.deposits(await USDT.getAddress(), alice.address)
    ).to.be.equal(depositAmount);
  });

  it("Should deposit and lock", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    await Treasury.connect(mockContract).setGameToken(
      mockGameId,
      await USDT.getAddress()
    );
    expect(await Treasury.locked(mockGameId)).to.be.equal(0);
    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      alice.address,
      mockGameId,
      false
    );
    expect(await Treasury.locked(mockGameId)).to.be.equal(depositAmount);
  });

  it("Should deposit with permit", async function () {});

  it("Should deposit and lock with permit", async function () {});

  it("Should withdraw", async function () {
    const oldBalance = await USDT.balanceOf(alice.address);
    await Treasury.connect(alice).withdraw(
      depositAmount,
      await USDT.getAddress()
    );
    const newBalance = await USDT.balanceOf(alice.address);
    expect(newBalance - oldBalance).to.be.equal(depositAmount);
  });

  it("Should lock", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const oldLockedBalance = await Treasury.locked(mockGameId);
    await Treasury.connect(alice).deposit(
      depositAmount,
      await USDT.getAddress()
    );
    await Treasury.connect(mockContract).lock(
      depositAmount,
      alice.address,
      mockGameId,
      false
    );
    const newLockedBalance = await Treasury.locked(mockGameId);
    expect(newLockedBalance - oldLockedBalance).to.be.equal(depositAmount);
  });

  it("Should fail - not enough deposited tokens", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    await expect(
      Treasury.connect(mockContract).lock(
        depositAmount,
        alice.address,
        mockGameId,
        false
      )
    ).to.be.revertedWith(insufficentDepositAmount);
  });

  it("Should refund", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const oldDepositBalance = await Treasury.deposits(
      await USDT.getAddress(),
      alice.address
    );
    await Treasury.connect(mockContract).refund(
      depositAmount,
      alice.address,
      mockGameId
    );
    const newDepositBalance = await Treasury.deposits(
      await USDT.getAddress(),
      alice.address
    );
    expect(newDepositBalance).to.be.above(oldDepositBalance);
  });

  it("Should withdraw fee from players", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000004";
    await Treasury.connect(mockContract).setGameToken(
      mockGameId,
      await USDT.getAddress()
    );
    const oldFeeBalance = await Treasury.collectedFee(await USDT.getAddress());
    const gameFee = 1000; //10%
    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      alice.address,
      mockGameId,
      false
    );
    await Treasury.connect(mockContract).withdrawGameFee(
      depositAmount,
      gameFee,
      mockGameId
    );
    const newFeeBalance = await Treasury.collectedFee(await USDT.getAddress());
    expect(newFeeBalance - oldFeeBalance).to.be.equal(depositAmount * 0.1);
  });

  it("Should distribute", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000002";
    await Treasury.connect(mockContract).setGameToken(
      mockGameId,
      await USDT.getAddress()
    );
    const oldDepositBalance = await Treasury.deposits(
      await USDT.getAddress(),
      alice.address
    );
    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      owner.address,
      mockGameId,
      false
    );

    await Treasury.connect(mockContract).depositAndLock(
      depositAmount,
      alice.address,
      mockGameId,
      false
    );

    const rate = 10000;

    await Treasury.connect(mockContract).universalDistribute(
      alice.address,
      depositAmount, //won amount
      mockGameId,
      rate
    );
    const newDepositBalance = await Treasury.deposits(
      await USDT.getAddress(),
      alice.address
    );
    expect(newDepositBalance).to.be.above(oldDepositBalance);
  });

  it("Should withdraw collected fees", async function () {
    const collectedFees = await Treasury.collectedFee(await USDT.getAddress());
    const oldOwnerBalance = await USDT.balanceOf(owner.address);
    await Treasury.withdrawFees(
      owner.address,
      collectedFees,
      await USDT.getAddress()
    );
    const newOwnerBalance = await USDT.balanceOf(owner.address);
    expect(newOwnerBalance - oldOwnerBalance).to.be.equal(collectedFees);
  });

  // it("Should calculate rate (no rakeback) - calculateRate()", async function () {
  //   //mock game
  //   const mockGameId =
  //     "0x0000000000000000000000000000000000000000000000000000000000000003";
  //   await Treasury.connect(mockContract).setGameToken(
  //     mockGameId,
  //     await USDT.getAddress()
  //   );

  //   await Treasury.connect(mockContract).depositAndLock(
  //     depositAmount,
  //     owner.address,
  //     mockGameId,
  //     false
  //   );

  //   await Treasury.connect(mockContract).depositAndLock(
  //     depositAmount,
  //     alice.address,
  //     mockGameId,
  //     false
  //   );

  //   const wonTeamTotal = BigInt(depositAmount);
  //   const totalLocked = BigInt(depositAmount) * BigInt(2);
  //   const rate = await Treasury.connect(mockContract).calculateRate(
  //     wonTeamTotal,
  //     0,
  //     mockGameId
  //   );
  //   const calculatedRate =
  //     ((totalLocked - wonTeamTotal) *
  //       (await Treasury.RATE_PRECISION_AMPLIFIER())) /
  //     wonTeamTotal;
  //   console.log(rate);
  //   console.log(typeof rate);
  //   expect(rate).to.be.equal(calculatedRate);
  // });

  it("Should set new upkeep", async function () {
    const newUpkeep = await new MockVerifier__factory(owner).deploy();
    await Treasury.setUpkeep(await newUpkeep.getAddress());
    expect(await Treasury.upkeep()).to.be.equal(await newUpkeep.getAddress());
  });

  it("Should change deposit amount", async function () {
    const newDepositAmount = 1000;
    await Treasury.changeMinDepositAmount(
      newDepositAmount,
      await USDT.getAddress()
    );
    expect(
      await Treasury.minDepositAmount(await USDT.getAddress())
    ).to.be.equal(newDepositAmount);
  });

  it("Should fail - zero address", async function () {
    await expect(
      Treasury.setToken(ethers.ZeroAddress, true)
    ).to.be.revertedWith(zeroAddress);
  });

  it("Should fail - wrong deposit amount", async function () {
    await expect(
      Treasury.deposit(100, await USDT.getAddress())
    ).to.be.revertedWith(wrongDepositAmount);
  });

  it("Should fail - wrong amount refund", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000003";
    await Treasury.connect(mockContract).setGameToken(
      mockGameId,
      await USDT.getAddress()
    );
    await expect(
      Treasury.connect(mockContract).refund(
        ethers.MaxUint256,
        alice.address,
        mockGameId
      )
    ).to.be.revertedWith(wrongAmount);
  });

  it("Should fail - wrong amount withdraw", async function () {
    await Treasury.withdraw(
      await Treasury.deposits(await USDT.getAddress(), owner.address),
      await USDT.getAddress()
    );
    await expect(
      Treasury.withdraw(depositAmount, await USDT.getAddress())
    ).to.be.revertedWith(wrongAmount);
  });

  it("Should fail - wrong amount refundWithFee", async function () {
    const mockGameId =
      "0x0000000000000000000000000000000000000000000000000000000000000003";
    await expect(
      Treasury.connect(mockContract).refundWithFees(
        ethers.MaxUint256,
        owner.address,
        100,
        mockGameId
      )
    ).to.be.revertedWith(wrongAmount);
  });

  it("Should fail - wrong amount withdrawFees", async function () {
    await expect(
      Treasury.withdrawFees(
        alice.address,
        ethers.MaxUint256,
        await USDT.getAddress()
      )
    ).to.be.revertedWith(wrongAmount);
  });

  it("Should upgrade treasury", async function () {
    let TreasuryV2 = await upgrades.upgradeProxy(
      await Treasury.getAddress(),
      await ethers.getContractFactory("TreasuryV2")
    );
    expect(await TreasuryV2.test()).to.be.equal(333);
  });
});
