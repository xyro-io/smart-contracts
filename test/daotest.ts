import { expect } from "chai";
import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { GovernorContract } from "../typechain-types/contracts/newDAO.sol/GovernorContract";
import { GovernorContract__factory } from "../typechain-types/factories/contracts/newDAO.sol/GovernorContract__factory";
import { TimeLock } from "../typechain-types/contracts/TimeLock";
import { TimeLock__factory } from "../typechain-types/factories/contracts/TimeLock__factory";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { XyroStaking } from "../typechain-types/contracts/Staking.sol/XyroStaking";
import { XyroStaking__factory } from "../typechain-types/factories/contracts/Staking.sol/XyroStaking__factory";
import { XyroGovernanceToken } from "../typechain-types/contracts/XyroVotingToken.sol/XyroGovernanceToken";
import { XyroGovernanceToken__factory } from "../typechain-types/factories/contracts/XyroVotingToken.sol/XyroGovernanceToken__factory";
import { Treasury } from "../typechain-types/contracts/Treasury.sol/Treasury";
import { Treasury__factory } from "../typechain-types/factories/contracts/Treasury.sol/Treasury__factory";
import { ExactPriceStandalone } from "../typechain-types/contracts/ExactPriceStandalone";
import { ExactPriceStandalone__factory } from "../typechain-types/factories/contracts/ExactPriceStandalone__factory";
import { UpDownStandalone } from "../typechain-types/contracts/UpDownStandalone";
import { UpDownStandalone__factory } from "../typechain-types/factories/contracts/UpDownStandalone__factory";
import { BullseyeGame } from "../typechain-types/contracts/BullseyeGame";
import { BullseyeGame__factory } from "../typechain-types/factories/contracts/BullseyeGame__factory";
import { GameFactory } from "../typechain-types/contracts/GameFactory.sol/GameFactory";
import { GameFactory__factory } from "../typechain-types/factories/contracts/GameFactory.sol/GameFactory__factory";
import { XyroVesting } from "../typechain-types/contracts/Vesting.sol/XyroVesting";
import { XyroVesting__factory } from "../typechain-types/factories/contracts/Vesting.sol/XyroVesting__factory";
const parse18 = ethers.parseEther;

