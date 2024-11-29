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
  before(async () => {
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
      [await USDT.getAddress(), await XyroToken.getAddress()]
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

    it("should fail - start new game without finishing previous", async function () {
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
  });

  describe("Play game", () => {
    it("should play up with deposited amount", async function () {
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
      const oldOpponentBalance = await USDT.balanceOf(opponent.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(opponent).play(false, usdtAmount);
      const newOpponentBalance = await USDT.balanceOf(opponent.address);
      const newTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      expect(newTreasuryBalance - oldTreasuryBalance).to.be.equal(usdtAmount);
      expect(oldOpponentBalance - newOpponentBalance).to.be.equal(usdtAmount);

      expect(await Treasury.locked(await Game.currentGameId())).to.be.equal(
        usdtAmount * BigInt(2)
      );

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address
        )
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(await Game.totalDepositsUp()).to.be.equal(usdtAmount);
      expect(await Game.totalDepositsDown()).to.be.equal(usdtAmount);

      expect(await Game.totalRakebackUp()).to.be.equal(
        (usdtAmount * BigInt(3)) / BigInt(100)
      );

      expect(await Game.totalRakebackDown()).to.be.equal(
        (usdtAmount * BigInt(3)) / BigInt(100)
      );
    });

    it("should play up", async function () {
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
        usdtAmount * BigInt(3)
      );

      expect(
        await Treasury.lockedRakeback(await Game.currentGameId(), alice.address)
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(await Game.totalDepositsUp()).to.be.equal(usdtAmount * BigInt(2));
      expect(await Game.totalDepositsDown()).to.be.equal(usdtAmount);

      expect(await Game.totalRakebackUp()).to.be.equal(
        ((usdtAmount * BigInt(3)) / BigInt(100)) * BigInt(2)
      );

      expect(await Game.totalRakebackDown()).to.be.equal(
        (usdtAmount * BigInt(3)) / BigInt(100)
      );
    });

    it("should fail - wrong deposit amount play()", async function () {
      await expect(Game.play(true, lowUsdtAmount)).to.be.revertedWith(
        requireHigherDepositAmount
      );
    });

    it("should fail - wrong deposit amount playWithDeposit()", async function () {
      await expect(
        Game.playWithDeposit(true, lowUsdtAmount)
      ).to.be.revertedWith(requireHigherDepositAmount);
    });

    it("should fail - insufficent deposit amount", async function () {
      await expect(Game.playWithDeposit(true, usdtAmount)).to.be.revertedWith(
        requireSufficentDepositAmount
      );
    });

    it("should fail - already participating", async function () {
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
      await time.increase(fifteenMinutes);
      await expect(
        Game.setStartingPrice(
          abiEncodeInt192WithTimestamp(
            assetPrice.toString(),
            feedNumber,
            (await time.latest()) - 660
          )
        )
      ).to.be.revertedWith(requireValidChainlinkReport);
    });

    it("should set starting price", async function () {
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let game = await Game.decodeData();
      expect(game.startingPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
    });

    it("should fail - too early", async function () {
      await Game.closeGame();
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      await Treasury.connect(opponent).withdraw(
        await Treasury.deposits(await USDT.getAddress(), opponent.address),
        await USDT.getAddress()
      );
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
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let game = await Game.decodeData();
      expect(game.startingPrice).to.be.equal(
        assetPrice / BigInt(Math.pow(10, 14))
      );
    });

    it("should close game and refund XyroToken", async function () {
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
      expect(await Game.DownPlayers(0)).to.equal(owner.address);
    });

    it("should play up with permit", async function () {
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
  });

  it("should return amount of players", async function () {
    const result = await Game.getTotalPlayers();
    expect(result[0]).to.be.equal(0);
    expect(result[1]).to.be.equal(0);
  });
});
