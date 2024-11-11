import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RevenueBank } from "../typechain-types/contracts/RevenueBank.sol/RevenueBank";
import { RevenueBank__factory } from "../typechain-types/factories/contracts/RevenueBank.sol/RevenueBank__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Treasury__factory } from "../typechain-types/factories/contracts/Treasury.sol/Treasury__factory";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
const parse18 = ethers.parseEther;

describe("RevenueBank", () => {
  let Bank: RevenueBank;
  let XyroToken: XyroToken;
  let USDT: MockToken;
  let Treasury: Treasury;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let domain: any;
  let types: any;
  before(async () => {
    [owner, alice] = await ethers.getSigners();
    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress()]
    );
    await Treasury.grantRole(await Treasury.DISTRIBUTOR_ROLE(), owner.address);
    const bankAmount = parse18((1e7).toString());
    Bank = await new RevenueBank__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress(),
      await Treasury.getAddress()
    );
    await Treasury.grantRole(
      await Treasury.ACCOUNTANT_ROLE(),
      await Bank.getAddress()
    );
    await Bank.grantRole(await Bank.ACCOUNTANT_ROLE(), owner.address);
    await USDT.mint(await Treasury.getAddress(), parse18("100000"));
    await XyroToken.approve(await Bank.getAddress(), ethers.MaxUint256);
    await XyroToken.transfer(await Bank.getAddress(), bankAmount);

    domain = {
      name: "XYRO",
      version: "1",
      chainId: 1337,
      verifyingContract: await Bank.getAddress(),
    };

    types = {
      Data: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
  });

  it("should verify signature and claim tokens", async function () {
    const oldAliceBalance = await XyroToken.balanceOf(alice.address);
    let message = {
      to: alice.address,
      amount: 199,
      nonce: await Bank.nonces(alice.address),
      deadline: (await time.latest()) + 100,
    };
    let signature = await owner.signTypedData(domain, types, message);
    await Bank.connect(alice).verifyTransfer(message, signature);
    const newAliceBalance = await XyroToken.balanceOf(alice.address);
    expect(newAliceBalance - oldAliceBalance).to.be.equal(message.amount);
    await expect(
      Bank.connect(alice).verifyTransfer(message, signature)
    ).to.be.revertedWith("Wrong signer");
  });

  it("should revert with expired deadline", async function () {
    let message = {
      to: alice.address,
      amount: 199,
      nonce: await Bank.nonces(alice.address),
      deadline: 100,
    };
    let signature = await owner.signTypedData(domain, types, message);
    await expect(
      Bank.connect(alice).verifyTransfer(message, signature)
    ).to.be.revertedWith("Deadline expired");
  });

  it("should withdraw fees", async function () {
    const oldOwnerBalance = await USDT.balanceOf(await Bank.getAddress());

    //mock game to earn fees
    await Treasury.calculateUpDownRate(500, 500, 9000);

    expect(await Treasury.collectedFee()).to.be.equal(parse18("900"));
    const amount = 100;
    await Bank.connect(owner).collectFees(amount);
    expect(await Treasury.collectedFee()).to.be.equal(parse18("800"));
    const newOwnerBalance = await USDT.balanceOf(await Bank.getAddress());
    expect(newOwnerBalance - oldOwnerBalance).to.be.equal(
      parse18(amount.toString())
    );
  });

  it("should change signer", async function () {
    let tx = await Bank.setSigner(alice.address);
    let receipt = await tx.wait();
    let logs = receipt?.logs[0]?.args;
    expect(logs[0]).to.be.equal(alice.address);
    expect(await Bank.signer()).to.be.equal(alice.address);
  });

  it("should change Treasury", async function () {
    let tx = await Bank.setTreasury(ethers.ZeroAddress);
    let receipt = await tx.wait();
    let logs = receipt?.logs[0]?.args;
    expect(logs[0]).to.be.equal(ethers.ZeroAddress);
    expect(await Bank.treasury()).to.be.equal(ethers.ZeroAddress);
  });

  it("should change XYRO Token", async function () {
    let tx = await Bank.setXyroToken(ethers.ZeroAddress);
    let receipt = await tx.wait();
    let logs = receipt?.logs[0]?.args;
    expect(logs[0]).to.be.equal(ethers.ZeroAddress);
    expect(await Bank.xyroToken()).to.be.equal(ethers.ZeroAddress);
  });

  it("should change approved token", async function () {
    let tx = await Bank.setApprovedToken(ethers.ZeroAddress);
    let receipt = await tx.wait();
    let logs = receipt?.logs[0]?.args;
    expect(logs[0]).to.be.equal(ethers.ZeroAddress);
    expect(await Bank.approvedToken()).to.be.equal(ethers.ZeroAddress);
  });

  it("should change fee distribution", async function () {
    const newBuybackPart = 100;
    const newRewardsPart = 500;
    await Bank.setFeeDistribution(newBuybackPart, newRewardsPart);
    expect(await Bank.buybackPart()).to.be.equal(newBuybackPart);
    expect(await Bank.rewardsPart()).to.be.equal(newRewardsPart);
  });
});
