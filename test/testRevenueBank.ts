import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RevenueBank } from "../typechain-types/contracts/RevenueBank.sol/RevenueBank";
import { RevenueBank__factory } from "../typechain-types/factories/contracts/RevenueBank.sol/RevenueBank__factory";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
const parse18 = ethers.parseEther;

describe("RevenueBank", () => {
  let Bank: RevenueBank;
  let XyroToken: XyroToken;
  let USDT: MockToken;
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
    const bankAmount = parse18((1e7).toString());
    Bank = await new RevenueBank__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );

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

  it("Signature verify and token claim", async function () {
    const oldAliceBalance = await XyroToken.balanceOf(alice.address);
    let message = {
      to: alice.address,
      amount: 199,
      nonce: await Bank.nonces(alice.address),
      deadline: (await time.latest()) + 100,
    };
    let signature = await owner.signTypedData(domain, types, message);
    await Bank.connect(alice).verify(message, signature);
    const newAliceBalance = await XyroToken.balanceOf(alice.address);
    expect(newAliceBalance - oldAliceBalance).to.be.equal(message.amount);
    await expect(
      Bank.connect(alice).verify(message, signature)
    ).to.be.revertedWith("Wrong signer");
  });

  //   it("should get some tokens", async function () {
  //     let oldBalance = await XyroToken.balanceOf(owner.address);
  //     await time.increase(604800);
  //     await Vesting.release();
  //     let newBalance = await XyroToken.balanceOf(owner.address);
  //     expect(newBalance).to.be.above(oldBalance);
  //   });
});