describe("DAO test", () => {
  let owner: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let XyroToken: XyroToken;
  let Staking: XyroStaking;
  let Treasury: Treasury;
  let GovernanceToken: XyroGovernanceToken;
  let TimeLock: TimeLock;
  let DAO: GovernorContract;
  let GameFactory: GameFactory;
  let BullseyeGame: BullseyeGame;
  let ExactPriceStandalone: ExactPriceStandalone;
  let UpDownStandalone: UpDownStandalone;
  let XyroVesting: XyroVesting;
  let encodedFunctionCall: string;
  const year = 31556926;
  const month = 2629743;
  const proposalDescription = "decrease rakeback";
  const proposalDescription_2 = "alter time limit";
  const proposalDescription_3 = "change setup initiator fee";
  const proposalDescription_4 = "change bullseye bet amount";
  const proposalDescription_5 = "change prise places rate";
  const proposalDescription_6 = "should fail";
  const proposalDescription_7 = "increase vesting duration";
  before(async () => {
    [owner, bob, alice] = await ethers.getSigners();
    //Setup staking contract and tokens
    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
    GovernanceToken = await new XyroGovernanceToken__factory(owner).deploy();
    Staking = await new XyroStaking__factory(owner).deploy(
      await XyroToken.getAddress(),
      await GovernanceToken.getAddress()
    );
    await GovernanceToken.delegate(await owner.getAddress());
    await XyroToken.approve(await Staking.getAddress(), ethers.MaxUint256);
    await XyroToken.transfer(await Staking.getAddress(), parse18("100000"));
    //Mock treasury setup for setFee call
    Treasury = await new Treasury__factory(owner).deploy(
      await XyroToken.getAddress(),
      await XyroToken.getAddress()
    );
    await Treasury.setFee(100);
    //governance contracts
    TimeLock = await new TimeLock__factory(owner).deploy(
      2,
      [],
      [],
      owner.address
    );

    DAO = await new GovernorContract__factory(owner).deploy(
      await GovernanceToken.getAddress(),
      await TimeLock.getAddress(),
      60,
      5,
      3
    );
    await TimeLock.grantRole(
      await TimeLock.PROPOSER_ROLE(),
      await DAO.getAddress()
    );
    await TimeLock.grantRole(
      await TimeLock.EXECUTOR_ROLE(),
      await DAO.getAddress()
    );
    //function to call
    encodedFunctionCall = Treasury.interface.encodeFunctionData("setFee", [77]);
  });

  it("should create proposal", async function () {
    await DAO.propose(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription
    );
  });

  it("should vote", async function () {
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await Treasury.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription))
      ),
      voteWay
    );
  });

  it("should execute", async function () {
    await mine(4);
    await Treasury.grantRole(
      await Treasury.DAO_ROLE(),
      await TimeLock.getAddress()
    );
    await DAO.queue(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription))
    );
    await executeTx.wait(1);
    const value = await Treasury.fee();
    expect(value).to.be.equal(77);
  });

  it("should vote to change OneVsOne UpDown time limit", async function () {
    //prepare contract
    UpDownStandalone = await new UpDownStandalone__factory(owner).deploy();
    //function to call
    encodedFunctionCall = UpDownStandalone.interface.encodeFunctionData(
      "changeBetDuration",
      [year, month]
    );
    //create proposal for time gaps change
    await DAO.propose(
      [await UpDownStandalone.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_2
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await UpDownStandalone.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await UpDownStandalone.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await UpDownStandalone.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
    );
    await executeTx.wait(1);
    const minDuration = await UpDownStandalone.minDuration();
    const maxDuration = await UpDownStandalone.maxDuration();
    expect(minDuration).to.be.equal(month);
    expect(maxDuration).to.be.equal(year);
  });

  it("should vote to change OneVsOne ExactPrice time limit", async function () {
    //prepare contract
    ExactPriceStandalone = await new ExactPriceStandalone__factory(
      owner
    ).deploy();
    //function to call
    encodedFunctionCall = ExactPriceStandalone.interface.encodeFunctionData(
      "changeBetDuration",
      [year, month]
    );
    //create proposal for time gaps change
    await DAO.propose(
      [await ExactPriceStandalone.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_2
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await ExactPriceStandalone.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await ExactPriceStandalone.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await ExactPriceStandalone.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
    );
    await executeTx.wait(1);
    const minDuration = await ExactPriceStandalone.minDuration();
    const maxDuration = await ExactPriceStandalone.maxDuration();
    expect(minDuration).to.be.equal(month);
    expect(maxDuration).to.be.equal(year);
  });

  it("should vote to change setup time limit", async function () {
    //prepare contract
    GameFactory = await new GameFactory__factory(owner).deploy(
      await Treasury.getAddress()
    );
    //function to call
    encodedFunctionCall = GameFactory.interface.encodeFunctionData(
      "changeBetDuration",
      [year, month]
    );
    //create proposal for time gaps change
    await DAO.propose(
      [await GameFactory.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_2
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await GameFactory.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await GameFactory.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await GameFactory.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_2))
    );
    await executeTx.wait(1);
    const minDuration = await GameFactory.minDuration();
    const maxDuration = await GameFactory.maxDuration();
    expect(minDuration).to.be.equal(month);
    expect(maxDuration).to.be.equal(year);
  });

  it("should vote to change setup initiator fee", async function () {
    const newFee = 120;
    //function to call
    encodedFunctionCall = Treasury.interface.encodeFunctionData("setSetupFee", [
      newFee,
    ]);
    //create proposal for time gaps change
    await DAO.propose(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_3
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await Treasury.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_3))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_3))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_3))
    );
    await executeTx.wait(1);
    const value = await Treasury.setupInitiatorFee();
    expect(value).to.be.equal(newFee);
  });

  it("should vote to change bullseye betAmount", async function () {
    const newBetAmount = parse18("1000");
    //prepare contract
    BullseyeGame = await new BullseyeGame__factory(owner).deploy();
    //function to call
    encodedFunctionCall = BullseyeGame.interface.encodeFunctionData(
      "changeBetAmount",
      [newBetAmount]
    );
    //create proposal for time gaps change
    await DAO.propose(
      [await BullseyeGame.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_4
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await BullseyeGame.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_4))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await BullseyeGame.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_4))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await BullseyeGame.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_4))
    );
    await executeTx.wait(1);
    const game = await BullseyeGame.game();
    expect(game[2]).to.be.equal(newBetAmount);
  });

  it("should vote to change bullseye winner's rate", async function () {
    const newRate = [7000, 1500, 500, 100];
    //function to call
    encodedFunctionCall = BullseyeGame.interface.encodeFunctionData(
      "setRates",
      [newRate]
    );
    //create proposal for time gaps change
    await DAO.propose(
      [await BullseyeGame.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_5
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await BullseyeGame.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_5))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await BullseyeGame.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_5))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await BullseyeGame.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_5))
    );
    await executeTx.wait(1);
    const value = await BullseyeGame.rate(0);
    expect(value).to.be.equal(newRate[0]);
  });

  it("should vote to increase vesting duration", async function () {
    const newDuration = month * 2;
    //prepare contract
    XyroVesting = await new XyroVesting__factory(owner).deploy(
      await owner.getAddress(),
      Date.now(),
      month,
      parse18("10000"),
      await XyroToken.getAddress()
    );
    //function to call
    encodedFunctionCall = XyroVesting.interface.encodeFunctionData(
      "increaseDuration",
      [newDuration]
    );
    //create proposal for time gaps change
    await DAO.propose(
      [await XyroVesting.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_7
    );
    //cast vote
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await XyroVesting.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_7))
      ),
      voteWay
    );
    await mine(4);
    await DAO.queue(
      [await XyroVesting.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_7))
    );
    await mine(2);
    const executeTx = await DAO.execute(
      [await XyroVesting.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_7))
    );
    await executeTx.wait(1);
    const value = await XyroVesting.duration();
    expect(value).to.be.equal(newDuration);
  });

  it("should not execute if less 60% voted", async function () {
    //add 2 more voters
    await GovernanceToken.mint(bob.getAddress(), parse18("1000"));
    await GovernanceToken.mint(alice.getAddress(), parse18("1000"));
    await GovernanceToken.connect(bob).delegate(await bob.getAddress());
    await GovernanceToken.connect(alice).delegate(await alice.getAddress());
    //create new proposal
    await DAO.propose(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      proposalDescription_6
    );
    //voting
    await mine(4);
    const voteWay = 1; //yes
    await DAO.castVote(
      await DAO.hashProposal(
        [await Treasury.getAddress()],
        [0],
        [encodedFunctionCall],
        ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_6))
      ),
      voteWay
    );
    //executing
    await mine(4);
    expect(
      await DAO.state(
        await DAO.hashProposal(
          [await Treasury.getAddress()],
          [0],
          [encodedFunctionCall],
          ethers.keccak256(ethers.toUtf8Bytes(proposalDescription_6))
        )
      )
    ).to.be.equal(3);
  });
});