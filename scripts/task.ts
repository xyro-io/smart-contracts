import contracts from "../contracts.json";
import { getPrice } from "./fetchPrice";

task("balance", "Prints an account's balance")
  .addParam("account", "The account's address")
  .setAction(async (taskArgs) => {
    const contract = await ethers.getContractAt(
      "MockToken",
      contracts.USDC.address
    );
    const balance = await contract.balanceOf(taskArgs.account);
    console.log(ethers.formatEther(balance));
  });

task("approveTreasury", "Increases allowance")
  .addParam("account", "Token owner address")
  .setAction(async (taskArgs) => {
    const signer = await ethers.getSigner(taskArgs.account);
    const USDC = await ethers.getContractAt(
      "MockToken",
      contracts.USDC.address
    );
    await USDC.connect(signer).approve(
      contracts.Treasury.address,
      ethers.MaxUint256
    );
  });

task("mint", "Mints tokens on target address")
  .addParam("address", "Address that gets tokens")
  .addParam("amount", "Amount to mint")
  .setAction(async (taskArgs) => {
    const USDC = await ethers.getContractAt(
      "MockToken",
      contracts.USDC.address
    );
    await USDC.mint(taskArgs.address, ethers.parseEther(taskArgs.amount));
  });

task("startBullseye", "Starts bullseye game")
  .addParam("time", "How long game will be opened")
  .addParam("betamount", "Bet amount")
  .addParam("feedid", "Pair feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "BullseyeGame",
      contracts.BullseyeGame.address
    );
    await contract.startGame(
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      ethers.parseEther(taskArgs.betamount),
      taskArgs.feedid
    );
  });

task("betBullseye", "Bullseye bet")
  .addParam("better", "Who is betting")
  .addParam("price", "Presumable asset price")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt(
      "BullseyeGame",
      contracts.BullseyeGame.address
    );
    await contract.connect(signer).bet(taskArgs.price);
  });

task("finalizeBullseye", "Finishes bullseye game")
.addParam("feedid", "Price feed id")
.setAction(
  async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "BullseyeGame",
      contracts.BullseyeGame.address
    );
    const price = await getPrice();
    await contract.finalizeGame(abiEncodeInt192(price, taskArgs.feedid));
  }
);

task("increaseTime", "Increases ganache block timestamp")
  .addParam("time", "Time to increase current block by")
  .setAction(async (taskArgs: any) => {
    await ethers.provider.send("evm_increaseTime", [Number(taskArgs.time)]);
  });

task("startUpDown", "Starts updown game")
  .addParam("time", "How long game will be opened")
  .addParam("betamount", "Bet amount")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDownGame",
      contracts.UpDown.address
    );
    // const price = await getPrice();
    await contract.startGame(
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      ethers.parseEther(taskArgs.betamount),
      "0x00062e9d9e815f24d8d23cf51c8d7fced51262153cae9e5eea6c7d503688a101000000000000000000000000000000000000000000000000000000002366910a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002800101000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b43900000000000000000000000000000000000000000000000000000000663a0a6200000000000000000000000000000000000000000000000000000000663a0a6200000000000000000000000000000000000000000000000000001d5852c0628800000000000000000000000000000000000000000000000000188dfe5e4f37e400000000000000000000000000000000000000000000000000000000663b5be2000000000000000000000000000000000000000000000d937f6339d313321380000000000000000000000000000000000000000000000d937dc1b888969dc800000000000000000000000000000000000000000000000d938104bb1d8fa7da800000000000000000000000000000000000000000000000000000000000000002e056159d54d44764546e937e161f42a63a3f03a0ee135f787398a2693e2b0680b48840ffb9a18e167115acd4412416b5c89fe3664476598e84d3416a9f02f4f100000000000000000000000000000000000000000000000000000000000000027de3072ac120bebd8a82eee5fda10d512d720a65bba4f6716958eacefb24136b607686e9c98b8be8a7e0f0c2f552bed3a6f83c4d313095f76a65278161a53430",
      "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439",
      {gasLimit:300_000}
    );
  });

task("betUpDown", "UpDown bet")
  .addParam("up", "Will go up?")
  .addParam("better", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt(
      "UpDownGame",
      contracts.UpDown.address
    );
    await contract.connect(signer).bet(taskArgs.up === "true");
  });

task("finalizeUpDown", "Finishes UpDown game")
.addParam("feedid", "Price feed id")
.setAction(
  async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDownGame",
      contracts.UpDown.address
    );
    const price = await getPrice();
    await contract.finalizeGame(abiEncodeInt192(price, taskArgs.feedid));
  }
);

