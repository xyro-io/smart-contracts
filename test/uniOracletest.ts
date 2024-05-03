import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { UniswapOracle } from "../typechain-types/contracts/UniswapOracle.sol";
import { UniswapOracle__factory } from "../typechain-types/factories/contracts/UniswapOracle.sol/UniswapOracle__factory";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { XyroToken__factory } from "../typechain-types/factories/contracts/XyroToken__factory";
import { getPermitSignature } from "../scripts/helper";
const parse18 = ethers.parseEther;

describe("Permit", () => {
  let alice: HardhatEthersSigner;
  let owner: HardhatEthersSigner;
  let XyroToken: XyroToken;
  before(async () => {
    [owner, alice] = await ethers.getSigners();
    XyroToken = await new XyroToken__factory(owner).deploy(
      parse18((1e9).toString())
    );
  });

  it("Should transfer with permit", async function () {
    const spender = alice.address;
    const amount = parse18("10");
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const result = await getPermitSignature(
      owner,
      XyroToken,
      spender,
      amount,
      BigInt(deadline)
    );
    await XyroToken.permit(
      owner.address,
      spender,
      amount,
      deadline,
      result.v,
      result.r,
      result.s
    );
    const oldBalance = await XyroToken.balanceOf(alice.address);
    await XyroToken.connect(alice).transferFrom(
      owner.address,
      alice.address,
      amount
    );
    const newBalance = await XyroToken.balanceOf(alice.address);
    expect(newBalance).to.be.above(oldBalance);
  });
});
