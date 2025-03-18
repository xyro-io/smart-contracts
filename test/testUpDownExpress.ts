import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { UpDownExpress } from "../typechain-types/contracts/UpDownExpress";
import { UpDownExpress__factory } from "../typechain-types/factories/contracts/UpDownExpress__factory";
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
const requireLowerFee = "Fee exceeds the cap";
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
  let Game: UpDownExpress;
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
    Game = await new UpDownExpress__factory(owner).deploy();
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
        60,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber,
        3
      );
      let game = await Game.decodeData();
      // expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(game.feedNumber).to.equal(feedNumber);
    });
  });

  describe("Play game", () => {
    it("should play down", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        60,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber,
        3
      );
      const oldOpponentBalance = await USDT.balanceOf(opponent.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.connect(opponent).play([false, true, false], usdtAmount);
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
          opponent.address,
          0
        )
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      // expect(await Game.totalDepositsDown()).to.be.equal(usdtAmount);

      // expect(await Game.totalRakebackDown()).to.be.equal(
      //   (usdtAmount * BigInt(3)) / BigInt(100)
      // );
    });
  });

  describe("Set starting price", () => {
    it("should set starting price", async function () {
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        60,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber,
        3
      );
      await Game.connect(alice).play([true, true, true], usdtAmount);
      await Game.connect(opponent).play([false, true, false], usdtAmount);
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
  });

  describe("Close game", () => {
    it("should close game and refund", async function () {
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      const oldOpponentBalance = await USDT.balanceOf(opponent.address);
      const oldAliceBalance = await USDT.balanceOf(alice.address);
      const oldTreasuryBalance = await USDT.balanceOf(
        await Treasury.getAddress()
      );
      await Game.startGame(
        60,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber,
        3
      );
      await Game.connect(alice).play([true, true, true], usdtAmount);
      await Game.connect(opponent).play([false, true, false], usdtAmount);

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          alice.address,
          0
        )
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address,
          0
        )
      ).to.be.equal((usdtAmount * BigInt(3)) / BigInt(100));

      await Game.closeGame();
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          alice.address,
          0
        )
      ).to.be.equal(0);

      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address,
          0
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
    it("should end updown game (up wins)", async function () {
      let oldDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        60,
        stopPredictAt,
        usdtAmount,
        await USDT.getAddress(),
        feedNumber,
        3
      );
      await Game.connect(alice).play([true, true, true], usdtAmount);
      await Game.connect(opponent).play([false, true, false], usdtAmount);
      await time.increase(fifteenMinutes);
      await Game.setStartingPrice(
        abiEncodeInt192WithTimestamp(
          assetPrice.toString(),
          feedNumber,
          await time.latest()
        )
      );
      await time.increase(fifteenMinutes * 2);
      await Game.finalizeGame([
        abiEncodeInt192WithTimestamp(
          finalPriceUp.toString(),
          feedNumber,
          (await time.latest()) + 63
        ),
        abiEncodeInt192WithTimestamp(
          parse18("3010").toString(),
          feedNumber,
          (await time.latest()) + 123
        ),
        abiEncodeInt192WithTimestamp(
          parse18("3020").toString(),
          feedNumber,
          (await time.latest()) + 183
        ),
      ]);
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
  });
});