task("startExactPrice", "Starts one vs one exact price game")
  .addParam("opponent", "Opponent address")
  .addParam("time", "How long game will be opened")
  .addParam("price", "Guess price")
  .addParam("betamount", "Bet amount")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "ExactPriceStandalone",
      contracts.ExactPriceOneVsOne.address
    );
    await contract.createBet(
      taskArgs.opponent,
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      taskArgs.price,
      ethers.parseEther(taskArgs.betamount)
    );
  });

task("betExact", "Accept exact price bet")
  .addParam("id", "Bet id")
  .addParam("price", "Guess price")
  .addParam("better", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt(
      "ExactPriceStandalone",
      contracts.ExactPriceOneVsOne.address
    );
    await contract.connect(signer).acceptBet(taskArgs.id, taskArgs.price);
  });

task("finalizeExact", "Finalize exact price game")
  .addParam("id", "Bet id")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "ExactPriceStandalone",
      contracts.ExactPriceOneVsOne.address
    );
    const price = await getPrice();
    await contract.finalizeGame(taskArgs.id, abiEncodeInt192(price, taskArgs.feedid));
  });

task("startUpDown1vs1", "Starts one vs one up down game")
  .addParam("opponent", "Opponent address")
  .addParam("time", "How long game will be opened")
  .addParam("up", "Will go up?")
  .addParam("betamount", "Bet amount")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDownStandalone",
      contracts.UpDownOneVsOne.address
    );
    const price = await getPrice();
    await contract.createBet(
      taskArgs.opponent,
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      taskArgs.up === "true",
      ethers.parseEther(taskArgs.betamount),
      abiEncodeInt192(price, taskArgs.feedid)
    );
  });

task("acceptUpDown", "Accept up down one vs one bet")
  .addParam("id", "Bet id")
  .addParam("better", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt(
      "UpDownStandalone",
      contracts.UpDownOneVsOne.address
    );
    await contract.connect(signer).acceptBet(taskArgs.id);
  });

task("finalizeUpDown1vs1", "Finalize up down one vs one game")
  .addParam("id", "Bet id")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDownStandalone",
      contracts.UpDownOneVsOne.address
    );
    const price = await getPrice();
    await contract.finalizeGame(taskArgs.id, abiEncodeInt192(price, taskArgs.feedid));
  });

task("createSetup", "Create setup game")
  .addParam("time", "How long game will be opened")
  .addParam("sl", "Is SL game?")
  .addParam("slprice", "SL price")
  .addParam("tpprice", "TP price")
  .addParam("betamount", "Bet amount")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "GameFactory",
      contracts.GameFactory.address
    );

    const price = await getPrice();

    await contract.createSetupGame(
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      ethers.parseEther(taskArgs.tpprice),
      ethers.parseEther(taskArgs.slprice),
      ethers.parseEther(taskArgs.betamount),
      taskArgs.sl === "true",
      abiEncodeInt192(price, taskArgs.feedid)
    );

    const treasury = await ethers.getContractAt(
      "Treasury",
      contracts.Treasury.address
    );

    const role = await treasury.DISTRIBUTOR_ROLE();
    const id = await contract.betId();
    const gameAddress = await contract.games(id);
    console.log("Bet id: ", id);
    console.log("Setup address: ", gameAddress);

    await treasury.grantRole(role, gameAddress);
  });

task("getSetupAddress", "Returns setup address by id")
  .addParam("id", "Game id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "GameFactory",
      contracts.GameFactory.address
    );
    const setupAddress = await contract.games(taskArgs.id);
    console.log("Setup address: ", setupAddress);
  });

task("betSetup", "Setup bet")
  .addParam("address", "Setup address")
  .addParam("sl", "Is SL?")
  .addParam("better", "Who is betting")
  .addParam("betamount", "Bet amount")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt("SetupGame", taskArgs.address);
    await contract
      .connect(signer)
      .bet(taskArgs.sl === "true", ethers.parseEther(taskArgs.betamount));
  });

task("finalizeSetup", "Finalize up down one vs one game")
  .addParam("address", "Setup address")
  .addParam("price", "Final price")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt("SetupGame", taskArgs.address);
    const price = await getPrice();
    await contract.finalizeGame(abiEncodeInt192(price, taskArgs.feedid));
  });

function abiEncodeInt192(price: string, feedId: string): string {
  const encoded = ethers.solidityPacked(["int192", "bytes32"], [price, feedId]);
  return encoded.slice(0, 3) + "0".repeat(16) + encoded.slice(3);
}
