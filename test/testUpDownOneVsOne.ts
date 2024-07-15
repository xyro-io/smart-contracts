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
const Status = {
  Created: 0,
  Cancelled: 1,
  Started: 2,
  Finished: 3,
  Refused: 4,
};

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
  let receipt: any;
  const feedNumber = 7;
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
    await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(opponent).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    await USDT.connect(alice).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
  });

  describe("Create game", async function () {
    it("should create updown bet", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldUserBalance = await USDT.balanceOf(owner.address);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = await time.latest();
      const isLong = false;
      const tx = await Game.createGame(
        await opponent.getAddress(),
        endTime,
        isLong,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(startingPrice, feedNumber, startTime)
      );

      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      let game = await Game.decodeData(currentGameId);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));
      expect(
        (await USDT.balanceOf(await Treasury.getAddress())) - oldTreasuryBalance
      ).to.be.equal(parse18(usdtAmount.toString()));
      expect(sentUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.opponent).to.be.equal(opponent.address);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.depositAmount).to.be.equal(usdtAmount);
    });

    it("should create updown bet isLong(true)", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldUserBalance = await USDT.balanceOf(owner.address);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = await time.latest();
      const isLong = true;
      const tx = await Game.createGame(
        await opponent.getAddress(),
        endTime,
        isLong,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(startingPrice, feedNumber, startTime)
      );

      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      let game = await Game.decodeData(currentGameId);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));
      expect(
        (await USDT.balanceOf(await Treasury.getAddress())) - oldTreasuryBalance
      ).to.be.equal(parse18(usdtAmount.toString()));
      expect(sentUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.opponent).to.be.equal(opponent.address);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.depositAmount).to.be.equal(usdtAmount);
    });

    it("should fail - wrong min bet duration", async function () {
      await expect(
        Game.createGame(
          await opponent.getAddress(),
          (await time.latest()) + 1,
          false,
          usdtAmount,
          feedNumber,
          abiEncodeInt192WithTimestamp(
            startingPrice,
            feedNumber,
            await time.latest()
          )
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
          feedNumber,
          abiEncodeInt192WithTimestamp(
            startingPrice,
            feedNumber,
            await time.latest()
          )
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
          feedNumber,
          abiEncodeInt192WithTimestamp(
            startingPrice,
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireWrongBetAmount);
    });
  });

  describe("Accept game", async function () {
    it("should accept updown mode bet", async function () {
      const oldUserBalance = await USDT.balanceOf(opponent.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(opponent).acceptGame(currentGameId);
      const newUserAmount =
        oldUserBalance - (await USDT.balanceOf(opponent.address));
      const newTreasuryAmount =
        (await USDT.balanceOf(await Treasury.getAddress())) -
        oldTreasuryBalance;
      let game = await Game.decodeData(currentGameId);
      expect(newUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(newTreasuryAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.gameStatus).to.equal(Status.Started);
    });

    it("should create and accept updown open game with zero address", async function () {
      const oldUserBalance = await USDT.balanceOf(opponent.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const tx = await Game.createGame(
        ethers.ZeroAddress,
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await Game.connect(opponent).acceptGame(currentGameId);
      const newUserAmount =
        oldUserBalance - (await USDT.balanceOf(opponent.address));
      const newTreasuryAmount =
        (await USDT.balanceOf(await Treasury.getAddress())) -
        oldTreasuryBalance;
      let game = await Game.decodeData(currentGameId);
      expect(newUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(newTreasuryAmount).to.be.equal(
        parse18((2 * usdtAmount).toString())
      );
      expect(game.gameStatus).to.equal(Status.Started);
    });

    it("should fail - acceptGame wrong status", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
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
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
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
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await expect(
        Game.connect(alice).acceptGame(currentGameId)
      ).to.be.revertedWith(requireOnlyCertainAccount);
    });
  });

  describe("Close game", async function () {
    it("should close updown game", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await Game.connect(opponent).refuseGame(currentGameId);
      await Game.closeGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(1);
    });

    it("should fail - closeGame wrong status", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
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
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await expect(
        Game.connect(alice).closeGame(currentGameId)
      ).to.be.revertedWith(requireWrongSender);
    });
  });

  describe("Refuse game", async function () {
    it("should create and refuse updown game with refuseGame function", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await Game.connect(opponent).refuseGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(4);
    });

    it("should fail - refuseGame only opponent can refuse bet", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
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
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await Game.connect(opponent).acceptGame(currentGameId);
      await expect(
        Game.connect(opponent).refuseGame(currentGameId)
      ).to.be.revertedWith(requireWrongStatus);
    });
  });

  describe("Finalize game", async function () {
    it("should end updown game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = await time.latest();
      const isLong = false;
      const tx = await Game.createGame(
        await opponent.getAddress(),
        endTime,
        isLong,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(startingPrice, feedNumber, startTime)
      );
      let oldBalance = await USDT.balanceOf(await opponent.getAddress());
      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalUpPrice,
          feedNumber,
          await time.latest()
        )
      );
      const game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(game.finalPrice).to.be.equal(
        BigInt(finalUpPrice) / BigInt(Math.pow(10, 14))
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
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await Game.connect(opponent).acceptGame(currentGameId);

      let oldBalance = await USDT.balanceOf(await owner.getAddress());

      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalDownPrice,
          feedNumber,
          await time.latest()
        )
      );
      const game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      expect(game.finalPrice).to.be.equal(
        BigInt(finalDownPrice) / BigInt(Math.pow(10, 14))
      );
      let newBalance = await USDT.balanceOf(await owner.getAddress());
      expect(newBalance).to.be.above(oldBalance);
    });

    it("should fail - finalizeGame wrong status", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await expect(
        Game.finalizeGame(
          currentGameId,
          abiEncodeInt192WithTimestamp(
            finalUpPrice,
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireWrongStatus);
    });

    it("should fail - finalizeGame ealy finalization", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      await Game.connect(opponent).acceptGame(currentGameId);
      await expect(
        Game.finalizeGame(
          currentGameId,
          abiEncodeInt192WithTimestamp(
            finalUpPrice,
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireEarlyFinish);
    });
  });

  describe("Permit", async function () {
    it("should create game with permit", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldUserBalance = await USDT.balanceOf(owner.address);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = await time.latest();
      const isLong = false;
      const tx = await Game.createGameWithPermit(
        await opponent.getAddress(),
        endTime,
        isLong,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(startingPrice, feedNumber, startTime),
        {
          deadline: deadline,
          v: ownerPermit.v,
          r: ownerPermit.r,
          s: ownerPermit.s,
        }
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[2]!.args[0][0];
      let game = await Game.decodeData(currentGameId);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));
      expect(
        (await USDT.balanceOf(await Treasury.getAddress())) - oldTreasuryBalance
      ).to.be.equal(parse18(usdtAmount.toString()));
      expect(sentUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.opponent).to.be.equal(opponent.address);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.isLong).to.be.equal(isLong);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.depositAmount).to.be.equal(usdtAmount);
    });

    it("should create game with permit", async function () {
      const oldUserBalance = await USDT.balanceOf(opponent.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const deadline = (await time.latest()) + fortyFiveMinutes;
      const opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await Game.connect(opponent).acceptGameWithPermit(currentGameId, {
        deadline: deadline,
        v: opponentPermit.v,
        r: opponentPermit.r,
        s: opponentPermit.s,
      });
      const newUserAmount =
        oldUserBalance - (await USDT.balanceOf(opponent.address));
      const newTreasuryAmount =
        (await USDT.balanceOf(await Treasury.getAddress())) -
        oldTreasuryBalance;
      let game = await Game.decodeData(currentGameId);
      expect(newUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(newTreasuryAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.gameStatus).to.equal(Status.Started);
    });

    it("should fail - acceptGame wrong status", async function () {
      await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      const opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await Game.connect(opponent).acceptGameWithPermit(currentGameId, {
        deadline: deadline,
        v: opponentPermit.v,
        r: opponentPermit.r,
        s: opponentPermit.s,
      });
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
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      const opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.connect(opponent).acceptGameWithPermit(currentGameId, {
          deadline: deadline,
          v: opponentPermit.v,
          r: opponentPermit.r,
          s: opponentPermit.s,
        })
      ).to.be.revertedWith(requireGameClosed);
    });

    it("should fail - acceptGame only opponent can accept", async function () {
      const tx = await Game.createGame(
        await opponent.getAddress(),
        (await time.latest()) + fortyFiveMinutes,
        false,
        usdtAmount,
        feedNumber,
        abiEncodeInt192WithTimestamp(
          startingPrice,
          feedNumber,
          await time.latest()
        )
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0][0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      const alicePermit = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.connect(alice).acceptGameWithPermit(currentGameId, {
          deadline: deadline,
          v: alicePermit.v,
          r: alicePermit.r,
          s: alicePermit.s,
        })
      ).to.be.revertedWith(requireOnlyCertainAccount);
    });
  });

  it("should change min and max game duration", async function () {
    const thirtyMins = await Game.minDuration();
    const fourWeeks = await Game.maxDuration();
    await Game.changeGameDuration(
      fourWeeks + BigInt(60),
      thirtyMins + BigInt(60)
    );
    expect(await Game.minDuration()).to.be.equal(thirtyMins + BigInt(60));
    expect(await Game.maxDuration()).to.be.equal(fourWeeks + BigInt(60));
  });
});
