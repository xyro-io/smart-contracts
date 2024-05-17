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
import { MockUpkeep } from "../typechain-types/contracts/MockUpkeep";
import { MockUpkeep__factory } from "../typechain-types/factories/contracts/MockUpkeep__factory";
import { abiEncodeInt192 } from "../scripts/helper";
import { FrontHelper } from "../typechain-types/contracts/FrontHelper";
import { FrontHelper__factory } from "../typechain-types/factories/contracts/FrontHelper__factory";

const parse18 = ethers.parseEther;
const monthUnix = 2629743;
const requireMaxBetDuration = "Max game duration must be lower";
const requireMinBetDuration = "Min game duration must be higher";
const requireWrongBetAmount="Wrong deposit amount";
const requireWrongStatus="Wrong status!";
const requireGameClosed="Game is closed for new players";
const requireSameAssetPrice="Same asset prices";
const requireOnlyCertainAccount="Only certain account can accept";
const requireWrongSender="Wrong sender";
const requireOnlyOpponent="Only opponent can refuse";
const requireEarlyFinish="Too early to finish";
const requireOnlyOwner="OwnableUnauthorizedAccount"

describe("OneVsOneExactPrice", () => {
  let opponent: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroToken;
  let Treasury: Treasury;
  let Game: OneVsOneExactPrice;
  let Upkeep: MockUpkeep;
  let FrontHelper: FrontHelper;
  const feedId = "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439";
  const assetPrice = parse18("2310");
  const betAmount = parse18("100");
  const initiatorPrice = (assetPrice / BigInt(100)) * BigInt(123);
  const opponentPrice = (assetPrice / BigInt(100)) * BigInt(105);
  const finalPrice = abiEncodeInt192(
    ((assetPrice / BigInt(100)) * BigInt(103)).toString(), feedId
  );
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
    Upkeep = await new MockUpkeep__factory(owner).deploy();
    await Game.setTreasury(await Treasury.getAddress());
    await USDT.mint(await opponent.getAddress(), parse18("1000"));
    await Treasury.setUpkeep(await Upkeep.getAddress());
    await Treasury.setFee(100);
    await Treasury.grantRole(
      await Treasury.DISTRIBUTOR_ROLE(),
      await Game.getAddress()
    );
    FrontHelper = await new FrontHelper__factory(owner).deploy();
  });

  it("should create exact price bet", async function () {
    await USDT.approve(await Treasury.getAddress(), ethers.MaxUint256);
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    let bet = await Game.games(currentBetId);
    expect(bet.initiator).to.equal(await owner.getAddress());
    expect(bet.gameStatus).to.equal(currentBetId);
  });

  it("should accept exact price bet", async function () {
    await USDT.connect(opponent).approve(
      await Treasury.getAddress(),
      ethers.MaxUint256
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).acceptGame(
      currentBetId,
      opponentPrice
    );
    let bet = await Game.games(currentBetId);
    expect(bet.gameStatus).to.equal(2);
  });

  it("should end exact price game", async function () {
    let oldBalance = await USDT.balanceOf(await opponent.getAddress());
    await time.increase(2700);
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.finalizeGame(currentBetId, finalPrice);
    let newBalance = await USDT.balanceOf(await opponent.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("initiator shoild win", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).acceptGame(
      currentBetId,
      opponentPrice
    );
    let oldBalance = await USDT.balanceOf(await owner.getAddress());
    await time.increase(2700);
    await Game.finalizeGame(currentBetId, abiEncodeInt192(initiatorPrice.toString(),feedId));
    let newBalance = await USDT.balanceOf(await owner.getAddress());
    expect(newBalance).to.be.above(oldBalance);
  });

  it("should create and accept exact price open bet with zero address", async function () {
    await Game.createGame(
      feedId,
      ethers.ZeroAddress,
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );

    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).acceptGame(
      currentBetId,
      opponentPrice
    );
    expect((await Game.games(currentBetId)).gameStatus).to.equal(2);
  });

  it("should create and refuse game with acceptGame function", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );

    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).acceptGame(
      currentBetId,
      0
    );
    expect((await Game.games(currentBetId)).gameStatus).to.equal(4);
  });

  it("should create and close game", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    await time.increase(2700 / 3);
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.closeGame(
      currentBetId
    );
    expect((await Game.games(currentBetId)).gameStatus).to.equal(1);
  })

  it("should fail - wrong min bet duration", async function () {
    await expect(Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 1,
      initiatorPrice,
      betAmount
    )).to.be.revertedWith(requireMinBetDuration);
  });

  it("should fail - wrong max bet duration", async function () {
    await expect(Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + monthUnix * 20,
      initiatorPrice,
      betAmount
    )).to.be.revertedWith(requireMaxBetDuration);
  });

  it("should fail - Wrong deposit amount", async function () {
    await expect(Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      100
    )).to.be.revertedWith(requireWrongBetAmount);
  });

  it("should fail - acceptGame wrong status", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).refuseGame(currentBetId);
    await expect(Game.connect(opponent).acceptGame(currentBetId, opponentPrice)).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - acceptGame game closed after 1/3 of duration", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    await time.increase(2700 / 3);
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.connect(opponent).acceptGame(currentBetId, opponentPrice)).to.be.revertedWith(requireGameClosed);
  });

  it("should fail - acceptGame same asset price", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.connect(opponent).acceptGame(currentBetId, initiatorPrice)).to.be.revertedWith(requireSameAssetPrice);
  });

  it("should fail - acceptGame only opponent can accept", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.connect(alice).acceptGame(currentBetId, opponentPrice)).to.be.revertedWith(requireOnlyCertainAccount);
  });

  it("should fail - closeGame wrong status", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.closeGame(currentBetId)).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - closeGame wrong sender", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.connect(alice).closeGame(currentBetId)).to.be.revertedWith(requireWrongSender);
  });

  it("should fail - refuseGame only opponent can refuse bet", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.connect(alice).refuseGame(currentBetId)).to.be.revertedWith(requireOnlyOpponent);
  });

  it("should fail - refuseGame wrong status", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).acceptGame(currentBetId, opponentPrice)
    await expect(Game.connect(opponent).refuseGame(currentBetId)).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - finalizeGame wrong status", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await expect(Game.finalizeGame(currentBetId,finalPrice)).to.be.revertedWith(requireWrongStatus);
  });

  it("should fail - finalizeGame ealy finalization", async function () {
    await Game.createGame(
      feedId,
      await opponent.getAddress(),
      await time.latest(),
      (await time.latest()) + 2700,
      initiatorPrice,
      betAmount
    );
    const currentBetId = await Game.totalGames() - BigInt(1);
    await Game.connect(opponent).acceptGame(currentBetId, opponentPrice)
    const data = await FrontHelper.getExactPriceData(await Game.getAddress())
    console.log(data);
    await expect(Game.finalizeGame(currentBetId, finalPrice)).to.be.revertedWith(requireEarlyFinish);
  });

});
