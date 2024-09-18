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
import {
  abiEncodeInt192WithTimestamp,
  getPermitSignature,
} from "../scripts/helper";

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
const requireEarlyFinish = "Too early to finish";
const requireUniqueOpponent = "Wrong opponent";
const Status = {
  Default: 0,
  Created: 1,
  Cancelled: 2,
  Started: 3,
  Finished: 4,
};

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
  let receipt: any;
  const feedNumber = 3;
  const assetPrice = 600000000;
  const usdtAmount = 100;
  const initiatorPrice = (assetPrice / 100) * 123;
  const opponentPrice = (assetPrice / 100) * 105;
  const equalOpponentDiffPrice = 617000000;
  const equalInitiatorDiffPrice = 619000000;
  const finalPrice = parse18("61800");
  const finalPrice2 = parse18("73800");
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    XyroToken = await new XyroToken__factory(owner).deploy(parse18("10"));
    Treasury = await new Treasury__factory(owner).deploy(
      await USDT.getAddress(),
      await XyroToken.getAddress()
    );
    Game = await new OneVsOneExactPrice__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await USDT.mint(opponent.address, parse18("1000"));
    await Treasury.setUpkeep(await Upkeep.getAddress());
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
    it("should create exact price game", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldUserBalance = await USDT.balanceOf(owner.address);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createGame(
        feedNumber,
        opponent.address,
        endTime,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
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
      expect(game.initiatorPrice).to.be.equal(initiatorPrice);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.depositAmount).to.be.equal(usdtAmount);
    });

    it("should fail - wrong min bet duration", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount
        )
      ).to.be.revertedWith(requireMinBetDuration);
    });

    it("should fail - wrong max bet duration", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          opponent.address,
          (await time.latest()) + monthUnix * 20,
          initiatorPrice,
          usdtAmount
        )
      ).to.be.revertedWith(requireMaxBetDuration);
    });

    it("should fail - Wrong deposit amount", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          opponent.address,
          (await time.latest()) + fortyFiveMinutes,
          initiatorPrice,
          0
        )
      ).to.be.revertedWith(requireWrongusdtAmount);
    });

    it("should fail - Wrong opponent", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          owner.address,
          (await time.latest()) + fortyFiveMinutes,
          initiatorPrice,
          100
        )
      ).to.be.revertedWith(requireUniqueOpponent);
    });
  });

  describe("Accept game", async function () {
    it("should accept exact price bet", async function () {
      const oldUserBalance = await USDT.balanceOf(opponent.address);
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(opponent.address));
      let game = await Game.decodeData(currentGameId);
      expect(sentUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.opponentPrice).to.be.equal(opponentPrice);
      expect(game.gameStatus).to.be.equal(Status.Started);
    });

    it("should create and accept exact price open bet with zero address", async function () {
      const tx = await Game.createGame(
        feedNumber,
        ethers.ZeroAddress,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );

      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Started
      );
    });

    it("should fail - acceptGame wrong status", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.closeGame(currentGameId);
      await expect(
        Game.connect(opponent).acceptGame(currentGameId, opponentPrice)
      ).to.be.revertedWith(requireWrongStatus);
    });

    it("should fail - acceptGame game closed after 1/3 of duration", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await expect(
        Game.connect(opponent).acceptGame(currentGameId, opponentPrice)
      ).to.be.revertedWith(requireGameClosed);
    });

    it("should fail - acceptGame same asset price", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await expect(
        Game.connect(opponent).acceptGame(currentGameId, initiatorPrice)
      ).to.be.revertedWith(requireSameAssetPrice);
    });

    it("should fail - acceptGame only opponent can accept", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await expect(
        Game.connect(alice).acceptGame(currentGameId, opponentPrice)
      ).to.be.revertedWith(requireOnlyCertainAccount);
    });
  });

  describe("Close game", async function () {
    it("should create and close game", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.closeGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Cancelled
      );
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
    });

    it("should fail - closeGame wrong status", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      let game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Created);
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Started);
      await expect(Game.closeGame(currentGameId)).to.be.revertedWith(
        requireWrongStatus
      );
    });

    it("should fail - closeGame wrong sender", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await expect(
        Game.connect(alice).closeGame(currentGameId)
      ).to.be.revertedWith(requireWrongSender);
    });
  });
  describe("Finalize game", async function () {
    it("should end the game", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      let oldBalance = await USDT.balanceOf(opponent.address);
      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      const game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      await Treasury.connect(opponent).withdraw(
        (await Treasury.deposits(opponent.address)) / BigInt(Math.pow(10, 18))
      );
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        parse18(
          (
            usdtAmount * 2 -
            (usdtAmount * 2 * Number(await Game.fee())) / 100000
          ).toString()
        )
      );
    });

    it("initiator shoild win", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      let oldBalance = await USDT.balanceOf(owner.address);
      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalPrice2.toString(),
          feedNumber,
          await time.latest()
        )
      );
      const game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      await Treasury.connect(owner).withdraw(
        (await Treasury.deposits(owner.address)) / BigInt(Math.pow(10, 18))
      );
      let newBalance = await USDT.balanceOf(owner.address);
      expect(newBalance - oldBalance).to.be.equal(
        parse18(
          (
            usdtAmount * 2 -
            (usdtAmount * 2 * Number(await Game.fee())) / 100000
          ).toString()
        )
      );
    });

    it("should refund with equal price diff", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        equalInitiatorDiffPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      let oldBalance = await USDT.balanceOf(opponent.address);
      await Game.connect(opponent).acceptGame(
        currentGameId,
        equalOpponentDiffPrice
      );
      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(
        currentGameId,
        abiEncodeInt192WithTimestamp(
          finalPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await Treasury.connect(opponent).withdraw(
        (await Treasury.deposits(opponent.address)) / BigInt(Math.pow(10, 18))
      );
      const game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance).to.be.equal(oldBalance);
    });

    it("should fail - finalizeGame wrong status", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await expect(
        Game.finalizeGame(
          currentGameId,
          abiEncodeInt192WithTimestamp(
            finalPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireWrongStatus);
    });

    it("should fail - finalizeGame ealy finalization", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      await expect(
        Game.finalizeGame(
          currentGameId,
          abiEncodeInt192WithTimestamp(
            finalPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireEarlyFinish);
    });
  });

  describe("Permit", async function () {
    it("should create game with permit", async function () {
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      const oldUserBalance = await USDT.balanceOf(owner.address);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      const tx = await Game.createGameWithPermit(
        feedNumber,
        opponent.address,
        endTime,
        initiatorPrice,
        usdtAmount,
        {
          deadline: deadline,
          v: ownerPermit.v,
          r: ownerPermit.r,
          s: ownerPermit.s,
        }
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[2]!.args[0];
      const game = await Game.decodeData(currentGameId);
      expect(
        (await USDT.balanceOf(await Treasury.getAddress())) - oldTreasuryBalance
      ).to.be.equal(parse18(usdtAmount.toString()));
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));
      expect(sentUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.opponent).to.be.equal(opponent.address);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.initiatorPrice).to.be.equal(initiatorPrice);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.depositAmount).to.be.equal(usdtAmount);
    });

    it("should fail - wrong min bet duration", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount,
          {
            deadline: deadline,
            v: ownerPermit.v,
            r: ownerPermit.r,
            s: ownerPermit.s,
          }
        )
      ).to.be.revertedWith(requireMinBetDuration);
    });

    it("should fail - wrong max bet duration", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + monthUnix * 20,
          initiatorPrice,
          usdtAmount,
          {
            deadline: deadline,
            v: ownerPermit.v,
            r: ownerPermit.r,
            s: ownerPermit.s,
          }
        )
      ).to.be.revertedWith(requireMaxBetDuration);
    });

    it("should fail - Wrong deposit amount", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + fortyFiveMinutes,
          initiatorPrice,
          1,
          {
            deadline: deadline,
            v: ownerPermit.v,
            r: ownerPermit.r,
            s: ownerPermit.s,
          }
        )
      ).to.be.revertedWith(requireWrongusdtAmount);
    });

    it("should accept game with permit", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      const oldUserBalance = await USDT.balanceOf(opponent.address);
      await Game.connect(opponent).acceptGameWithPermit(
        currentGameId,
        opponentPrice,
        {
          deadline: deadline,
          v: opponentPermit.v,
          r: opponentPermit.r,
          s: opponentPermit.s,
        }
      );
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(opponent.address));
      let game = await Game.decodeData(currentGameId);
      expect(sentUserAmount).to.be.equal(parse18(usdtAmount.toString()));
      expect(game.opponentPrice).to.be.equal(opponentPrice);
      expect(game.gameStatus).to.be.equal(Status.Started);
    });

    it("should fail - acceptGame wrong status", async function () {
      await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.closeGame(currentGameId);
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.connect(opponent).acceptGameWithPermit(
          currentGameId,
          opponentPrice,
          {
            deadline: deadline,
            v: opponentPermit.v,
            r: opponentPermit.r,
            s: opponentPermit.s,
          }
        )
      ).to.be.revertedWith(requireWrongStatus);
    });

    it("should fail - acceptGame game closed after 1/3 of duration", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.connect(opponent).acceptGameWithPermit(
          currentGameId,
          opponentPrice,
          {
            deadline: deadline,
            v: opponentPermit.v,
            r: opponentPermit.r,
            s: opponentPermit.s,
          }
        )
      ).to.be.revertedWith(requireGameClosed);
    });

    it("should fail - acceptGame same asset price", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.connect(opponent).acceptGameWithPermit(
          currentGameId,
          initiatorPrice,
          {
            deadline: deadline,
            v: opponentPermit.v,
            r: opponentPermit.r,
            s: opponentPermit.s,
          }
        )
      ).to.be.revertedWith(requireSameAssetPrice);
    });

    it("should fail - acceptGame only opponent can accept", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let alicePermit = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        parse18(usdtAmount.toString()),
        BigInt(deadline)
      );
      await expect(
        Game.connect(alice).acceptGameWithPermit(currentGameId, opponentPrice, {
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
