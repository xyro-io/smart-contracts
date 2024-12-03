import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FrontHelper } from "../typechain-types/contracts/FrontHelper.sol/FrontHelper";
import { FrontHelper__factory } from "../typechain-types/factories/contracts/FrontHelper.sol/FrontHelper__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { OldTreasury } from "../typechain-types/contracts/oldContracts/OldTreasury.sol/OldTreasury";
import { OldTreasury__factory } from "../typechain-types/factories/contracts/oldContracts/OldTreasury.sol/OldTreasury__factory";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
const parse18 = ethers.parseEther;

describe("FrontHelper", () => {
  let XyroToken: XyroToken;
  let FrontHelper: FrontHelper;
  let USDT: MockToken;
  let Treasury: Treasury;
  let OldTreasury: OldTreasury;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let xyroAmount = parse18("100");
  let usdtAmount = BigInt(50000000);
  before(async () => {
    [owner, alice] = await ethers.getSigners();
    FrontHelper = await new FrontHelper__factory(owner).deploy();
    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()]
    );

    OldTreasury = await new OldTreasury__factory(owner).deploy(
      await USDT.getAddress()
    );
    await Treasury.setToken(await XyroToken.getAddress(), true);
    //mock deposit balances
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await USDT.approve(await OldTreasury.getAddress(), ethers.MaxUint256);
    await XyroToken.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await XyroToken.approve(await OldTreasury.getAddress(), ethers.MaxUint256);

    await Treasury.deposit(xyroAmount, await XyroToken.getAddress());
    await Treasury.deposit(usdtAmount, await USDT.getAddress());
    await OldTreasury.deposit(usdtAmount / BigInt(Math.pow(10, 6)));
  });

  it("should return deposit data from old and current Treasury", async function () {
    const oldData = await FrontHelper.getOldBalanceData(
      await OldTreasury.getAddress(),
      await USDT.getAddress(),
      [owner.address, alice.address]
    );
    expect(oldData[0][1]).to.be.equal(usdtAmount);
    expect(oldData[1][1]).to.be.equal(0);
    const newData = await FrontHelper.getBalanceDataBatch(
      await Treasury.getAddress(),
      [await USDT.getAddress(), await XyroToken.getAddress()],
      [owner.address, alice.address]
    );
    expect(newData[0][1]).to.be.equal(usdtAmount);
    expect(newData[1][1]).to.be.equal(xyroAmount);
    expect(newData[2][1]).to.be.equal(0);
    expect(newData[3][1]).to.be.equal(0);
  });
});
