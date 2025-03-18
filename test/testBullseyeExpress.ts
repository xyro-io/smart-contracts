import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { BullseyeExpress } from "../typechain-types/contracts/BullseyeExpress";
import { BullseyeExpress__factory } from "../typechain-types/factories/contracts/BullseyeExpress__factory";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";
import { MockToken__factory } from "../typechain-types/factories/contracts/mock/MockERC20.sol/MockToken__factory";
import { MockVerifier } from "../typechain-types/contracts/mock/MockVerifier";
import { MockVerifier__factory } from "../typechain-types/factories/contracts/mock/MockVerifier__factory";
import { XyroTokenERC677 } from "../typechain-types/contracts/XyroTokenWithMint.sol/XyroTokenERC677";
import { XyroTokenERC677__factory } from "../typechain-types/factories/contracts/XyroTokenWithMint.sol/XyroTokenERC677__factory";
import { abiEncodeInt192WithTimestamp } from "../scripts/helper";

const parse18 = ethers.parseEther;
const monthUnix = 2629743;
const fortyFiveMinutes = 2700;

describe("BullseyeExpress", function () {
  let opponent: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let USDT: MockToken;
  let XyroToken: XyroTokenERC677;
  let Treasury: Treasury;
  let Game: BullseyeExpress;
  let Upkeep: MockVerifier;
  let players: any;
  let currentGameId: string;
  let usdtAmount: bigint;
  beforeEach(async function () {
    [owner, alice, opponent] = await ethers.getSigners();
    players = [owner, opponent, alice];
    USDT = await new MockToken__factory(owner).deploy(
      parse18((1e13).toString())
    );
    usdtAmount =
      BigInt(100) * BigInt(Math.pow(10, Number(await USDT.decimals())));
    XyroToken = await new XyroTokenERC677__factory(owner).deploy(
      parse18((1e13).toString())
    );
    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()]
    );

    Game = await new BullseyeExpress__factory(owner).deploy();

    Treasury = await upgrades.deployProxy(
      await ethers.getContractFactory("Treasury"),
      [await USDT.getAddress(), await XyroToken.getAddress()]
    );
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

  it("should start a new game", async function () {
    const tx = await Game.connect(owner).startGame(
      120,
      (await time.latest()) + 300,
      usdtAmount,
      100,
      await USDT.getAddress(),
      1,
      3
    );
    await expect(tx).to.emit(Game, "BullseyeExpressCreated");
  });

  it("should allow players to participate", async function () {
    await Game.connect(owner).startGame(
      120,
      (await time.latest()) + 300,
      usdtAmount,
      100,
      await USDT.getAddress(),
      1,
      3
    );

    const predictions = [parse18("250"), parse18("300"), parse18("450")];
    await expect(Game.connect(alice).play(predictions))
      .to.emit(Game, "BullseyeExpressNewPlayer")
      .withArgs(alice.address, predictions, usdtAmount);
  });

  it("should finalize the game and distribute rewards", async function () {
    await Game.connect(owner).startGame(
      120,
      (await time.latest()) + 300,
      usdtAmount,
      100,
      await USDT.getAddress(),
      1,
      3
    );

    const predictions1 = [parse18("250"), parse18("300"), parse18("450")];
    const predictions2 = [parse18("250"), parse18("100"), parse18("150")];
    await Game.connect(alice).play(predictions1);
    await Game.connect(opponent).play(predictions2);

    await time.increase(fortyFiveMinutes);

    await Game.finalizeGame([
      abiEncodeInt192WithTimestamp(
        parse18("200").toString(),
        3,
        (await time.latest()) + 63
      ),
      abiEncodeInt192WithTimestamp(
        parse18("149").toString(),
        3,
        (await time.latest()) + 123
      ),
      abiEncodeInt192WithTimestamp(
        parse18("155").toString(),
        3,
        (await time.latest()) + 183
      ),
    ]);
  });
});
