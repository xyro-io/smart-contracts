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
const parse18 = ethers.parseEther;

describe("DAO test", () => {
  let owner: HardhatEthersSigner;
  let opponent: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let XyroToken: XyroToken;
  let Staking: XyroStaking;
  let Treasury: Treasury;
  let GovernanceToken: XyroGovernanceToken;
  let TimeLock: TimeLock;
  let DAO: GovernorContract;
  let encodedFunctionCall: string;
  const rate = 125;
  const proposalDescription = "decrease rakeback";
  before(async () => {
    [owner, opponent, alice] = await ethers.getSigners();
    //Setup staking contract and tokens
    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
    GovernanceToken = await new XyroGovernanceToken__factory(owner).deploy();
    Staking = await new XyroStaking__factory(owner).deploy(
      await XyroToken.getAddress(),
      rate,
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
    console.log("Executing...");
    await mine(2);
    const executeTx = await DAO.execute(
      [await Treasury.getAddress()],
      [0],
      [encodedFunctionCall],
      ethers.keccak256(ethers.toUtf8Bytes(proposalDescription))
    );
    await executeTx.wait(1);
    const value = await Treasury.fee();
    console.log(value);
  });
});
