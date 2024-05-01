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
import { UpDownGame } from "../typechain-types/contracts/UpDown.sol/UpDownGame";
import { UpDownGame__factory } from "../typechain-types/factories/contracts/UpDown.sol/UpDownGame__factory";
import { MockUpkeep } from "../typechain-types/contracts/MockUpkeep";
import { MockUpkeep__factory } from "../typechain-types/factories/contracts/MockUpkeep__factory";
import { abiEncodeInt192 } from "../scripts/helper";
const parse18 = ethers.parseEther;

describe("UpDown", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: UpDownGame;
  let Upkeep: MockUpkeep;
  const assetPrice = parse18("2310");
  const finalPrice = parse18("3000");
  let startingPriceBytes: string;
  let finalPriceBytes: string;
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();
    startingPriceBytes = abiEncodeInt192(assetPrice.toString());
    finalPriceBytes = abiEncodeInt192(finalPrice.toString());
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new UpDownGame__factory(owner).deploy();
    Upkeep = await new MockUpkeep__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setFee(100);
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await USDT.mint(await opponent.getAddress(), parse18("10000000"));
    await USDT.mint(await alice.getAddress(), parse18("10000000"));
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
  });

  it("should create updown game", async function () {
    await Game.startGame(
      await time.latest(),
      (await time.latest()) + 2700,
      parse18("100"),
      startingPriceBytes
    );
    let bet = await Game.game();
    expect(bet.betAmount).to.equal(parse18("100"));
  });

  it("should bet down", async function () {
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).bet(false);
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18("100")
    );
  });

  it("should bet up", async function () {
    await USDT.connect(alice).approve(Treasury.getAddress(), ethers.MaxUint256);
    await Game.connect(alice).bet(true);
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18("200")
    );
  });

  it("should end updown game", async function () {
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(2700);
    await Game.finalizeGame(finalPriceBytes);
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });
});
