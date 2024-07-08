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
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import {
  abiEncodeInt192WithTimestamp,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const monthUnix = 2629743;
const requireMaxBetDuration = "Max game duration must be lower";
const requireMinBetDuration = "Min game duration must be higher";
const requireWrongBetAmount = "Wrong deposit amount";
const requireWrongStatus = "Wrong status!";
const requireGameClosed = "Game is closed for new players";
const requireOnlyCertainAccount = "Only certain account can accept";
const requireWrongSender = "Wrong sender";
const requireOnlyOpponent = "Only opponent can refuse";
const requireEarlyFinish = "Too early to finish";

describe("OneVsOneUpDown", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: OneVsOneUpDown;
  let Upkeep: MockVerifier;
  let currentGameId: string;
  const feedId = 7;
  const startingPrice = parse18("2310").toString();
  const finalUpPrice = parse18("2330").toString();
  const finalDownPrice = parse18("2300").toString();
  const usdtAmount = 100;
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
    Game = await new OneVsOneUpDown__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
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
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );

    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    let game = await Game.decodeData(currentGameId);
    expect(game.initiator).to.equal(await owner.getAddress());
    expect(game.gameStatus).to.equal(0);
  });

  it("should accept updown mode bet", async function () {
    await USDT.connect(opponent).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).acceptGame(currentGameId);
    let game = await Game.decodeData(currentGameId);
    expect(game.gameStatus).to.equal(2);
  });

  it("should end updown game", async function () {
    let oldBalance = await USDT.balanceOf(await opponent.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      currentGameId,
      abiEncodeInt192WithTimestamp(finalUpPrice, feedId, await time.latest())
    );
    let newBalance = await USDT.balanceOf(await opponent.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("initiator should win", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).acceptGame(currentGameId);

    let oldBalance = await USDT.balanceOf(await owner.getAddress());

    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      currentGameId,
      abiEncodeInt192WithTimestamp(finalDownPrice, feedId, await time.latest())
    );

    let newBalance = await USDT.balanceOf(await owner.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create and accept updown open game with zero address", async function () {
    const tx = await Game.createGame(
      ethers.ZeroAddress,
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).acceptGame(currentGameId);
    expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(2);
  });

  it("should create and refuse updown game with refuseGame function", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).refuseGame(currentGameId);
    expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(4);
  });

  it("should create and close updown game with closeGame function", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).refuseGame(currentGameId);
    await Game.closeGame(currentGameId);
    expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(1);
  });

  it("should fail - wrong min bet duration", async function () {
    await expect(
      Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + 1,
        false,
        usdtAmount,
        feedId,
        abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
      )
    ).to.be.revertedWith(requireMinBetDuration);
  });

  it("should fail - wrong max bet duration", async function () {
    await expect(
      Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + monthUnix * 20,
        false,
        usdtAmount,
        feedId,
        abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
      )
    ).to.be.revertedWith(requireMaxBetDuration);
  });

  it("should fail - Wrong deposit amount", async function () {
    await expect(
      Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        1,
        feedId,
        abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
      )
    ).to.be.revertedWith(requireWrongBetAmount);
  });

  it("should fail - acceptGame wrong status", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).refuseGame(currentGameId);
    await expect(
      Game.connect(opponent).acceptGame(currentGameId)
    ).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - acceptGame game closed after 1/3 of duration", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    await time.increase(fortyFiveMinutes / 3);
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await expect(
      Game.connect(opponent).acceptGame(currentGameId)
    ).to.be.revertedWith(requireGameClosed);
  });

  it("should fail - acceptGame only opponent can accept", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await expect(
      Game.connect(alice).acceptGame(currentGameId)
    ).to.be.revertedWith(requireOnlyCertainAccount);
  });

  it("should fail - closeGame wrong status", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).acceptGame(currentGameId);
    await expect(Game.closeGame(currentGameId)).to.be.revertedWith(
      requireWrongStatus
    );
  });

  it("should fail - closeGame wrong sender", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await expect(
      Game.connect(alice).closeGame(currentGameId)
    ).to.be.revertedWith(requireWrongSender);
  });

  it("should fail - refuseGame only opponent can refuse bet", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await expect(
      Game.connect(alice).refuseGame(currentGameId)
    ).to.be.revertedWith(requireOnlyOpponent);
  });

  it("should fail - refuseGame wrong status", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).acceptGame(currentGameId);
    await expect(
      Game.connect(opponent).refuseGame(currentGameId)
    ).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - finalizeGame wrong status", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await expect(
      Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(finalUpPrice, feedId, await time.latest())
      )
    ).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - finalizeGame ealy finalization", async function () {
    const tx = await Game.createGame(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest())
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0][0];
    await Game.connect(opponent).acceptGame(currentGameId);
    await expect(
      Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(finalUpPrice, feedId, await time.latest())
      )
    ).to.be.revertedWith(requireEarlyFinish);
  });

  it("should create and accept game with permit", async function () {
    const deadline = (await time.latest()) + fortyFiveMinutes;
    let result = await getPermitSignature(
      owner,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    const tx = await Game.createGameWithPermit(
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      false,
      usdtAmount,
      feedId,
      abiEncodeInt192WithTimestamp(startingPrice, feedId, await time.latest()),
      {
        deadline: deadline,
        v: result.v,
        r: result.r,
        s: result.s,
      }
    );
    const receipt = await tx.wait();
    console.log(receipt!.logs[1]!.args);
    currentGameId = receipt!.logs[1]!.args[0][0];

    result = await getPermitSignature(
      opponent,
      USDT,
      await Treasury.getAddress(),
      parse18("100"),
      BigInt(deadline)
    );
    await Game.connect(opponent).acceptGameWithPermit(currentGameId, {
      deadline: deadline,
      v: result.v,
      r: result.r,
      s: result.s,
    });
  });
});
