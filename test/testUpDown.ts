import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { UpDown } from "../typechain-types/contracts/UpDown";
import { UpDown__factory } from "../typechain-types/factories/contracts/UpDown__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";
import {
  abiEncodeInt192WithTimestamp,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const DENOMENATOR = BigInt(10000);
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
const requireSufficentDepositAmount = "Insufficent deposit amount";
const requireHigherDepositAmount = "Wrong deposit amount";
const requireApprovedToken = "Unapproved token";
const maxPlayersReached = "Max player amount reached";
const requireAboveMinDepositAmount = "Wrong min deposit amount";
const requireApprovedFeedNumber = "Wrong feed number";
const requireHigherGap = "Timeframe gap must be higher";
const requireStartingPriceNotSet = "Starting price already set";

describe("UpDown", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: UpDown;
  let Upkeep: MockVerifier;
  let players: any;
  let usdtAmount: bigint;
  let xyroAmount: bigint;
  let lowUsdtAmount: bigint;
  const assetPrice = parse18("2310");
  const finalPriceDown = parse18("2000");
  const finalPriceUp = parse18("3000");
  const feedNumber = 4;
  beforeEach(async () => {
    [owner, opponent, alice, bob] = await ethers.getSigners();
    players = [owner, opponent, alice, bob];
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    usdtAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await USDT.decimals())));
    lowUsdtAmount = (usdtAmount * BigInt(90)) / BigInt(100);
    XyroToken = await new XyroTokenERC677__factory(owner).deploy(
      parse18((1e13).toString())
    );
    xyroAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await XyroToken.decimals())));
    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()],
      { unsafeAllow: ["constructor"] }
    );
    Game = await new UpDown__factory(owner).deploy();
    Upkeep = await new MockVerifier__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());

    await Treasury.setUpkeep(await Upkeep.getAddress());
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
    await Game.grantRole(await Game.GAME_MASTER_ROLE(), owner.address);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
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

  describe("Create game", () => {
    it("should create updown game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(game.feedNumber).to.equal(feedNumber);
    });

    it("should fail - wrong feedNumber startGame", async function () {
      const wrongFeedNumber = 9;
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          usdtAmount,
          await USDT.getAddress(),
          wrongFeedNumber
        )
      ).to.be.revertedWith(requireApprovedFeedNumber);
    });

    it("should fail - start new game without finishing previous", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await expect(
        Game.startGame(
          (await time.latest()) + fortyFiveMinutes,
          (await time.latest()) + fifteenMinutes,
          usdtAmount,
          await USDT.getAddress(),
          feedNumber
        )
      ).to.be.revertedWith(requireFinishedGame);
    });

    it("should fail - wrong min deposit amount", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          (await time.latest()) + fortyFiveMinutes,
          (await time.latest()) + fifteenMinutes,
          0,
          await USDT.getAddress(),
          feedNumber
        )
      ).to.be.revertedWith(requireAboveMinDepositAmount);
    });
    it("should fail - incorrect timeframe gap", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = endTime - 10;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          usdtAmount,
          await USDT.getAddress(),
          feedNumber
        )
      ).to.be.revertedWith(requireHigherGap);
    });
  });

  describe("Play game", () => {
    it("should play up with deposited amount", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const oldBobBalance = await USDT.balanceOf(bob.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Treasury.connect(bob).deposit(usdtAmount, await USDT.getAddress());
      await Game.connect(bob).playWithDeposit(true, usdtAmount);
      const newBobBalance = await USDT.balanceOf(bob.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(await Game.isParticipating(bob.address)).to.be.equal(true);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      expect(oldBobBalance - newBobBalance).to.be.equal(usdtAmount);
      expect(await Treasury.locked(await Game.currentGameId())).to.be.equal(
        usdtAmount
      );

      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), bob.address)
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(await Game.totalDepositsUp()).to.be.equal(usdtAmount);
      expect(await Game.totalDepositsDown()).to.be.equal(0);

      expect(await Game.totalRakebackUp()).to.be.equal(
        (usdtAmount * BigInt(3)) / BigInt(100)
      );

      expect(await Game.totalRakebackDown()).to.be.equal(0);
    });

    it("should play down", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const oldOpponentBalance = await USDT.balanceOf(opponent.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(opponent).play(false, usdtAmount);
      const newOpponentBalance = await USDT.balanceOf(opponent.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(await Game.isParticipating(opponent.address)).to.be.equal(true);
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      expect(oldOpponentBalance - newOpponentBalance).to.be.equal(usdtAmount);

      expect(await Treasury.locked(await Game.currentGameId())).to.be.equal(
        usdtAmount
      );

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(await Game.totalDepositsDown()).to.be.equal(usdtAmount);

      expect(await Game.totalRakebackDown()).to.be.equal(
        (usdtAmount * BigInt(3)) / BigInt(100)
      );
    });

    it("should play up", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const oldAliceBalance = await USDT.balanceOf(alice.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(alice).play(true, usdtAmount);
      const newAliceBalance = await USDT.balanceOf(alice.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      expect(oldAliceBalance - newAliceBalance).to.be.equal(usdtAmount);
      expect(await Treasury.locked(await Game.currentGameId())).to.be.equal(
        usdtAmount
      );

      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), alice.address)
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(await Game.totalDepositsUp()).to.be.equal(usdtAmount);

      expect(await Game.totalRakebackUp()).to.be.equal(
        (usdtAmount * BigInt(3)) / BigInt(100)
      );
    });

    it("should fail - wrong deposit amount play()", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await expect(Game.play(true, lowUsdtAmount)).to.be.revertedWith(
        requireHigherDepositAmount
      );
    });

    it("should fail - wrong deposit amount playWithDeposit()", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await expect(
        Game.playWithDeposit(true, lowUsdtAmount)
      ).to.be.revertedWith(requireHigherDepositAmount);
    });

    it("should fail - insufficent deposit amount", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await expect(Game.playWithDeposit(true, usdtAmount)).to.be.revertedWith(
        requireSufficentDepositAmount
      );
    });

    it("should fail - already participating", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await expect(
        Game.connect(alice).play(true, usdtAmount)
      ).to.be.revertedWith(requireNewPlayer);
    });

    it("should fail - Game closed", async function () {
      await time.increase(fifteenMinutes);
      await expect(Game.play(true, usdtAmount)).to.be.revertedWith(
        requireOpenedGame
      );
    });
  });

  describe("Set starting price", () => {
    it("should fail - old chainlink report", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await expect(
        Game.setStartingPrice(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            (await time.latest()) + 61
          )
        )
      ).to.be.revertedWith(requireValidChainlinkReport);
    });

    it("should fail - early chainlink report", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await expect(
        Game.setStartingPrice(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            (await time.latest()) - 61
          )
        )
      ).to.be.reverted;
    });

    it("should fail - starting price already set", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await expect(
        Game.setStartingPrice(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireStartingPriceNotSet);
    });

    it("should set starting price", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      expect(await Game.startingPrice()).to.be.equal(assetPrice);
    });

    it("should fail - cannot play after start price was set", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await expect(Game.connect(bob).play(true, usdtAmount)).to.be.revertedWith(
        requireOpenedGame
      );
    });

    it("should fail - max amount of players reached", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );

      const signers = await ethers.getSigners();
      for (let i = 0; i < 100; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        await Game.connect(signers[i]).play(true, usdtAmount);
      }
      await expect(
        Game.connect(signers[100]).play(true, usdtAmount)
      ).to.be.revertedWith(maxPlayersReached);
    });

    it("should fail - too early", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await expect(
        Game.setStartingPrice(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireOnTime);
    });

    it("should fail - not enough players", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await time.increase(fifteenMinutes);
      await expect(
        Game.setStartingPrice(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireMoreThanZeroPlayers);
      await Game.closeGame();
    });
  });

  describe("Close game", () => {
    it("should close game and refund", async function () {
      const oldOpponentBalance = await USDT.balanceOf(opponent.address);
      const oldAliceBalance = await USDT.balanceOf(alice.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);

      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), alice.address)
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      await Game.closeGame();
      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), alice.address)
      ).to.be.equal(0);

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal(0);
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      const newOpponentBalance = await USDT.balanceOf(opponent.address);
      const newAliceBalance = await USDT.balanceOf(alice.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );

      expect(oldAliceBalance).to.be.equal(newAliceBalance);
      expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
      expect(oldTreasuryBalance).to.be.equal(newTreasuryBalance);
    });
  });

  describe("Finalize game", () => {
    it("should fail - game not started", async function () {
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceUp.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireStartedGame);
    });
    it("should fail - too early to finish", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceUp.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requirePastEndTime);
      await Game.closeGame();
    });
    it("should fail - old chainlink report", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 3);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceUp.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireValidChainlinkReport);
      await Game.closeGame();
    });
    it("should fail - startring price should be set", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fortyFiveMinutes);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceUp.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireStartingPrice);
      await Game.closeGame();
    });
    it("should end updown game (up wins)", async function () {
      let oldDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let newDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let rakeback = (usdtAmount * BigInt(3)) / BigInt(100);
      let fee = (usdtAmount * (await Game.fee())) / DENOMENATOR;
      let wonAmount = BigInt(2) * usdtAmount - (fee + rakeback);
      expect(newDeposit - oldDeposit).to.be.equal(wonAmount);
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
    });

    it("should pay out equivalently (up wins)", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(true, usdtAmount * BigInt(4));
      await Game.connect(bob).play(false, usdtAmount * BigInt(5));
      await Game.connect(owner).play(false, usdtAmount * BigInt(5));
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );

      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      expect(newOpponentDeposit).to.be.equal(newAliceDeposit * BigInt(4));
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
    });

    it("should refund if starting price and final price are equal", async function () {
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.equal(oldBalance);
    });

    it("should refund if players only in up team", async function () {
      let oldBalance = await USDT.balanceOf(opponent.getAddress());
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await USDT.connect(opponent).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
      await Game.connect(opponent).play(true, usdtAmount);
      let currntBalance = await USDT.balanceOf(opponent.getAddress());
      expect(oldBalance).to.be.above(currntBalance);
      await USDT.connect(alice).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
      await Game.connect(alice).play(true, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceDown.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      currntBalance = await USDT.balanceOf(opponent.getAddress());
      expect(oldBalance).to.be.equal(currntBalance);
    });
    it("should refund if players only in down team", async function () {
      let oldBalance = await USDT.balanceOf(opponent.getAddress());
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await USDT.connect(opponent).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
      await Game.connect(opponent).play(false, usdtAmount);
      let currntBalance = await USDT.balanceOf(opponent.getAddress());
      expect(oldBalance).to.be.above(currntBalance);
      await USDT.connect(alice).approve(
        Treasury.getAddress(),
        ethers.MaxUint256
      );
      await Game.connect(alice).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceDown.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
      currntBalance = await USDT.balanceOf(opponent.getAddress());
      expect(oldBalance).to.be.equal(currntBalance);
    });
  });

  describe("Games with XyroToken", () => {
    it("should fail - create a game with unapproved token", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          xyroAmount,
          await XyroToken.getAddress(),
          feedNumber
        )
      ).to.be.revertedWith(requireApprovedToken);
    });
    it("should create updown game with XyroToken", async function () {
      //approve XyroToken in Treasury
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        await XyroToken.getAddress(),
        feedNumber
      );
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(game.feedNumber).to.equal(feedNumber);
    });
    it("should play down with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        await XyroToken.getAddress(),
        feedNumber
      );
      const oldOpponentBalance = await XyroToken.balanceOf(opponent.address);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(opponent).play(false, xyroAmount);
      const newOpponentBalance = await XyroToken.balanceOf(opponent.address);
      const newTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(xyroAmount);
      expect(oldOpponentBalance - newOpponentBalance).to.be.equal(xyroAmount);
    });

    it("should play up with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        await XyroToken.getAddress(),
        feedNumber
      );
      const oldAliceBalance = await XyroToken.balanceOf(alice.address);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(alice).play(true, xyroAmount);
      const newAliceBalance = await XyroToken.balanceOf(alice.address);
      const newTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(xyroAmount);
      expect(oldAliceBalance - newAliceBalance).to.be.equal(xyroAmount);
    });

    it("should set starting price with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        await XyroToken.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, xyroAmount);
      await Game.connect(opponent).play(false, xyroAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      expect(await Game.startingPrice()).to.be.equal(assetPrice);
    });

    it("should close game and refund XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        await XyroToken.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, xyroAmount);
      await Game.connect(opponent).play(false, xyroAmount);
      const oldOpponentBalance = await XyroToken.balanceOf(opponent.address);
      const oldAliceBalance = await XyroToken.balanceOf(alice.address);
      const oldTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );
      await Game.closeGame();
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await XyroToken.getAddress(), opponent.address),
        await XyroToken.getAddress()
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await XyroToken.getAddress(), alice.address),
        await XyroToken.getAddress()
      );
      const newOpponentBalance = await XyroToken.balanceOf(opponent.address);
      const newAliceBalance = await XyroToken.balanceOf(alice.address);
      const newTreasuryBalance = await XyroToken.balanceOf(
        await Treasury.getAddress()
      );

      expect(newAliceBalance - oldAliceBalance).to.be.equal(xyroAmount);
      expect(newOpponentBalance - oldOpponentBalance).to.be.equal(xyroAmount);
      expect(oldTreasuryBalance - newTreasuryBalance).to.be.equal(
        BigInt(2) * xyroAmount
      );
    });

    it("should end updown game (up wins) with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);
      let oldDeposit = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        await XyroToken.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, xyroAmount);
      await Game.connect(opponent).play(false, xyroAmount);

      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let newDeposit = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );

      let rakeback = (xyroAmount * BigInt(3)) / BigInt(100);
      let fee = (xyroAmount * (await Game.fee())) / DENOMENATOR;
      let wonAmount = BigInt(2) * xyroAmount - (fee + rakeback);

      expect(newDeposit - oldDeposit).to.be.equal(wonAmount);
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await XyroToken.getAddress(), alice.address),
        await XyroToken.getAddress()
      );
    });
  });

  describe("Various rakeback rates", () => {
    beforeEach(async () => {
      //alice = 3%, bob = 1%, owner = 10%, opponent = 0%
      await XyroToken.grantMintAndBurnRoles(bob);
      await XyroToken.connect(bob)["burn(uint256)"](parse18("9000"));
      await XyroToken.grantMintAndBurnRoles(opponent);
      await XyroToken.connect(opponent)["burn(uint256)"](parse18("10000"));
    });

    it("should check rakeback rates", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const gameId = await Game.currentGameId();
      //1%
      await Game.connect(bob).play(true, usdtAmount);
      expect(await Treasury.lockedRakeback(gameId, bob.address)).to.be.equal(
        usdtAmount / BigInt(100)
      );
      //3%
      await Game.connect(alice).play(true, usdtAmount);
      expect(await Treasury.lockedRakeback(gameId, alice.address)).to.be.equal(
        (usdtAmount / BigInt(100)) * BigInt(3)
      );
      //0%
      await Game.connect(opponent).play(false, usdtAmount);
      expect(
        await Treasury.lockedRakeback(gameId, opponent.address)
      ).to.be.equal(0);
      //10%
      await Game.play(true, usdtAmount);
      expect(await Treasury.lockedRakeback(gameId, owner.address)).to.be.equal(
        (usdtAmount / BigInt(100)) * BigInt(10)
      );
    });

    it("should end updown game (up wins)", async function () {
      let oldDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.play(true, usdtAmount);
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(bob).play(false, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      let rakebackDown = usdtAmount / BigInt(100);
      let rakebackUp = (usdtAmount / BigInt(100)) * BigInt(13);
      expect(await Game.totalRakebackDown()).to.be.equal(rakebackDown);
      expect(await Game.totalRakebackUp()).to.be.equal(rakebackUp);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let newDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let fee = (usdtAmount * BigInt(2) * (await Game.fee())) / DENOMENATOR;
      let wonAmount =
        (BigInt(4) * usdtAmount - (fee + rakebackDown)) / BigInt(2);
      expect(newDeposit - oldDeposit).to.be.equal(wonAmount);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmount);
    });
  });

  describe("No rakeback", () => {
    beforeEach(async () => {
      for (let i = 0; i < players.length; i++) {
        await XyroToken.grantMintAndBurnRoles(players[i].address);
        await XyroToken.connect(players[i])["burn(uint256)"](parse18("10000"));
      }
    });
    it("should play up with deposited amount", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Treasury.connect(bob).deposit(usdtAmount, await USDT.getAddress());
      await Game.connect(bob).playWithDeposit(true, usdtAmount);

      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), bob.address)
      ).to.be.equal(0);

      expect(await Game.totalRakebackUp()).to.be.equal(0);

      expect(await Game.totalRakebackDown()).to.be.equal(0);
    });

    it("should play down", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );

      await Game.connect(opponent).play(false, usdtAmount);
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal(0);
      expect(await Game.totalDepositsDown()).to.be.equal(usdtAmount);
      expect(await Game.totalRakebackDown()).to.be.equal(0);
    });

    it("should end updown game (up wins)", async function () {
      let oldDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      await Game.connect(alice).play(true, usdtAmount);
      await Game.connect(opponent).play(false, usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let newDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal(0);
      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), alice.address)
      ).to.be.equal(0);

      let fee = (usdtAmount * (await Game.fee())) / DENOMENATOR;
      let wonAmount = BigInt(2) * usdtAmount - fee;
      expect(newDeposit - oldDeposit).to.be.equal(wonAmount);
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
    });
  });
  describe("Permit", () => {
    it("should fail - play with permit with wrong deposit amount", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        lowUsdtAmount,
        BigInt(deadline)
      );
      await expect(
        Game.playWithPermit(false, lowUsdtAmount, {
          deadline: deadline,
          v: result.v,
          r: result.r,
          s: result.s,
        })
      ).to.be.revertedWith(requireHigherDepositAmount);
    });

    it("should play down with permit", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        owner,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );
      await Game.playWithPermit(false, usdtAmount, {
        deadline: deadline,
        v: result.v,
        r: result.r,
        s: result.s,
      });
      expect(await Game.isParticipating(owner.address)).to.be.equal(true);
      expect(await Game.DownPlayers(0)).to.equal(owner.address);
    });

    it("should play up with permit", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
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
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber
      );
      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        parse18("100"),
        BigInt(deadline)
      );
      await Game.connect(alice).play(true, parse18("100"));
      await expect(
        Game.connect(alice).playWithPermit(true, usdtAmount, {
          deadline: deadline,
          v: result.v,
          r: result.r,
          s: result.s,
        })
      ).to.be.revertedWith(requireNewPlayer);
    });
  });

  it("should return amount of players", async function () {
    const result = await Game.getTotalPlayers();
    expect(result[0]).to.be.equal(0);
    expect(result[1]).to.be.equal(0);
  });
});
