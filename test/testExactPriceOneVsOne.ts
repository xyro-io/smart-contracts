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
import { abiEncodeInt192WithTimestamp } from "../scripts/helper";

const parse18 = ethers.parseEther;
const monthUnix = 2629743;
const fortyFiveMinutes = 2700;
const requireMaxBetDuration = "Max game duration must be lower";
const requireMinBetDuration = "Min game duration must be higher";
const requireWrongusdtAmount = "Wrong deposit amount";
const requireWrongStatus = "Wrong status!";
const requireGameClosed = "Game is closed for new players";
const requireSameAssetPrice = "Same asset prices";
const requireOnlyCertainAccount = "Only certain account can accept";
const requireWrongSender = "Wrong sender";
const requireOnlyOpponent = "Only opponent can refuse";
const requireEarlyFinish = "Too early to finish";

describe("OneVsOneExactPrice", () => {
  let opponent: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: OneVsOneExactPrice;
  let Upkeep: MockVerifier;
  let currentGameId: string;
  const feedId = 1;
  const assetPrice = 60000;
  const usdtAmount = 100;
  const initiatorPrice = (assetPrice / 100) * 123;
  const opponentPrice = (assetPrice / 100) * 105;
  const finalPrice = parse18(((assetPrice / 100) * 103).toString());
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
    Game = await new OneVsOneExactPrice__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await USDT.mint(await opponent.getAddress(), parse18("1000"));
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Treasury.setFee(100);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
  });

  it("should create exact price bet", async function () {
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    let tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    let bet = await Game.decodeData(currentGameId);
    expect(bet.initiator).to.equal(await owner.getAddress());
  });

  it("should accept exact price bet", async function () {
    await USDT.connect(opponent).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
    let bet = await Game.decodeData(currentGameId);
    expect(bet.gameStatus).to.equal(2);
  });

  it("should end exact price game", async function () {
    let oldBalance = await USDT.balanceOf(await owner.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      currentGameId,
      abiEncodeInt192WithTimestamp(
        finalPrice.toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(await owner.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("initiator shoild win", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
    let oldBalance = await USDT.balanceOf(await owner.getAddress());
    await time.increase(fortyFiveMinutes);
    await Game.finalizeGame(
      currentGameId,
      abiEncodeInt192WithTimestamp(
        parse18(initiatorPrice.toString()).toString(),
        feedId,
        await time.latest()
      )
    );
    let newBalance = await USDT.balanceOf(await owner.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create and accept exact price open bet with zero address", async function () {
    const tx = await Game.createGame(
      feedId,
      ethers.ZeroAddress,
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );

    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
    expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(2);
  });

  it("should create and close game", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    await time.increase(fortyFiveMinutes / 3);
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await Game.closeGame(currentGameId);
    expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(1);
  });

  it("should fail - wrong min bet duration", async function () {
    await expect(
      Game.createGame(
        feedId,
        await opponent.getAddress(),
        (await time.latest()) + 1,
        initiatorPrice,
        usdtAmount
      )
    ).to.be.revertedWith(requireMinBetDuration);
  });

  it("should fail - wrong max bet duration", async function () {
    await expect(
      Game.createGame(
        feedId,
        await opponent.getAddress(),
        (await time.latest()) + monthUnix * 20,
        initiatorPrice,
        usdtAmount
      )
    ).to.be.revertedWith(requireMaxBetDuration);
  });

  it("should fail - Wrong deposit amount", async function () {
    await expect(
      Game.createGame(
        feedId,
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        1
      )
    ).to.be.revertedWith(requireWrongusdtAmount);
  });

  it("should fail - acceptGame wrong status", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await Game.connect(opponent).refuseGame(currentGameId);
    await expect(
      Game.connect(opponent).acceptGame(currentGameId, opponentPrice)
    ).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - acceptGame game closed after 1/3 of duration", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    await time.increase(fortyFiveMinutes / 3);
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await expect(
      Game.connect(opponent).acceptGame(currentGameId, opponentPrice)
    ).to.be.revertedWith(requireGameClosed);
  });

  it("should fail - acceptGame same asset price", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await expect(
      Game.connect(opponent).acceptGame(currentGameId, initiatorPrice)
    ).to.be.revertedWith(requireSameAssetPrice);
  });

  it("should fail - acceptGame only opponent can accept", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await expect(
      Game.connect(alice).acceptGame(currentGameId, opponentPrice)
    ).to.be.revertedWith(requireOnlyCertainAccount);
  });

  it("should fail - closeGame wrong status", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
    await expect(Game.closeGame(currentGameId)).to.be.revertedWith(
      requireWrongStatus
    );
  });

  it("should fail - closeGame wrong sender", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await expect(
      Game.connect(alice).closeGame(currentGameId)
    ).to.be.revertedWith(requireWrongSender);
  });

  it("should fail - refuseGame only opponent can refuse bet", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await expect(
      Game.connect(alice).refuseGame(currentGameId)
    ).to.be.revertedWith(requireOnlyOpponent);
  });

  it("should fail - refuseGame wrong status", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
    await expect(
      Game.connect(opponent).refuseGame(currentGameId)
    ).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - finalizeGame wrong status", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await expect(
      Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalPrice.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - finalizeGame ealy finalization", async function () {
    const tx = await Game.createGame(
      feedId,
      await opponent.getAddress(),
      (await time.latest()) + fortyFiveMinutes,
      initiatorPrice,
      usdtAmount
    );
    const receipt = await tx.wait();
    currentGameId = receipt!.logs[1]!.args[0];
    await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
    await expect(
      Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalPrice.toString(),
          feedId,
          await time.latest()
        )
      )
    ).to.be.revertedWith(requireEarlyFinish);
  });
});
