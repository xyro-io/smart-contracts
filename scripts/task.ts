import contracts from "../contracts.json";

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
  .addParam("owner", "Token owner address")
  .setAction(async (taskArgs) => {
    const signer = await ethers.getSigner(taskArgs.owner);
    const USDC = await ethers.getContractAt(
      "MockToken",
      contracts.USDC.address
    );
    await USDC.connect(signer).approve(
      contracts.Treasury.address,
      ethers.MaxUint256
    );
  });

task("startBullseye", "Starts bullseye game")
  .addParam("time", "How long game will be opened")
  .addParam("betamount", "Bet amount")
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
      ethers.parseEther(taskArgs.betamount)
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
  .addParam("price", "Final asset price")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "BullseyeGame",
      contracts.BullseyeGame.address
    );
    await contract.finalizeGame(abiEncodeInt192(taskArgs.price));
  });

task("increaseTime", "Increases ganache block timestamp")
  .addParam("time", "Time to increase current block by")
  .setAction(async (taskArgs: any) => {
    await ethers.provider.send("evm_increaseTime", [Number(taskArgs.time)]);
  });

task("startUpDown", "Starts updown game")
  .addParam("time", "How long game will be opened")
  .addParam("betamount", "Bet amount")
  .addParam("price", "Starting asset price")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDownGame",
      contracts.UpDown.address
    );
    await contract.startGame(
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      ethers.parseEther(taskArgs.betamount),
      abiEncodeInt192(taskArgs.price)
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
  .addParam("price", "Final asset price")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDownGame",
      contracts.UpDown.address
    );
    await contract.finalizeGame(abiEncodeInt192(taskArgs.price));
  });

function abiEncodeInt192(num: string): string {
  const encoded = ethers.solidityPacked(["int192"], [num]);
  return encoded.slice(0, 3) + "0".repeat(16) + encoded.slice(3);
}
