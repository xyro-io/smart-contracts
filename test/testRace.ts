import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Race } from "../typechain-types/contracts/Race";
import { Race__factory } from "../typechain-types/factories/contracts/Race__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";

import {
  abiEncodeInt192WithTimestamp,
  calculateRakebackRate,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const fifteenMinutes = 900;
const startingPriceFirst = parse18("10");
const startingPriceSecond = parse18("2500");
const startingPriceThird = parse18("95000");
const startingPriceFourth = parse18("125");

const startingPrices = [
  startingPriceFirst,
  startingPriceSecond,
  startingPriceThird,
  startingPriceFourth,
];

const finalPriceFirst = parse18("30"); //200%
const finalPriceSecond = parse18("2875"); //15%
const finalPriceThird = parse18("113050"); //19%
const finalPriceFourth = parse18("200"); //60%

const finalPrices = [
  finalPriceFirst,
  finalPriceSecond,
  finalPriceThird,
  finalPriceFourth,
];

const finishPreviousGame = "Finish previous game first";
const wrongStopTime = "Wrong stop time";
const lowTimeframeGap = "Timeframe gap must be higher";
const wrongFeedNumber = "Wrong feed number";
const alreadyParticipating = "Already participating";
const maxPlayersReached = "Max player amount reached";
const gameClosed = "Game is closed for new players";
const tooEarly = "Too early";
const notEnoughPlayers = "Not enough players";
const wrongReportLength = "Wrong reports length";
const oldChainlinkReport = "Old chainlink report";
const startingPriceAlreadySet = "Starting price already set";
const startGameFirst = "Start the game first";
const earlyToFinish = "Too early to finish";
const startingPriceNotSet = "Starting price not set";
const gameNotStarted = "Game not started";
const zeroAddress = "Zero address";

describe("Meme coin racing", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let john: HardhatEthersSigner;
  let max: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: Race;
  let Upkeep: MockVerifier;
  let players: any;
  let usdtAmount: bigint;
  let xyroAmount: bigint;
  beforeEach(async () => {
    [owner, opponent, alice, bob, john, max] = await ethers.getSigners();
    players = [owner, opponent, alice, bob, john, max];
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
    Game = await new Race__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Game.grantRole(await Game.GAME_MASTER_ROLE(), owner.address);
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

    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    await USDT.approve(Treasury.getAddress(), ethers.MaxUint256);
    await USDT.connect(opponent).approve(
      Treasury.getAddress(),
      ethers.MaxUint256
    );
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
    it("Should create game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );
      expect(await Game.assetFeedNumber(3)).to.be.equal(3);
      const data = await Game.decodeData();
      expect(data.endTime).to.be.equal(endTime);
      expect(data.stopPredictAt).to.be.equal(stopPredictAt);
      expect(data.depositId).to.be.equal(0);
      expect(await Game.minDepositAmount()).to.be.equal(usdtAmount);
    });

    it("Should fail - wrong feed number", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          usdtAmount,
          await USDT.getAddress(),
          [0, 1, 2, 10]
        )
      ).to.be.revertedWith(wrongFeedNumber);
    });

    it("Should fail - finish previous game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;

      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          usdtAmount,
          await USDT.getAddress(),
          [0, 1, 2, 4]
        )
      ).to.be.revertedWith(finishPreviousGame);
    });

    it("Should fail - wrong stop time", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + 20;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          usdtAmount,
          await USDT.getAddress(),
          [0, 1, 2, 4]
        )
      ).to.be.revertedWith(wrongStopTime);
    });

    it("Should fail - wrong timeframe gap", async function () {
      const endTime = (await time.latest()) + fifteenMinutes + 10;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          usdtAmount,
          await USDT.getAddress(),
          [0, 1, 2, 4]
        )
      ).to.be.revertedWith(lowTimeframeGap);
    });
  });

  describe("Play", async function () {
    it("Should play game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await Game.play(usdtAmount, 0);

      const data = await Game.decodeData();
      expect(data.depositId).to.be.equal(1);
      expect(await Game.depositAmounts(0, owner.address)).to.be.equal(
        usdtAmount
      );
      const assetData = await Game.assetData(0);
      expect(assetData[0]).to.be.equal(usdtAmount);
      expect(assetData[1]).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(owner.address))) /
          BigInt(100)
      );
      expect(assetData[2]).to.be.equal(0);
    });

    it("Should play game with deposit", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );
      await Treasury["deposit(uint256,address)"](
        usdtAmount,
        await USDT.getAddress()
      );
      await Game.playWithDeposit(usdtAmount, 0);

      const data = await Game.decodeData();
      expect(data.depositId).to.be.equal(1);
      expect(await Game.depositAmounts(0, owner.address)).to.be.equal(
        usdtAmount
      );
      const assetData = await Game.assetData(0);
      expect(assetData[0]).to.be.equal(usdtAmount);
      expect(assetData[1]).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(owner.address))) /
          BigInt(100)
      );
      expect(assetData[2]).to.be.equal(0);
    });

    it("Should play game with permit", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );
      await Game.playWithPermit(usdtAmount, 0, {
        deadline: deadline,
        v: result.v,
        r: result.r,
        s: result.s,
      });

      const data = await Game.decodeData();
      expect(data.depositId).to.be.equal(1);
      expect(await Game.depositAmounts(0, owner.address)).to.be.equal(
        usdtAmount
      );
      const assetData = await Game.assetData(0);
      expect(assetData[0]).to.be.equal(usdtAmount);
      expect(assetData[1]).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(owner.address))) /
          BigInt(100)
      );
      expect(assetData[2]).to.be.equal(0);
    });
  });

  describe("Set starting price", async function () {
    it("Should set starting price", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await Game.play(usdtAmount, 0);
      await Game.connect(alice).play(usdtAmount, 1);
      await Game.connect(opponent).play(usdtAmount, 2);
      await Game.connect(bob).play(usdtAmount, 3);

      await time.increase(fifteenMinutes);
      let reports: string[];
      // for (let i = 0; i++; i < 4) {
      //   reports[i] = abiEncodeInt192WithTimestamp(
      //     startingPrices[i].toString(),
      //     i,
      //     await time.latest()
      //   );
      // }

      reports = [
        abiEncodeInt192WithTimestamp(
          startingPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      await Game.setStartingPrice(reports);

      const assetData1 = await Game.assetData(0);
      expect(assetData1[2]).to.be.equal(startingPriceFirst);
      const assetData2 = await Game.assetData(1);
      expect(assetData2[2]).to.be.equal(startingPriceSecond);
      const assetData3 = await Game.assetData(2);
      expect(assetData3[2]).to.be.equal(startingPriceThird);
      const assetData4 = await Game.assetData(3);
      expect(assetData4[2]).to.be.equal(startingPriceFourth);
    });
  });

  describe("Finalize", async function () {
    it("Should finalize game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await Game.play(usdtAmount, 0);
      await Game.connect(alice).play(usdtAmount, 1);
      await Game.connect(opponent).play(usdtAmount, 2);
      await Game.connect(bob).play(usdtAmount, 3);

      await time.increase(fifteenMinutes);
      const reports = [
        abiEncodeInt192WithTimestamp(
          startingPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      await Game.setStartingPrice(reports);

      await time.increase(fortyFiveMinutes);
      const finalReports = [
        abiEncodeInt192WithTimestamp(
          finalPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address,
          2
        )
      ).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(opponent.address))) /
          BigInt(100)
      );

      const lockedRakebackPerPerson = await Treasury.lockedRakeback(
        await Game.currentGameId(),
        opponent.address,
        2
      );
      await Game.finalizeGame(finalReports);
      const wonAmount =
        (usdtAmount *
          BigInt(3) *
          (BigInt(100) - (await Game.fee()) / BigInt(100))) /
          BigInt(100) -
        lockedRakebackPerPerson * BigInt(3);
      expect(
        await Treasury.deposits(await USDT.getAddress(), owner.address)
      ).to.be.equal(wonAmount + usdtAmount);
    });

    it("Should refund if not enought players", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await Game.play(usdtAmount, 0);

      await time.increase(fortyFiveMinutes);
      const finalReports = [
        abiEncodeInt192WithTimestamp(
          finalPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      await Game.finalizeGame(finalReports);
      expect(
        await Treasury.deposits(await USDT.getAddress(), owner.address)
      ).to.be.equal(usdtAmount);
    });

    it("Should finalize a game of 4 tokens with 2 players", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await Game.play(usdtAmount, 0);
      await Game.connect(alice).play(usdtAmount, 1);

      await time.increase(fifteenMinutes);
      const reports = [
        abiEncodeInt192WithTimestamp(
          startingPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      await Game.setStartingPrice(reports);

      await time.increase(fortyFiveMinutes);
      const finalReports = [
        abiEncodeInt192WithTimestamp(
          finalPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          finalPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          alice.address,
          1
        )
      ).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(opponent.address))) /
          BigInt(100)
      );

      const lockedRakebackPerPerson = await Treasury.lockedRakeback(
        await Game.currentGameId(),
        alice.address,
        1
      );
      await Game.finalizeGame(finalReports);
      const wonAmount =
        (usdtAmount * (BigInt(100) - (await Game.fee()) / BigInt(100))) /
          BigInt(100) -
        lockedRakebackPerPerson;
      expect(
        await Treasury.deposits(await USDT.getAddress(), owner.address)
      ).to.be.equal(wonAmount + usdtAmount);
    });
  });

  describe("Close game", async function () {
    it("Should close game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        [0, 1, 2, 3]
      );

      await Game.play(usdtAmount, 0);
      await Game.connect(alice).play(usdtAmount, 1);
      await Game.connect(opponent).play(usdtAmount, 2);
      await Game.connect(bob).play(usdtAmount, 3);

      await time.increase(fifteenMinutes);
      const reports = [
        abiEncodeInt192WithTimestamp(
          startingPriceFirst.toString(),
          0,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceSecond.toString(),
          1,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceThird.toString(),
          2,
          await time.latest()
        ),
        abiEncodeInt192WithTimestamp(
          startingPriceFourth.toString(),
          3,
          await time.latest()
        ),
      ];
      await Game.setStartingPrice(reports);
      await Game.closeGame();
      expect(
        await Treasury.deposits(await USDT.getAddress(), owner.address)
      ).to.be.equal(usdtAmount);
      expect(
        await Treasury.deposits(await USDT.getAddress(), bob.address)
      ).to.be.equal(usdtAmount);
      expect(
        await Treasury.deposits(await USDT.getAddress(), alice.address)
      ).to.be.equal(usdtAmount);
      expect(
        await Treasury.deposits(await USDT.getAddress(), opponent.address)
      ).to.be.equal(usdtAmount);
    });
  });
  describe("Events", async function () {});
});
