import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { UpDownExpress1vs1 } from "../typechain-types/contracts/UpDownExpress1vs1";
import { UpDownExpress1vs1__factory } from "../typechain-types/factories/contracts/UpDownExpress1vs1__factory";
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
const requireLowerFee = "Fee exceeds the cap";
const Status = {
  Default: 0,
  Created: 1,
  Cancelled: 2,
  Started: 3,
  Finished: 4,
};

describe("ExpressUpDownOneVsOne", () => {
  let opponent: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: UpDownExpress1vs1;
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
  beforeEach(async () => {
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
    Game = await new UpDownExpress1vs1__factory(owner).deploy();
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

    await Game.setFee(await USDT.getAddress(), 500);
    await Game.setFee(await XyroToken.getAddress(), 500);
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
        3,
        ethers.ZeroAddress,
        endTime,
        60,
        [true, false, true],
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      const events = receipt.logs.filter(
        (event: any) => event.fragment?.name === "ExactPriceCreated"
      );
      currentGameId = events[0]!.args[0];
      let game = await Game.decodeData(currentGameId);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(owner.address));
      console.log(game);
      expect(
        (await USDT.balanceOf(await Treasury.getAddress())) - oldTreasuryBalance
      ).to.be.equal(usdtAmount);
      expect(sentUserAmount).to.be.equal(usdtAmount);
      expect(game.initiator).to.be.equal(owner.address);
      expect(game.endTime).to.be.equal(endTime);
      expect(game.gameStatus).to.be.equal(Status.Created);
      expect(game.feedNumber).to.be.equal(feedNumber);
      expect(game.numberOfGuesses).to.be.equal(3);
      expect(game.priceTimeGap).to.be.equal(60);
      let data = await Game.games(currentGameId);
      expect(data.depositAmount).to.be.equal(usdtAmount);
    });
  });

  describe("Accept game", async function () {
    it("should accept exact price bet", async function () {
      let tx = await Game.createGame(
        feedNumber,
        3,
        ethers.ZeroAddress,
        (await time.latest()) + fortyFiveMinutes,
        60,
        [true, false, true],
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      const events = receipt.logs.filter(
        (event: any) => event.fragment?.name === "ExactPriceCreated"
      );
      currentGameId = events[0]!.args[0];
      const oldUserBalance = await USDT.balanceOf(opponent.address);
      await Game.connect(opponent).acceptGame(currentGameId, [
        true,
        false,
        false,
      ]);
      const sentUserAmount =
        oldUserBalance - (await USDT.balanceOf(opponent.address));
      let game = await Game.decodeData(currentGameId);
      expect(sentUserAmount).to.be.equal(usdtAmount);
      expect(game.gameStatus).to.be.equal(Status.Started);
    });
  });

  describe("Close game", async function () {
    it("should create and close game", async function () {
      let tx = await Game.createGame(
        feedNumber,
        3,
        ethers.ZeroAddress,
        (await time.latest()) + fortyFiveMinutes,
        60,
        [true, false, true],
        usdtAmount,
        await USDT.getAddress()
      );
      await time.increase(fortyFiveMinutes / 3);
      receipt = await tx.wait();
      const events = receipt.logs.filter(
        (event: any) => event.fragment?.name === "ExactPriceCreated"
      );
      currentGameId = events[0]!.args[0];
      await Game.closeGame(currentGameId);
      expect((await Game.decodeData(currentGameId)).gameStatus).to.equal(
        Status.Cancelled
      );
      await Treasury.connect(owner).withdraw(
        await Treasury.deposits(await USDT.getAddress(), owner.address),
        await USDT.getAddress()
      );
    });
  });

  describe("Finalize game", async function () {
    it("should end the game", async function () {
      let tx = await Game.createGame(
        feedNumber,
        3,
        ethers.ZeroAddress,
        (await time.latest()) + fortyFiveMinutes,
        60,
        [true, false, true],
        usdtAmount,
        await USDT.getAddress()
      );
      receipt = await tx.wait();
      const events = receipt.logs.filter(
        (event: any) => event.fragment?.name === "ExactPriceCreated"
      );
      currentGameId = events[0]!.args[0];
      await Game.connect(opponent).acceptGame(currentGameId, [
        false,
        false,
        false,
      ]);
      let oldBalance = await USDT.balanceOf(opponent.address);
      await time.increase(fortyFiveMinutes);
      await Game.finalizeGame(currentGameId, [
        abiEncodeInt192WithTimestamp(
          parse18("2900").toString(),
          feedNumber,
          (await time.latest()) + 63
        ),
        abiEncodeInt192WithTimestamp(
          parse18("3000").toString(),
          feedNumber,
          (await time.latest()) + 123
        ),
        abiEncodeInt192WithTimestamp(
          parse18("3010").toString(),
          feedNumber,
          (await time.latest()) + 183
        ),
      ]);
      const game = await Game.decodeData(currentGameId);
      expect(game.gameStatus).to.be.equal(Status.Finished);
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(opponent.address);
      expect(newBalance - oldBalance).to.be.equal(
        usdtAmount * BigInt(2) -
          (usdtAmount * (await Game.fees(await USDT.getAddress()))) /
            BigInt(10000)
      );
    });
  });
});
