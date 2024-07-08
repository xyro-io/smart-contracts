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
import { UpDown } from "../typechain-types/contracts/UpDown";
import { UpDown__factory } from "../typechain-types/factories/contracts/UpDown__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import {
  abiEncodeInt192WithTimestamp,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const fifteenMinutes = 900;
const requireFinishedGame = "Finish previous game first";
const requireOpenedGame = "Game is closed for new players";
const requireOnTime = "Too early";
const requireMoreThanZeroPlayers = "Not enough players";
const requireValidChainlinkReport = "Old chainlink report";
const requireStartedGame = "Start the game first";
const requirePastEndTime = "Too early to finish";
const requireStartingPrice = "Starting price must be set";
const requireNewPlayer = "Already participating";

describe("UpDown", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: UpDown;
  let Upkeep: MockVerifier;
  const assetPrice = parse18("2310");
  const finalPriceDown = parse18("2000");
  const finalPriceUp = parse18("3000");
  const usdtAmount = 100;
  const feedId = 4;
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("5000"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new UpDown__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
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
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      feedId
    );
    let game = await Game.decodeData();
    expect(game.feedId).to.equal(feedId);
  });

  it("should play down", async function () {
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).play(false, usdtAmount);
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18(usdtAmount.toString())
    );
  });

  it("should play up", async function () {
    await USDT.connect(alice).approve(Treasury.getAddress(), ethers.MaxUint256);
    await Game.connect(alice).play(true, usdtAmount);
    expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(
      parse18((usdtAmount * 2).toString())
    );
  });

  it("should set starting price", async function () {
    await time.increase(900);
    await Game.setStartingPrice(
      abiEncodeInt192WithTimestamp(
        assetPrice.toString(),
        feedId,
        await time.latest()
      )
    );
    let game = await Game.decodeData();
    expect(game.startingPrice).to.be.above(0);
  });

  it("should end updown game (up wins)", async function () {
    let oldBalance = await USDT.balanceOf(alice.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceUp.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(alice.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should fail - game not started", async function () {
    await expect(
      Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireStartedGame);
  });

  it("should fail - start new game without finishing previous", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      feedId
    );
    await expect(
      Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        feedId
      )
    ).to.be.revertedWith(requireFinishedGame);
  });

  it("should fail - play after time is up", async function () {
    await time.increase(fifteenMinutes);
    await expect(
      Game.connect(alice).play(true, parse18("100"))
    ).to.be.revertedWith(requireOpenedGame);
  });

  it("should fail - can't set price with 0 players", async function () {
    await expect(
      Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireMoreThanZeroPlayers);
  });

  it("should fail - too early to finish", async function () {
    await expect(
      Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requirePastEndTime);

    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceUp.toString(),
        feedId,
        await time.latest()
      )
    );
  });

  it("should play down with permit", async function () {
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      feedId
    );
    const deadline = (await time.latest()) + fortyFiveMinutes;
    let result = await getPermitSignature(
      owner,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    await Game.playWithPermit(false, usdtAmount, {
      deadline: deadline,
      v: result.v,
      r: result.r,
      s: result.s,
    });
    expect(await Game.DownPlayers(0)).to.equal(owner.address);
  });

  it("should play up with permit", async function () {
    const deadline = (await time.latest()) + fortyFiveMinutes;
    let result = await getPermitSignature(
      alice,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    await Game.connect(alice).playWithPermit(true, usdtAmount, {
      deadline: deadline,
      v: result.v,
      r: result.r,
      s: result.s,
    });
    expect(await Game.UpPlayers(0)).to.equal(alice.address);
  });

  it("should fail - already participating", async function () {
    const deadline = (await time.latest()) + fortyFiveMinutes;
    let result = await getPermitSignature(
      alice,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    await expect(
      Game.connect(alice).playWithPermit(true, usdtAmount, {
        deadline: deadline,
        v: result.v,
        r: result.r,
        s: result.s,
      })
    ).to.be.revertedWith(requireNewPlayer);
    await expect(Game.play(true, parse18("100"))).to.be.revertedWith(
      requireNewPlayer
    );
  });

  it("should fail - setting starting price early", async function () {
    await expect(
      Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireOnTime);
  });

  it("should fail - old chainlink report (setStartingPrice)", async function () {
    await time.increase(fifteenMinutes);
    await expect(
      Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedId,
          (await time.latest()) - fifteenMinutes
        )
      )
    ).to.be.revertedWith(requireValidChainlinkReport);
  });

  it("should fail - startring price should be set", async function () {
    await time.increase(fortyFiveMinutes);
    await expect(
      Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireStartingPrice);
  });

  it("should fail - old chainlink report (finalizeGame)", async function () {
    await Game.setStartingPrice(
      abiEncodeInt192WithTimestamp(
        assetPrice.toString(),
        feedId,
        await time.latest()
      )
    );
    // await expect(
    console.log("AAAA");
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceUp.toString(),
        feedId,
        (await time.latest()) + fortyFiveMinutes
      )
    );
    // ).to.be.revertedWith(requireValidChainlinkReport);
  });

  it("should end updown game (down wins)", async function () {
    let oldBalance = await USDT.balanceOf(owner.getAddress());
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceDown.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(owner.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should refund if players only in up team", async function () {
    let oldBalance = await USDT.balanceOf(opponent.getAddress());
    await Game.startGame(
      (await time.latest()) + fortyFiveMinutes,
      (await time.latest()) + fifteenMinutes,
      feedId
    );
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).play(true, usdtAmount);
    let currntBalance = await USDT.balanceOf(opponent.getAddress());
    expect(oldBalance).to.be.above(currntBalance);
    await USDT.connect(alice).approve(Treasury.getAddress(), ethers.MaxUint256);
    await Game.connect(alice).play(true, usdtAmount);
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      abiEncodeInt192WithTimestamp(
        finalPriceDown.toString(),
        feedId,
        await time.latest()
      )
    );
    currntBalance = await USDT.balanceOf(opponent.getAddress());
    expect(oldBalance).to.be.equal(currntBalance);
  });
});
