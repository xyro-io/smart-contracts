import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Bullseye } from "../typechain-types/contracts/Bullseye";
import { Bullseye__factory } from "../typechain-types/factories/contracts/Bullseye__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";

import {
  abiEncodeInt192WithTimestamp,
  calculateRakebackRate,
  createBullseyePriceData,
  getPermitSignature,
} from "../scripts/helper";

const parse18 = ethers.parseEther;
const fortyFiveMinutes = 2700;
const fifteenMinutes = 900;
const requireFinishedGame = "Finish previous game first";
const requireOpenedGame = "Game is closed for new players";
const requireStartedGame = "Start the game first";
const requirePastEndTime = "Too early to finish";
const requireValidChainlinkReport = "Old chainlink report";
const requireSufficentDepositAmount = "Insufficent deposit amount";
const requireApprovedToken = "Unapproved token";
const maxPlayersReached = "Max player amount reached";
const requireLowerFee = "Fee exceeds the cap";
const requireAboveMinDepositAmount = "Wrong min deposit amount";
const requireApprovedFeedNumber = "Wrong feed number";

describe("Bullseye", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let john: HardhatEthersSigner;
  let max: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: Bullseye;
  let Upkeep: MockVerifier;
  let players: any;
  let usdtAmount: bigint;
  let xyroAmount: bigint;
  let domain: any;
  let types: any;
  const feedNumber = 4;
  const guessPriceOpponent = parse18("63000");
  const guessPriceAlice = parse18("58000");
  const guessBobPrice = parse18("57000");
  const guessOwnerPrice = parse18("57387");
  const guessMaxPrice = parse18("45000");
  const guessJohnPrice = parse18("70000");
  const finalPriceExact = parse18("58000");
  const finalPriceCloser = parse18("63500");

  const getRandomUint256 = ethers.toBigInt(ethers.randomBytes(32)); // 32 bytes = 256 bits

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
    Game = await new Bullseye__factory(owner).deploy();
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
    await Game.setSigner(owner.address);
    domain = {
      name: "XYRO",
      version: "1",
      chainId: 1337,
      verifyingContract: await Game.getAddress(),
    };

    types = {
      SignedPriceHash: [
        { name: "assetPriceHash", type: "bytes32" },
        { name: "from", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
  });

  describe("Create game", async function () {
    it("should create bullseye game", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(await Game.depositAmount()).to.equal(usdtAmount);
      await Game.closeGame();
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
          wrongFeedNumber,
          await USDT.getAddress(),
          0,
          parse18("5"),
          true
        )
      ).to.be.revertedWith(requireApprovedFeedNumber);
    });

    it("should fail - start new game without finishing previous", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );

      await expect(
        Game.startGame(
          (await time.latest()) + fortyFiveMinutes,
          (await time.latest()) + fifteenMinutes,
          usdtAmount,
          feedNumber,
          await USDT.getAddress(),
          0,
          parse18("5"),
          true
        )
      ).to.be.revertedWith(requireFinishedGame);
      await Game.closeGame();
    });

    it("should fail - wrong min deposit amount", async function () {
      await expect(
        Game.startGame(
          (await time.latest()) + fortyFiveMinutes,
          (await time.latest()) + fifteenMinutes,
          1,
          feedNumber,
          await USDT.getAddress(),
          0,
          parse18("5"),
          true
        )
      ).to.be.revertedWith(requireAboveMinDepositAmount);
    });
  });

  describe("Play game", async function () {
    beforeEach(async () => {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
    });
    it("should play", async function () {
      const data = await createBullseyePriceData(
        owner,
        [opponent.address],
        [guessPriceOpponent],
        Game
      );
      let tx = await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[1]?.args;
      expect(newPlayerLog[0]).to.be.equal(opponent.address);
      expect(newPlayerLog[1]).to.be.equal(data.priceHashArr[0].assetPriceHash);
      expect(newPlayerLog[2]).to.be.equal(usdtAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(0);

      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(usdtAmount);
      expect(
        await Treasury.lockedRakeback(
          await Game.currentGameId(),
          opponent.address,
          0
        )
      ).to.be.equal(
        (usdtAmount *
          calculateRakebackRate(await XyroToken.balanceOf(opponent.address))) /
          BigInt(100)
      );
      const playerGuessData = await Game.playerGuessData(0);
      expect(playerGuessData.player).to.be.equal(opponent.address);
      expect(playerGuessData.assetPriceHash).to.be.equal(
        data.priceHashArr[0].assetPriceHash
      );
      expect(playerGuessData.assetPrice).to.be.equal(0);
    });

    it("should fail - use same signature with altered data", async function () {
      let data = await createBullseyePriceData(
        owner,
        [opponent.address],
        [guessPriceOpponent],
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      data.priceHashArr[0].nonce = await Game.nonces(opponent.address);
      await expect(
        Game.connect(opponent).play(data.priceHashArr[0], data.signatures[0])
      ).to.be.revertedWith("Invalid signature");
    });

    it("should fail - use same signature twice", async function () {
      let data = await createBullseyePriceData(
        owner,
        [opponent.address],
        [guessPriceOpponent],
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await expect(
        Game.connect(opponent).play(data.priceHashArr[0], data.signatures[0])
      ).to.be.revertedWith("Invalid signature");
    });

    it("should fail - play with other player's signature", async function () {
      let data = await createBullseyePriceData(
        owner,
        [opponent.address],
        [guessPriceOpponent],
        Game
      );
      await expect(
        Game.connect(alice).play(data.priceHashArr[0], data.signatures[0])
      ).to.be.revertedWith("Wrong sender");
    });

    it("should play with deposited amount", async function () {
      let data = await createBullseyePriceData(
        owner,
        [alice.address],
        [guessPriceAlice],
        Game
      );
      await Treasury.connect(alice).deposit(
        usdtAmount,
        await USDT.getAddress()
      );
      let tx = await Game.connect(alice).playWithDeposit(
        data.priceHashArr[0],
        data.signatures[0]
      );
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[0]?.args;
      expect(newPlayerLog[0]).to.be.equal(alice.address);
      expect(newPlayerLog[1]).to.be.equal(data.priceHashArr[0].assetPriceHash);
      expect(newPlayerLog[2]).to.be.equal(usdtAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(0);
      expect(await USDT.balanceOf(Treasury.getAddress())).to.equal(usdtAmount);
      const playerGuessData = await Game.playerGuessData(0);
      expect(playerGuessData.player).to.be.equal(alice.address);
      expect(playerGuessData.assetPrice).to.be.equal(0);
      expect(playerGuessData.assetPriceHash).to.be.equal(
        data.priceHashArr[0].assetPriceHash
      );
    });

    it("should fail - insufficent deposit amount", async function () {
      let data = await createBullseyePriceData(
        owner,
        [owner.address],
        [guessPriceOpponent],
        Game
      );

      await expect(
        Game.playWithDeposit(data.priceHashArr[0], data.signatures[0])
      ).to.be.revertedWith(requireSufficentDepositAmount);
    });

    it("should fail - play after time is up", async function () {
      let data = await createBullseyePriceData(
        owner,
        [alice.address],
        [guessPriceAlice],
        Game
      );

      await time.increase(fifteenMinutes);
      await expect(
        Game.connect(alice).play(data.priceHashArr[0], data.signatures[0])
      ).to.be.revertedWith(requireOpenedGame);
    });

    it("should fail - play game before it's started", async function () {
      let data = await createBullseyePriceData(
        owner,
        [alice.address],
        [guessPriceAlice],
        Game
      );

      await Game.closeGame();
      await expect(
        Game.connect(alice).play(data.priceHashArr[0], data.signatures[0])
      ).to.be.revertedWith(requireOpenedGame);
    });
  });

  describe("Close game", async function () {
    it("should close game and refund (closeGame)", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
      let data = await createBullseyePriceData(
        owner,
        [alice.address],
        [guessPriceAlice],
        Game
      );

      await Game.connect(alice).play(data.priceHashArr[0], data.signatures[0]);
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await time.increase(fortyFiveMinutes);
      await expect(Game.closeGame()).to.emit(Game, "BullseyeCancelled");
      expect(await Game.getTotalPlayers()).to.be.equal(0);
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.above(oldBalance);
    });
  });

  describe("Price reveal", async function () {
    beforeEach(async () => {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
    });

    it("should reveal prices", async function () {
      const guessPrices = [guessPriceOpponent, guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [opponent.address, alice.address],
        guessPrices,
        Game
      );

      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );

      await Game.connect(alice).play(data.priceHashArr[1], data.signatures[1]);

      let tx = await Game.revealPrices(data.salts, guessPrices);
      let receipt = await tx.wait();
      let log = receipt?.logs[0]?.args;
      expect(log[0][0]).to.be.equal(guessPriceOpponent);
      expect(log[0][1]).to.be.equal(guessPriceAlice);
    });

    it("should fail - wrong prices", async function () {
      const guessPrices = [guessPriceOpponent, guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await Game.connect(alice).play(data.priceHashArr[1], data.signatures[1]);

      await expect(
        Game.revealPrices(data.salts, [guessPriceAlice, guessPriceAlice])
      ).to.be.revertedWith("Invalid price data");
    });

    it("should fail - wrong array length", async function () {
      let data = await createBullseyePriceData(
        owner,
        [opponent.address, alice.address],
        [guessPriceOpponent, guessPriceAlice],
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await Game.connect(alice).play(data.priceHashArr[1], data.signatures[1]);

      await expect(
        Game.revealPrices([data.salts[1]], [guessPriceAlice])
      ).to.be.revertedWith("Wrong array length");
    });
  });

  describe("Finalize game", async function () {
    beforeEach(async () => {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
    });
    it("should fail - game not started", async function () {
      await Game.closeGame();
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireStartedGame);
    });

    it("should fail - too early to finish", async function () {
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requirePastEndTime);
      await Game.closeGame();
    });

    it("should fail - old chainlink report", async function () {
      const guessPrices = [guessPriceOpponent, guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await Game.connect(alice).play(data.priceHashArr[1], data.signatures[1]);
      await time.increase(fortyFiveMinutes * 2);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.be.revertedWith(requireValidChainlinkReport);
    });

    it("should close game and refund (finalizeGame)", async function () {
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      const guessPrices = [guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [alice.address],
        guessPrices,
        Game
      );
      await Game.connect(alice).play(data.priceHashArr[0], data.signatures[0]);
      await time.increase(fortyFiveMinutes);
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeCancelled");
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(newBalance).to.be.equal(oldBalance);
    });

    it("should finish game with 2 players (same prices)", async function () {
      const guessPrices = [guessPriceOpponent, guessPriceOpponent];
      let data = await createBullseyePriceData(
        owner,
        [opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await Game.connect(alice).play(data.priceHashArr[1], data.signatures[1]);
      let oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.revealPrices(data.salts, guessPrices);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceCloser.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      const withdrawnFeesAlice =
        (usdtAmount * (await Game.fee())) / BigInt(10000);
      const rakebackAlice = await Treasury.lockedRakeback(
        gameId,
        alice.address,
        1
      );
      const wonAmountOpponent =
        usdtAmount * BigInt(2) - withdrawnFeesAlice - rakebackAlice;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesAlice);
      expect(newAliceBalance).to.be.equal(oldAliceBalance);
      expect(newOpponentBalance - oldOpponentBalance).to.be.equal(
        wonAmountOpponent
      );
    });

    it("should check exact range - 5$", async function () {
      const guessPrices = [parse18("63507"), parse18("63505")];
      let data = await createBullseyePriceData(
        owner,
        [opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await Game.connect(alice).play(data.priceHashArr[1], data.signatures[1]);
      await time.increase(fortyFiveMinutes);
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceCloser.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      const events = receipt?.logs.filter(
        (event: any) => event.fragment?.name === "BullseyeFinalized"
      );
      expect(events![0].args![3]).to.be.equal(true);
    });

    it("should finish game with 2 players (exact price, first player wins)", async function () {
      let oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      const guessPrices = [guessPriceAlice, guessPriceOpponent];
      let data = await createBullseyePriceData(
        owner,
        [alice.address, opponent.address],
        guessPrices,
        Game
      );
      await Game.connect(alice).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.revealPrices(data.salts, guessPrices);
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        1
      );
      const withdrawnFeesOpponent =
        (usdtAmount * (await Game.fee())) / BigInt(10000);
      const wonAmountAlice =
        usdtAmount * BigInt(2) - rakebackOpponent - withdrawnFeesOpponent;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesOpponent);
      expect(newAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
    });

    it.skip("should finish game with 2 players (the same price, the same time)", async function () {
      let oldAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      await ethers.provider.send("evm_setAutomine", [false]);

      const guessPrices = [guessPriceAlice, guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [alice.address, opponent.address],
        guessPrices,
        Game
      );
      await Game.connect(alice).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );

      await ethers.provider.send("evm_setAutomine", [true]);

      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );

      let newAliceBalance = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOpponentBalance = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        1
      );
      const withdrawnFeesOpponent =
        (usdtAmount * (await Game.fee())) / BigInt(10000);
      const wonAmountAlice =
        usdtAmount * BigInt(2) - rakebackOpponent - withdrawnFeesOpponent;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesOpponent);
      expect(newAliceBalance - oldAliceBalance).to.be.equal(wonAmountAlice);
      expect(oldOpponentBalance).to.be.equal(newOpponentBalance);
    });

    it("should end bullseye game (exact, 3 players)", async function () {
      const guessPrices = [guessBobPrice, guessPriceOpponent, guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [bob.address, opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(bob).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );
      //alice should win exact
      await Game.connect(alice).play(data.priceHashArr[2], data.signatures[2]);
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        1
      );
      const withdrawnFeesOpponent =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      const rakebackBob = await Treasury.lockedRakeback(gameId, bob.address, 0);
      const withdrawnFeesBob =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      let wonAmountAlice =
        usdtAmount * BigInt(3) -
        withdrawnFeesBob -
        withdrawnFeesOpponent -
        rakebackOpponent -
        rakebackBob;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesBob + withdrawnFeesOpponent);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
    });

    it("should end bullseye game (exact, same players)", async function () {
      const guessPrices = [guessBobPrice, guessPriceOpponent, guessPriceAlice];
      let dataBob1 = await createBullseyePriceData(
        owner,
        [bob.address],
        [guessBobPrice],
        Game
      );
      await Game.connect(bob).play(
        dataBob1.priceHashArr[0],
        dataBob1.signatures[0]
      );
      let dataBob2 = await createBullseyePriceData(
        owner,
        [bob.address],
        [guessPriceOpponent],
        Game
      );
      await Game.connect(bob).play(
        dataBob2.priceHashArr[0],
        dataBob2.signatures[0]
      );
      let dataBob3 = await createBullseyePriceData(
        owner,
        [bob.address],
        [guessPriceAlice],
        Game
      );
      //alice price should win exact
      await Game.connect(bob).play(
        dataBob3.priceHashArr[0],
        dataBob3.signatures[0]
      );
      let oldBob2Deposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.revealPrices(
        [dataBob1.salts[0], dataBob2.salts[0], dataBob3.salts[0]],
        guessPrices
      );
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);
      let newBob2Deposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      const rakebackBob1 = await Treasury.lockedRakeback(
        gameId,
        bob.address,
        1
      );
      const withdrawnFeesBob1 =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      const rakebackBob0 = await Treasury.lockedRakeback(
        gameId,
        bob.address,
        0
      );
      const withdrawnFeesBob0 =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      let wonAmountBob2 =
        usdtAmount * BigInt(3) -
        withdrawnFeesBob0 -
        withdrawnFeesBob1 -
        rakebackBob1 -
        rakebackBob0;
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesBob0 + withdrawnFeesBob1);
      expect(newBob2Deposit - oldBob2Deposit).to.be.equal(wonAmountBob2);
    });

    it("should end bullseye game (3 players, same guesses)", async function () {
      const guessPrices = [guessBobPrice, guessBobPrice, guessBobPrice];
      let data = await createBullseyePriceData(
        owner,
        [bob.address, opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(bob).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );
      await Game.connect(alice).play(data.priceHashArr[2], data.signatures[2]);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][1]).to.be.equal(opponent.address);
      expect(finalizeEventLog[0][2]).to.be.equal(alice.address);
      expect(finalizeEventLog[1][0]).to.be.equal(0);
      expect(finalizeEventLog[1][1]).to.be.equal(1);
      expect(finalizeEventLog[1][2]).to.be.equal(2);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        1
      );
      const withdrawnFeesPerLostPlayer =
        (usdtAmount * (await Game.fee())) / BigInt(10000);

      const rakebackAlice = await Treasury.lockedRakeback(
        gameId,
        alice.address,
        2
      );
      let wonAmountBob =
        usdtAmount * BigInt(3) -
        withdrawnFeesPerLostPlayer * BigInt(2) -
        rakebackOpponent -
        rakebackAlice;
      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesPerLostPlayer * BigInt(2));
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOpponentDeposit).to.be.equal(oldOpponentDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (5 players)", async function () {
      const guessPrices = [
        guessPriceOpponent,
        guessBobPrice,
        guessJohnPrice,
        guessMaxPrice,
        guessPriceAlice,
      ];
      let data = await createBullseyePriceData(
        owner,
        [
          opponent.address,
          bob.address,
          john.address,
          max.address,
          alice.address,
        ],
        guessPrices,
        Game
      );
      await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      await Game.connect(bob).play(data.priceHashArr[1], data.signatures[1]);
      await Game.connect(john).play(data.priceHashArr[2], data.signatures[2]);
      await Game.connect(max).play(data.priceHashArr[3], data.signatures[3]);
      await Game.connect(alice).play(data.priceHashArr[4], data.signatures[4]);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );

      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const opponentRakeback = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        0
      );
      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(4);
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceCloser.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(opponent.address);
      expect(finalizeEventLog[0][1]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(0);
      expect(finalizeEventLog[1][1]).to.be.equal(4);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceCloser);
      expect(finalizeEventLog[3]).to.be.equal(false);

      let wonAmountOpponent =
        usdtAmount * BigInt(5) -
        totalRakeback -
        totalWithdrawnFees +
        opponentRakeback;

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newOpponentDeposit - oldOpponentDeposit).to.be.equal(
        wonAmountOpponent
      );
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
      expect(oldBobDeposit).to.be.equal(newBobDeposit);
    });

    it("should end bullseye game (6 players, exact)", async function () {
      const guessPrices = [
        guessBobPrice,
        guessPriceOpponent,
        guessOwnerPrice,
        guessJohnPrice,
        guessMaxPrice,
        guessPriceAlice,
      ];
      let data = await createBullseyePriceData(
        owner,
        [
          bob.address,
          opponent.address,
          owner.address,
          john.address,
          max.address,
          alice.address,
        ],
        guessPrices,
        Game
      );
      await Game.connect(bob).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );
      await Game.connect(owner).play(data.priceHashArr[2], data.signatures[2]);
      await Game.connect(john).play(data.priceHashArr[3], data.signatures[3]);
      await Game.connect(max).play(data.priceHashArr[4], data.signatures[4]);
      await Game.connect(alice).play(data.priceHashArr[5], data.signatures[5]);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const aliceRakeback = await Treasury.lockedRakeback(
        gameId,
        alice.address,
        5
      );
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address,
        2
      );
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[3]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(5);
      expect(finalizeEventLog[1][1]).to.be.equal(2);
      expect(finalizeEventLog[1][2]).to.be.equal(0);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(4);
      const totalRakebackOfLostPlayers =
        totalRakeback - aliceRakeback - ownerRakeback;
      const pot =
        usdtAmount * BigInt(6) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;
      let wonAmountAlice = (pot * (await Game.rates(2, 0))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(2, 1))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldBobDeposit).to.be.equal(newBobDeposit);
    });

    it("should end bullseye game (6 players)", async function () {
      const guessPrices = [
        guessBobPrice,
        guessPriceOpponent,
        guessOwnerPrice,
        guessJohnPrice,
        guessMaxPrice,
        guessMaxPrice,
      ];
      let data = await createBullseyePriceData(
        owner,
        [
          bob.address,
          opponent.address,
          owner.address,
          john.address,
          max.address,
          alice.address,
        ],
        guessPrices,
        Game
      );
      await Game.connect(bob).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );
      await Game.connect(owner).play(data.priceHashArr[2], data.signatures[2]);
      await Game.connect(john).play(data.priceHashArr[3], data.signatures[3]);
      await Game.connect(max).play(data.priceHashArr[4], data.signatures[4]);
      await Game.connect(alice).play(data.priceHashArr[5], data.signatures[5]);
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address, 0);
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address,
        2
      );
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[3]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(4);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback;
      const pot =
        usdtAmount * BigInt(6) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;
      let wonAmountBob = (pot * (await Game.rates(1, 1))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(1, 0))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (10 players)", async function () {
      const signers = await ethers.getSigners();
      let guessPrices = [
        guessBobPrice,
        guessPriceOpponent,
        guessOwnerPrice,
        guessJohnPrice,
        guessMaxPrice,
        guessMaxPrice,
      ];
      let players = [bob, opponent, owner, john, max, alice];
      let playerAddresses = [
        bob.address,
        opponent.address,
        owner.address,
        john.address,
        max.address,
        alice.address,
      ];
      for (let i = 6; i < 10; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        players.push(signers[i]);
        playerAddresses.push(signers[i].address);
        guessPrices.push(guessMaxPrice + BigInt(i));
      }
      let data = await createBullseyePriceData(
        owner,
        playerAddresses,
        guessPrices,
        Game
      );
      for (let i = 0; i < 10; i++) {
        await Game.connect(players[i]).play(
          data.priceHashArr[i],
          data.signatures[i]
        );
      }

      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address, 0);
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address,
        2
      );
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[3]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(8);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback;
      const pot =
        usdtAmount * BigInt(10) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;
      let wonAmountBob = (pot * (await Game.rates(1, 1))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(1, 0))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
    });

    it("should end bullseye game (12 players)", async function () {
      const signers = await ethers.getSigners();
      let guessPrices = [
        guessBobPrice,
        guessPriceOpponent,
        guessOwnerPrice,
        guessJohnPrice,
        guessMaxPrice,
        guessMaxPrice,
      ];
      let players = [bob, opponent, owner, john, max, alice];
      let playerAddresses = [
        bob.address,
        opponent.address,
        owner.address,
        john.address,
        max.address,
        alice.address,
      ];
      for (let i = 6; i < 12; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        players.push(signers[i]);
        playerAddresses.push(signers[i].address);
        guessPrices.push(guessMaxPrice + BigInt(i));
      }
      let data = await createBullseyePriceData(
        owner,
        playerAddresses,
        guessPrices,
        Game
      );
      for (let i = 0; i < 12; i++) {
        await Game.connect(players[i]).play(
          data.priceHashArr[i],
          data.signatures[i]
        );
      }
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address, 0);
      const opponentRakeback = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        1
      );
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address,
        2
      );
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[4]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(false);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(9);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback - opponentRakeback;
      const pot =
        usdtAmount * BigInt(12) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;

      let wonAmountBob = (pot * (await Game.rates(3, 1))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(3, 0))) / BigInt(10000);
      let wonAmountOpponent = (pot * (await Game.rates(3, 2))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(newOpponentDeposit - oldOpponentDeposit).to.be.equal(
        wonAmountOpponent
      );
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldAliceDeposit).to.be.equal(newAliceDeposit);
    });

    it("should end bullseye game (12 players, exact)", async function () {
      const signers = await ethers.getSigners();
      let guessPrices = [
        guessBobPrice,
        guessPriceOpponent,
        guessOwnerPrice,
        guessJohnPrice,
        guessMaxPrice,
        guessPriceAlice,
      ];
      let players = [bob, opponent, owner, john, max, alice];
      let playerAddresses = [
        bob.address,
        opponent.address,
        owner.address,
        john.address,
        max.address,
        alice.address,
      ];
      for (let i = 6; i < 12; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        players.push(signers[i]);
        playerAddresses.push(signers[i].address);
        guessPrices.push(guessMaxPrice + BigInt(i));
      }
      let data = await createBullseyePriceData(
        owner,
        playerAddresses,
        guessPrices,
        Game
      );
      for (let i = 0; i < 12; i++) {
        await Game.connect(players[i]).play(
          data.priceHashArr[i],
          data.signatures[i]
        );
      }
      let oldBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let oldOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let oldAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let oldOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let oldJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let oldMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await USDT.getAddress()
      );
      const gameId = await Game.currentGameId();
      const totalRakeback = await Game.totalRakeback();
      const bobRakeback = await Treasury.lockedRakeback(gameId, bob.address, 0);
      const aliceRakeback = await Treasury.lockedRakeback(
        gameId,
        alice.address,
        5
      );
      const ownerRakeback = await Treasury.lockedRakeback(
        gameId,
        owner.address,
        2
      );
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[4]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(owner.address);
      expect(finalizeEventLog[0][2]).to.be.equal(bob.address);
      expect(finalizeEventLog[1][0]).to.be.equal(5);
      expect(finalizeEventLog[1][1]).to.be.equal(2);
      expect(finalizeEventLog[1][2]).to.be.equal(0);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);

      const totalWithdrawnFees =
        ((usdtAmount * (await Game.fee())) / BigInt(10000)) * BigInt(9);
      const totalRakebackOfLostPlayers =
        totalRakeback - bobRakeback - ownerRakeback - aliceRakeback;
      const pot =
        usdtAmount * BigInt(12) -
        totalWithdrawnFees -
        totalRakebackOfLostPlayers;

      let wonAmountBob = (pot * (await Game.rates(4, 2))) / BigInt(10000);
      let wonAmountOwner = (pot * (await Game.rates(4, 1))) / BigInt(10000);
      let wonAmountAlice = (pot * (await Game.rates(4, 0))) / BigInt(10000);

      let newBobDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        bob.address
      );
      let newOpponentDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        opponent.address
      );
      let newAliceDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        alice.address
      );
      let newOwnerDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        owner.address
      );
      let newJohnDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        john.address
      );
      let newMaxDeposit = await Treasury.deposits(
        await USDT.getAddress(),
        max.address
      );

      expect(
        (await Treasury.collectedFee(await USDT.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(totalWithdrawnFees);
      expect(newBobDeposit - oldBobDeposit).to.be.equal(wonAmountBob);
      expect(newOwnerDeposit - oldOwnerDeposit).to.be.equal(wonAmountOwner);
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
      expect(oldMaxDeposit).to.be.equal(newMaxDeposit);
      expect(oldJohnDeposit).to.be.equal(newJohnDeposit);
      expect(oldOpponentDeposit).to.be.equal(newOpponentDeposit);
    });

    it("should fail - max amount of players reached", async function () {
      const signers = await ethers.getSigners();
      let guessPrices: bigint[] = [];
      let playerAddresses: string[] = [];
      let players: HardhatEthersSigner[] = [];
      for (let i = 0; i < 101; i++) {
        await USDT.mint(signers[i].address, parse18("10000000"));
        await USDT.connect(signers[i]).approve(
          await Treasury.getAddress(),
          ethers.MaxUint256
        );
        players.push(signers[i]);
        playerAddresses.push(signers[i].address);
        guessPrices.push(guessMaxPrice + BigInt(i));
      }
      let data = await createBullseyePriceData(
        owner,
        playerAddresses,
        guessPrices,
        Game
      );
      for (let i = 0; i < 100; i++) {
        await Game.connect(players[i]).play(
          data.priceHashArr[i],
          data.signatures[i]
        );
      }
      await expect(
        Game.connect(signers[100]).play(
          data.priceHashArr[100],
          data.signatures[100]
        )
      ).to.be.revertedWith(maxPlayersReached);
    });
  });

  describe("Games with XyroToken", async function () {
    it("should fail - attempt to create a game with unapproved token", async function () {
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await expect(
        Game.startGame(
          endTime,
          stopPredictAt,
          xyroAmount,
          feedNumber,
          await XyroToken.getAddress(),
          0,
          parse18("5"),
          true
        )
      ).to.be.revertedWith(requireApprovedToken);
    });

    it("should create bullseye game with XyroToken", async function () {
      //approve XyroToken in Treasury
      await Treasury.setToken(await XyroToken.getAddress(), true);
      const endTime = (await time.latest()) + fortyFiveMinutes;
      const stopPredictAt = (await time.latest()) + fifteenMinutes;
      await Game.startGame(
        endTime,
        stopPredictAt,
        xyroAmount,
        feedNumber,
        await XyroToken.getAddress(),
        0,
        parse18("5"),
        true
      );
      let game = await Game.decodeData();
      expect(game.endTime).to.be.equal(endTime);
      expect(game.stopPredictAt).to.be.equal(stopPredictAt);
      expect(await Game.depositAmount()).to.equal(xyroAmount);
      await Game.closeGame();
    });

    it("should play with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);

      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        xyroAmount,
        feedNumber,
        await XyroToken.getAddress(),
        0,
        parse18("5"),
        true
      );
      let data = await createBullseyePriceData(
        owner,
        [opponent.address],
        [guessPriceOpponent],
        Game
      );
      let tx = await Game.connect(opponent).play(
        data.priceHashArr[0],
        data.signatures[0]
      );
      let receipt = await tx.wait();
      let newPlayerLog = receipt?.logs[1]?.args;

      expect(newPlayerLog[0]).to.be.equal(opponent.address);
      expect(newPlayerLog[1]).to.be.equal(data.priceHashArr[0].assetPriceHash);
      expect(newPlayerLog[2]).to.be.equal(xyroAmount);
      expect(newPlayerLog[3]).to.be.equal(await Game.currentGameId());
      expect(newPlayerLog[4]).to.be.equal(0);

      expect(await XyroToken.balanceOf(Treasury.getAddress())).to.equal(
        xyroAmount
      );
      const playerGuessData = await Game.playerGuessData(0);
      expect(playerGuessData.player).to.be.equal(opponent.address);
      expect(playerGuessData.assetPriceHash).to.be.equal(
        data.priceHashArr[0].assetPriceHash
      );
      expect(playerGuessData.assetPrice).to.be.equal(0);
      await Game.closeGame();
    });

    it("should end bullseye game (exact, 3 players) with XyroToken", async function () {
      await Treasury.setToken(await XyroToken.getAddress(), true);

      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        xyroAmount,
        feedNumber,
        await XyroToken.getAddress(),
        0,
        parse18("5"),
        true
      );
      const guessPrices = [guessBobPrice, guessPriceOpponent, guessPriceAlice];
      let data = await createBullseyePriceData(
        owner,
        [bob.address, opponent.address, alice.address],
        guessPrices,
        Game
      );
      await Game.connect(bob).play(data.priceHashArr[0], data.signatures[0]);
      await Game.connect(opponent).play(
        data.priceHashArr[1],
        data.signatures[1]
      );
      //alice should win exact
      await Game.connect(alice).play(data.priceHashArr[2], data.signatures[2]);
      let oldAliceDeposit = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      await time.increase(fortyFiveMinutes);
      const oldTreasuryFeeBalance = await Treasury.collectedFee(
        await XyroToken.getAddress()
      );
      const gameId = await Game.currentGameId();
      await Game.revealPrices(data.salts, guessPrices);
      let tx = await Game.finalizeGame(
        abiEncodeInt192WithTimestamp(
          finalPriceExact.toString(),
          feedNumber,
          await time.latest()
        )
      );
      let receipt = await tx.wait();
      let finalizeEventLog = receipt?.logs[2]?.args;
      expect(finalizeEventLog[0][0]).to.be.equal(alice.address);
      expect(finalizeEventLog[0][1]).to.be.equal(bob.address);
      expect(finalizeEventLog[0][2]).to.be.equal(opponent.address);
      expect(finalizeEventLog[1][0]).to.be.equal(2);
      expect(finalizeEventLog[1][1]).to.be.equal(0);
      expect(finalizeEventLog[1][2]).to.be.equal(1);
      expect(finalizeEventLog[2]).to.be.equal(finalPriceExact);
      expect(finalizeEventLog[3]).to.be.equal(true);
      const rakebackBob = await Treasury.lockedRakeback(gameId, bob.address, 0);
      const rakebackOpponent = await Treasury.lockedRakeback(
        gameId,
        opponent.address,
        1
      );
      const withdrawnFeesPerLostPlayer =
        (xyroAmount * (await Game.fee())) / BigInt(10000);

      let wonAmountAlice =
        xyroAmount * BigInt(3) -
        withdrawnFeesPerLostPlayer * BigInt(2) -
        rakebackBob -
        rakebackOpponent;
      let newAliceDeposit = await Treasury.deposits(
        await XyroToken.getAddress(),
        alice.address
      );
      expect(
        await Treasury.collectedFee(await XyroToken.getAddress())
      ).to.be.equal(withdrawnFeesPerLostPlayer * BigInt(2));
      expect(
        (await Treasury.collectedFee(await XyroToken.getAddress())) -
          oldTreasuryFeeBalance
      ).to.be.equal(withdrawnFeesPerLostPlayer * BigInt(2));
      expect(newAliceDeposit - oldAliceDeposit).to.be.equal(wonAmountAlice);
    });
  });

  describe("Permit", async function () {
    it("should play with permit", async function () {
      let oldBalance = await USDT.balanceOf(alice.getAddress());
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );

      const deadline = (await time.latest()) + fortyFiveMinutes;
      let result = await getPermitSignature(
        alice,
        USDT,
        await Treasury.getAddress(),
        usdtAmount,
        BigInt(deadline)
      );

      let data = await createBullseyePriceData(
        owner,
        [alice.address],
        [guessPriceAlice],
        Game
      );

      await Game.connect(alice).playWithPermit(
        data.priceHashArr[0],
        data.signatures[0],
        {
          deadline: deadline,
          v: result.v,
          r: result.r,
          s: result.s,
        }
      );
      await Treasury.connect(alice).withdraw(
        await Treasury.deposits(await USDT.getAddress(), alice.address),
        await USDT.getAddress()
      );
      let newBalance = await USDT.balanceOf(alice.getAddress());
      expect(oldBalance).to.be.above(newBalance);
    });
  });

  describe("Miscellaneous", async function () {
    it("should change exact range", async function () {
      const newRange = 10000;
      const oldRange = await Game.exactRange();
      await Game.setExactRange(newRange);
      expect(await Game.exactRange()).to.be.equal(newRange);
      await Game.setExactRange(oldRange);
      expect(await Game.exactRange()).to.be.equal(oldRange);
    });

    it("should change treasury", async function () {
      let temporaryTreasury = await upgrades.deployProxy(
        await ethers.getContractFactory("Treasury"),
        [await USDT.getAddress(), await XyroToken.getAddress()]
      );
      await Game.setTreasury(await temporaryTreasury.getAddress());
      expect(await Game.treasury()).to.equal(
        await temporaryTreasury.getAddress()
      );
      //return treasury back
      await Game.setTreasury(await Treasury.getAddress());
      expect(await Game.treasury()).to.equal(await Treasury.getAddress());
    });

    it("should return player amount", async function () {
      expect(await Game.getTotalPlayers()).to.be.equal(0);
    });

    it("should fail - change fee to 31%", async function () {
      await expect(Game.setFee(3100)).to.be.revertedWith(requireLowerFee);
    });
  });

  describe("Events", async function () {
    it("should emit finalize game event", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
      const saltAlice = getRandomUint256;
      const priceHashAlice = ethers.solidityPackedKeccak256(
        ["uint256", "uint256"],
        [guessPriceAlice, saltAlice]
      );
      const priceHashDataAlice = {
        assetPriceHash: priceHashAlice,
        from: alice.address,
        nonce: await Game.nonces(owner.address),
        deadline: (await time.latest()) + 1000,
      };
      let signatureAlice = await owner.signTypedData(
        domain,
        types,
        priceHashDataAlice
      );
      await Game.connect(alice).play(priceHashDataAlice, signatureAlice);
      const saltOpponent = getRandomUint256;
      const priceHashOpponent = ethers.solidityPackedKeccak256(
        ["uint256", "uint256"],
        [guessPriceOpponent, saltOpponent]
      );
      const priceHashDataOpponent = {
        assetPriceHash: priceHashOpponent,
        from: opponent.address,
        nonce: await Game.nonces(owner.address),
        deadline: (await time.latest()) + 1000,
      };
      let signatureOpponent = await owner.signTypedData(
        domain,
        types,
        priceHashDataOpponent
      );
      await Game.connect(opponent).play(
        priceHashDataOpponent,
        signatureOpponent
      );
      await time.increase(fortyFiveMinutes);
      await Game.revealPrices(
        [saltAlice, saltOpponent],
        [guessPriceAlice, guessPriceOpponent]
      );
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeFinalized");
    });

    it("should emit cancelled game event if finalizeGame called with 0 and 1 players", async function () {
      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
      await time.increase(fortyFiveMinutes);
      //0 players
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeCancelled");

      await Game.startGame(
        (await time.latest()) + fortyFiveMinutes,
        (await time.latest()) + fifteenMinutes,
        usdtAmount,
        feedNumber,
        await USDT.getAddress(),
        0,
        parse18("5"),
        true
      );
      const saltAlice = getRandomUint256;
      const priceHashAlice = ethers.solidityPackedKeccak256(
        ["uint256", "uint256"],
        [guessPriceAlice, saltAlice]
      );
      const priceHashDataAlice = {
        assetPriceHash: priceHashAlice,
        from: alice.address,
        nonce: await Game.nonces(owner.address),
        deadline: (await time.latest()) + 1000,
      };
      let signatureAlice = await owner.signTypedData(
        domain,
        types,
        priceHashDataAlice
      );
      await Game.connect(alice).play(priceHashDataAlice, signatureAlice);
      await time.increase(fortyFiveMinutes);
      //1 player
      await expect(
        Game.finalizeGame(
          abiEncodeInt192WithTimestamp(
            finalPriceExact.toString(),
            feedNumber,
            await time.latest()
          )
        )
      ).to.emit(Game, "BullseyeCancelled");
    });
  });
});
