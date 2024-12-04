import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { OneVsOneExactPrice } from "../typechain-types/contracts/OneVsOneExactPrice";
import { OneVsOneExactPrice__factory } from "../typechain-types/factories/contracts/OneVsOneExactPrice__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";

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
const requireChainlinkReport = "Old chainlink report";
const requireUniqueOpponent = "Wrong opponent";
const requireCreationEnabled = "Game is disabled";
const requireApprovedFeedNumber = "Wrong feed number";
const requireApprovedToken = "Unapproved token";
const Status = {
  Default: 0,
  Created: 1,
  Cancelled: 2,
  Started: 3,
  Finished: 4,
};

describe("OneVsOne", () => {
  let opponent: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: OneVsOneExactPrice;
  let Upkeep: MockVerifier;
  let currentGameId: string;
  let receipt: any;
  let players: any;
  let usdtAmount: bigint;
  let xyroAmount: bigint;
  const feedNumber = 3;
  const assetPrice = parse18("60000");
  const initiatorPrice = (assetPrice / BigInt(100)) * BigInt(123);
  const opponentPrice = (assetPrice / BigInt(100)) * BigInt(105);
  const equalOpponentDiffPrice = parse18("61700");
  const equalInitiatorDiffPrice = parse18("61900");
  const finalPrice = parse18("61800");
  const finalPrice2 = parse18("73800");
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();
    players = [owner, opponent, alice];
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    usdtAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await USDT.decimals())));
    XyroToken = await new XyroTokenERC677__factory(owner).deploy(
      parse18((1e13).toString())
    );
    xyroAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await XyroToken.decimals())));
    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()]
    );
    Game = await new OneVsOneExactPrice__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Game.grantRole(await Game.GAME_MASTER_ROLE(), owner.address);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    for (let i = 0; i < players.length; i++) {
      await USDT.mint(players[i].address, parse18("10000000"));
      await USDT.connect(players[i]).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
      await XyroToken.approve(players[i].address, ethers.MaxUint256);
      await XyroToken.transfer(players[i].address, parse18("10000"));
      await XyroToken.connect(players[i]).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
    }
    //set mock feed ids
    const feedIds = [
      "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439",
      "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782",
      "0x000387d7c042a9d5c97c15354b531bd01bf6d3a351e190f2394403cf2f79bde9",
      "0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265",
      "0x0003c915006ba88731510bb995c190e80b5c9cfe8cd8a19aaf00e0ed61d0b3bc",
      "0x0003d64b0bdb0046a65e4ebb0a9866215044634524673c65bff4096a197fcff5",
      "0x0003d338ea2ac3be9e026033b1aa601673c37bab5e13851c59966f9f820754d6",
      "0x00032b6edb94b883e95693b8fdae3deeedab2c48dd699cafa43a8d134d344813",
      "0x00035e3ddda6345c3c8ce45639d4449451f1d5828d7a70845e446f04905937cd",
    ];
    await Upkeep.setfeedNumberBatch(feedIds);
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
        ethers.ZeroAddress,
        endTime,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      let game = await Game.decodeData(currentGameId);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));

      expect(
        (await USDT.balanceOf(await Treasury.getAddress())) - oldTreasuryBalance
      ).to.be.equal(usdtAmount);
      expect(sentUserAmount).to.be.equal(usdtAmount);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
    });

    it("should fail - game creation disabled", async function () {
      await Game.toggleActive();
      const endTime = (await time.latest()) + fortyFiveMinutes;
      await expect(
        Game.createGame(
          feedNumber,
          opponent.address,
          endTime,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress()
        )
      ).to.be.revertedWith(requireCreationEnabled);
    });

    it("should fail - game creation with deposit disabled", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      await expect(
        Game.createGameWithDeposit(
          feedNumber,
          opponent.address,
          endTime,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress()
        )
      ).to.be.revertedWith(requireCreationEnabled);
      await Game.toggleActive();
    });

    it("should fail - wrong min bet duration", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress()
        )
      ).to.be.revertedWith(requireMinBetDuration);
    });

    it("should fail - wrong feedNumber createGame", async function () {
      const wrongFeedNumber = 9;
      await expect(
        Game.createGame(
          wrongFeedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress()
        )
      ).to.be.revertedWith(requireApprovedFeedNumber);
    });

    it("should fail - wrong feedNumber createGameWithDepisit", async function () {
      const wrongFeedNumber = 9;
      await expect(
        Game.createGameWithDeposit(
          wrongFeedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress()
        )
      ).to.be.revertedWith(requireApprovedFeedNumber);
    });

    it("should fail - wrong max bet duration", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          opponent.address,
          (await time.latest()) + monthUnix * 20,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress()
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
          0,
          await USDT.getAddress()
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
          100,
          await USDT.getAddress()
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
      expect(sentUserAmount).to.be.equal(usdtAmount);
      expect(game.gameStatus).to.be.equal(Status.Started);
      let data = await Game.games(currentGameId);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
    });

    it("should create and accept exact price open bet with zero address", async function () {
      const tx = await Game.createGame(
        feedNumber,
        ethers.ZeroAddress,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.closeGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Cancelled
      );
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
    });

    it("should close game accepted game if 3 days passed without finish", async function () {
      const threeDaysUnix = 259205;
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      await time.increase(threeDaysUnix + fortyFiveMinutes);
      await Game.closeGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Cancelled
      );
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
    });

    it("should fail - attempt to close an accepted game after 2 days past endTime", async function () {
      const twoDaysUnix = 172800;
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      await time.increase(twoDaysUnix + fortyFiveMinutes);
      await expect(Game.closeGame(currentGameId)).to.be.revertedWith(
        requireWrongStatus
      );
    });

    it("should create and liquidate game", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      await time.increase(monthUnix);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await expect(Game.liquidateGame(currentGameId)).to.emit(
        Treasury,
        "FeeCollected"
      );
      expect(await Treasury.collectedFee(await USDT.getAddress())).to.be.equal(
        usdtAmount / BigInt(10)
      );
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Cancelled
      );
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
    });

    it("should fail - closeGame wrong status", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        usdtAmount * BigInt(2) -
          (usdtAmount * (await Game.fee())) / BigInt(10000)
      );
    });

    it("should finalize global game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = (await time.latest()) + 1;
      const tx = await Game.createGame(
        feedNumber,
        ethers.ZeroAddress,
        endTime,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];

      let gameData = await Game.decodeData(currentGameId);
      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(ethers.ZeroAddress);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(0);
      expect(data.finalPrice).to.be.equal(0);
      expect(gameData.gameStatus).to.be.equal(Status.Created);

      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      gameData = await Game.decodeData(currentGameId);

      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(opponent.address);
      data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(data.finalPrice).to.be.equal(0);
      expect(gameData.gameStatus).to.be.equal(Status.Started);

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
      gameData = await Game.decodeData(currentGameId);

      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(opponent.address);
      data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(data.finalPrice).to.be.equal(finalPrice);
      expect(gameData.gameStatus).to.be.equal(Status.Finished);

      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        usdtAmount * BigInt(2) -
          (usdtAmount * (await Game.fee())) / BigInt(10000)
      );
    });

    it("should finalize global game with deposit", async function () {
      const oldOwnerDepositBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      await Treasury.deposit(usdtAmount, await USDT.getAddress());
      const newOwnerDepositBalance = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      expect(newOwnerDepositBalance - oldOwnerDepositBalance).to.be.equal(
        usdtAmount
      );

      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = (await time.latest()) + 1;

      const tx = await Game.createGameWithDeposit(
        feedNumber,
        ethers.ZeroAddress,
        endTime,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[0]!.args[0];

      let gameData = await Game.decodeData(currentGameId);
      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(ethers.ZeroAddress);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(0);
      expect(data.finalPrice).to.be.equal(0);
      expect(gameData.gameStatus).to.be.equal(Status.Created);

      const oldOpponentDepositBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      await Treasury.connect(opponent).deposit(
        usdtAmount,
        await USDT.getAddress()
      );
      const newOpponentDepositBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      expect(newOpponentDepositBalance - oldOpponentDepositBalance).to.be.equal(
        usdtAmount
      );

      await Game.connect(opponent).acceptGameWithDeposit(
        currentGameId,
        opponentPrice
      );
      gameData = await Game.decodeData(currentGameId);

      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(opponent.address);
      data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(data.finalPrice).to.be.equal(0);
      expect(gameData.gameStatus).to.be.equal(Status.Started);

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
      gameData = await Game.decodeData(currentGameId);

      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(opponent.address);
      data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(data.finalPrice).to.be.equal(finalPrice);
      expect(gameData.gameStatus).to.be.equal(Status.Finished);

      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        usdtAmount * BigInt(2) -
          (usdtAmount * (await Game.fee())) / BigInt(10000)
      );
    });

    it("initiator shoild win", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
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
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(owner.address);
      expect(newBalance - oldBalance).to.be.equal(
        usdtAmount * BigInt(2) -
          (usdtAmount * (await Game.fee())) / BigInt(10000)
      );
    });

    it("should refund with equal price diff", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        equalInitiatorDiffPrice,
        usdtAmount,
        await USDT.getAddress()
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
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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
        usdtAmount,
        await USDT.getAddress()
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

    it("should fail - old chainlink report", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      await time.increase(fortyFiveMinutes + 60);
      await expect(
        Game.finalizeGame(
          currentGameId,
          abiEncodeInt192WithTimestamp(
            finalPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireChainlinkReport);
    });
  });

  describe("Games with XyroToken", async function () {
    it("should fail - attempt to create a game with unapproved token", async function () {
      await expect(
        Game.createGame(
          feedNumber,
          ethers.ZeroAddress,
          (await time.latest()) + fortyFiveMinutes,
          initiatorPrice,
          xyroAmount,
          await XyroToken.getAddress()
        )
      ).to.be.revertedWith(requireApprovedToken);
    });

    it("should create exact price game with XyroToken", async function () {
      //approve XyroToken in Treasury
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      const oldUserBalance = await XyroToken.balanceOf(owner.address);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      let tx = await Game.createGame(
        feedNumber,
        ethers.ZeroAddress,
        endTime,
        initiatorPrice,
        xyroAmount,
        await XyroToken.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      let game = await Game.decodeData(currentGameId);
      const sentUserAmount =
        oldUserBalance - (await XyroToken.balanceOf(owner.address));

      expect(
        (await XyroToken.balanceOf(await Treasury.getAddress())) -
          oldTreasuryBalance
      ).to.be.equal(xyroAmount);
      expect(sentUserAmount).to.be.equal(xyroAmount);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.opponent).to.be.equal(ethers.ZeroAddress);
      expect(game.endTime).to.be.equal(endTime);

      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(xyroAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
    });

    it("should accept exact price bet with XyroToken", async function () {
      const oldUserBalance = await XyroToken.balanceOf(opponent.address);
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      const sentUserAmount =
        oldUserBalance - (await XyroToken.balanceOf(opponent.address));
      let game = await Game.decodeData(currentGameId);
      expect(sentUserAmount).to.be.equal(xyroAmount);
      let data = await Game.games(currentGameId);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(game.gameStatus).to.be.equal(Status.Started);
    });

    it("should create and close game with XyroToken", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        xyroAmount,
        await XyroToken.getAddress()
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.closeGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Cancelled
      );
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await XyroToken.getAddress(), owner.address),
        await XyroToken.getAddress()
      );
    });

    it("should end the game with XyroToken", async function () {
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        xyroAmount,
        await XyroToken.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, opponentPrice);
      let oldBalance = await XyroToken.balanceOf(opponent.address);
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
        await Treasury.deposits(await XyroToken.getAddress(), opponent.address),
        await XyroToken.getAddress()
      );
      let newBalance = await XyroToken.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        xyroAmount * BigInt(2) -
          (xyroAmount * (await Game.fee())) / BigInt(10000)
      );
    });
  });

  describe("Permit", async function () {
    it("should finalize global game with deposit", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const startTime = (await time.latest()) + 1;
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );

      const tx = await Game.createGameWithPermit(
        feedNumber,
        ethers.ZeroAddress,
        endTime,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress(),
        {
          deadline: deadline,
          v: ownerPermit.v,
          r: ownerPermit.r,
          s: ownerPermit.s,
        }
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[2]!.args[0];

      let gameData = await Game.decodeData(currentGameId);
      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(ethers.ZeroAddress);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(0);
      expect(data.finalPrice).to.be.equal(0);
      expect(gameData.gameStatus).to.be.equal(Status.Created);

      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );

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
      gameData = await Game.decodeData(currentGameId);

      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(opponent.address);
      data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(data.finalPrice).to.be.equal(0);
      expect(gameData.gameStatus).to.be.equal(Status.Started);

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
      gameData = await Game.decodeData(currentGameId);

      expect(gameData.feedNumber).to.be.equal(feedNumber);
      expect(gameData.initiator).to.be.equal(owner.address);
      expect(gameData.startTime).to.be.equal(startTime);
      expect(gameData.endTime).to.be.equal(endTime);
      expect(gameData.opponent).to.be.equal(opponent.address);
      data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(data.finalPrice).to.be.equal(finalPrice);
      expect(gameData.gameStatus).to.be.equal(Status.Finished);

      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        usdtAmount * BigInt(2) -
          (usdtAmount * (await Game.fee())) / BigInt(10000)
      );
    });

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
        usdtAmount,
        BigInt(deadline)
      );
      const tx = await Game.createGameWithPermit(
        feedNumber,
        opponent.address,
        endTime,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress(),
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
      ).to.be.equal(usdtAmount);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));
      expect(sentUserAmount).to.be.equal(usdtAmount);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.opponent).to.be.equal(opponent.address);
      expect(game.endTime).to.be.equal(endTime);

      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
      expect(data.initiatorPrice).to.be.equal(initiatorPrice);
    });

    it("should fail - game creation disabled", async function () {
      await Game.toggleActive();
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + fortyFiveMinutes,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress(),
          {
            deadline: deadline,
            v: ownerPermit.v,
            r: ownerPermit.r,
            s: ownerPermit.s,
          }
        )
      ).to.be.revertedWith(requireCreationEnabled);
      await Game.toggleActive();
    });

    it("should fail - wrong min bet duration", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress(),
          {
            deadline: deadline,
            v: ownerPermit.v,
            r: ownerPermit.r,
            s: ownerPermit.s,
          }
        )
      ).to.be.revertedWith(requireMinBetDuration);
    });

    it("should fail - wrong feedNumber createGameWithPermit", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );
      const wrongFeedNumber = 9;
      await expect(
        Game.createGameWithPermit(
          wrongFeedNumber,
          opponent.address,
          (await time.latest()) + 1,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress(),
          {
            deadline: deadline,
            v: ownerPermit.v,
            r: ownerPermit.r,
            s: ownerPermit.s,
          }
        )
      ).to.be.revertedWith(requireApprovedFeedNumber);
    });

    it("should fail - wrong max bet duration", async function () {
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let ownerPermit = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + monthUnix * 20,
          initiatorPrice,
          usdtAmount,
          await USDT.getAddress(),
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
        parse18("0"),
        BigInt(deadline)
      );
      await expect(
        Game.createGameWithPermit(
          feedNumber,
          opponent.address,
          (await time.latest()) + fortyFiveMinutes,
          initiatorPrice,
          0,
          await USDT.getAddress(),
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
        usdtAmount,
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
      expect(sentUserAmount).to.be.equal(usdtAmount);
      let data = await Game.games(currentGameId);
      expect(data.opponentPrice).to.be.equal(opponentPrice);
      expect(game.gameStatus).to.be.equal(Status.Started);
    });

    it("should fail - acceptGame wrong status", async function () {
      await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
      const tx = await Game.createGame(
        feedNumber,
        opponent.address,
        (await time.latest()) + fortyFiveMinutes,
        initiatorPrice,
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      await Game.closeGame(currentGameId);
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
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
        usdtAmount,
        await USDT.getAddress()
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
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
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let opponentPermit = await getPermitSignature(
        opponent,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
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
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      currentGameId = receipt!.logs[1]!.args[0];
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let alicePermit = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
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

  it("should toggle game creation", async function () {
    expect(await Game.isActive()).to.be.equal(true);
    await Game.toggleActive();
    expect(await Game.isActive()).to.be.equal(false);
    await Game.toggleActive();
    expect(await Game.isActive()).to.be.equal(true);
  });
});
