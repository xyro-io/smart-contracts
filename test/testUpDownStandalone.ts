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
import { OneVsOneUpDown } from "../typechain-types/contracts/OneVsOneUpDown";
import { OneVsOneUpDown__factory } from "../typechain-types/factories/contracts/OneVsOneUpDown__factory";
import { MockUpkeep } from "../typechain-types/contracts/MockUpkeep";
import { MockUpkeep__factory } from "../typechain-types/factories/contracts/MockUpkeep__factory";
import { abiEncodeInt192 } from "../scripts/helper";
const parse18 = ethers.parseEther;

describe("OneVsOneUpDown", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: OneVsOneUpDown;
  let Upkeep: MockUpkeep;
  const feedId = "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
  const assetPrice = parse18("2310");
  before(async () => {
    [owner, opponent] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new OneVsOneUpDown__factory(owner).deploy();
    Upkeep = await new MockUpkeep__factory(owner).deploy();
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Game.setTreasury(await Treasury.getAddress());
    await USDT.mint(await opponent.getAddress(), parse18("1000"));
    await Treasury.setFee(100);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
  });

  it("should create updown bet", async function () {
    await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
    await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + 2700,
      false,
      parse18("100"),
      abiEncodeInt192(assetPrice.toString(), feedId),
      feedId
    );

    let bet = await Game.games(0);
    expect(bet.initiator).to.equal(await owner.getAddress());
    expect(bet.gameStatus).to.equal(0);
  });

  it("should accept updown mode bet", async function () {
    await USDT.connect(opponent).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).acceptGame(0);
    let bet = await Game.games(0);
    expect(bet.gameStatus).to.equal(2);
  });

  it("should end updown game", async function () {
    let oldBalance = await USDT.balanceOf(await opponent.getAddress());
    await time.increase(2700);
    await Game.finalizeGame(0, abiEncodeInt192(parse18("2330").toString(), feedId));
    let newBalance = await USDT.balanceOf(await opponent.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });
});
