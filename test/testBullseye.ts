import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Treasury__factory } from "../typechain-types/factories/contracts/Treasury.sol/Treasury__factory";
import { Bullseye } from "../typechain-types/contracts/Bullseye";
import { Bullseye__factory } from "../typechain-types/factories/contracts/Bullseye__factory";
import { MockUpkeep } from "../typechain-types/contracts/MockUpkeep";
import { MockUpkeep__factory } from "../typechain-types/factories/contracts/MockUpkeep__factory";
import { abiEncodeInt192 } from "../scripts/helper";
import { FrontHelper } from "../typechain-types/contracts/FrontHelper";
import { FrontHelper__factory } from "../typechain-types/factories/contracts/FrontHelper__factory";
const parse18 = ethers.parseEther;

describe("Bullseye", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: Bullseye;
  let Upkeep: MockUpkeep;
  let FrontHelper:FrontHelper;
  const feedId = "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
  const assetPrice = parse18("2310");
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();
    FrontHelper = await new FrontHelper__factory(owner).deploy();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new Bullseye__factory(owner).deploy();
    Upkeep = await new MockUpkeep__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Treasury.setFee(100);
    await USDT.mint(await opponent.getAddress(), parse18("10000000"));
    await USDT.mint(await alice.getAddress(), parse18("10000000"));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
  });

  it("should create bullseye game", async function () {
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await Game.startGame(
      (await time.latest()) + 2700,
      (await time.latest()) + 900,
      parse18("100"),
      feedId
    );
    let bet = await Game.game();
    console.log(bet)
    expect(bet.depositAmount).to.equal(parse18("100"));
  });

  it("should bet", async function () {
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).play((assetPrice / BigInt(100)) * BigInt(105));
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18("100")
    );
  });

  it("should bet", async function () {
    await USDT.connect(alice).approve(Treasury.getAddress(), ethers.MaxUint256);
    await Game.connect(alice).play((assetPrice / BigInt(100)) * BigInt(95));
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18("200")
    );
  });

  it("should end bullseye game", async function () {
    const data = await FrontHelper.getBullseyeData(await Game.getAddress())
    console.log("data: ", data);
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(2700);
    const finalPrice = abiEncodeInt192(
      ((assetPrice / BigInt(100)) * BigInt(95)).toString(),feedId
    );
    console.log("player",await Game.players(0))
    await Game.finalizeGame(finalPrice);
    let newBalance = await USDT.balanceOf(alice.getAddress());
    // console.log("player",await Game.players(0))
    expect(newBalance).to.be.above(oldBalance);
  });
});
