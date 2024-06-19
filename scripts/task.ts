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

task("startBullseye", "Starts bullseye game").setAction(
  async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "Bullseye",
      contracts.Bullseye.address
    );
    await contract.startGame(
      (await ethers.provider.getBlock("latest")).timestamp + 60,
      (await ethers.provider.getBlock("latest")).timestamp + 55,
      ethers.parseEther("100"),
      "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439"
    );
  }
);

task("betBullseye", "Bullseye bet").setAction(async (taskArgs: any) => {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  await contract.play(100, { gasLimit: 300_000 });
});

task("finalizeBullseye", "Finishes bullseye game")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "Bullseye",
      contracts.Bullseye.address
    );
    const price = await getPrice();
    await contract.finalizeGame(
      "0x00062e9d9e815f24d8d23cf51c8d7fced51262153cae9e5eea6c7d503688a101000000000000000000000000000000000000000000000000000000002c2f4606000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b4390000000000000000000000000000000000000000000000000000000066717fca0000000000000000000000000000000000000000000000000000000066717fca00000000000000000000000000000000000000000000000000001ab6c3d1c09c000000000000000000000000000000000000000000000000001a5ececae0916c000000000000000000000000000000000000000000000000000000006672d14a000000000000000000000000000000000000000000000dcbb8a4ae24753c84c0000000000000000000000000000000000000000000000dcbabdf34f606d30000000000000000000000000000000000000000000000000dcbc17bb762687da0800000000000000000000000000000000000000000000000000000000000000002117f20a52bffab127fdb5c04c67de7bb6c637b0b55d000ac5b6fb7fa7d002f472ec97e8203c5facd13a38cef1b4b269823ca9356320c92bc0e5e56932a41b77000000000000000000000000000000000000000000000000000000000000000022a176f33ad8515bce55d3963a0c342a96cf50032939b6b3c082cb499a3148b354c4d9f142dc5ab00adc000a1c541d01df6f563d5abd9b73593eae8080f364c70"
    );
  });

task("increaseTime", "Increases ganache block timestamp")
  .addParam("time", "Time to increase current block by")
  .setAction(async (taskArgs: any) => {
    await ethers.provider.send("evm_increaseTime", [Number(taskArgs.time)]);
  });

task("startUpDown", "Starts updown game").setAction(async (taskArgs: any) => {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDown.address
  );
  // const price = await getPrice();
  await contract.startGame(
    (await ethers.provider.getBlock("latest")).timestamp + 300,
    (await ethers.provider.getBlock("latest")).timestamp + 180,
    // "0x00062e9d9e815f24d8d23cf51c8d7fced51262153cae9e5eea6c7d503688a101000000000000000000000000000000000000000000000000000000002c2cc205000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002800001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b4390000000000000000000000000000000000000000000000000000000066716fdb0000000000000000000000000000000000000000000000000000000066716fdb00000000000000000000000000000000000000000000000000001ab71bb4af90000000000000000000000000000000000000000000000000001a56f63111d670000000000000000000000000000000000000000000000000000000006672c15b000000000000000000000000000000000000000000000dce82f13ff787bb9400000000000000000000000000000000000000000000000dce7d34a6b72f691980000000000000000000000000000000000000000000000dce88add937e00e0e800000000000000000000000000000000000000000000000000000000000000002cd568325fb12382a56a95dccf7f30026200372987abec0ac9f8e08dd9d49b2fb8e2b501a28d97dd4fe259d115592b3a22411296252b8de923726298f11f9bada00000000000000000000000000000000000000000000000000000000000000024579a79675b608f0a74a483c04a2e4a387880358d033a8b984bcfa06406be1c609fb62eeee9986d1316d87b3e085e0447d377369066b057139dfac765cf66a79",
    "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439"
  );
});

task("betUpDown", "UpDown bet")
  .addParam("up", "Will go up?")
  .addParam("deposit", "Amount to bet")
  .addParam("better", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt(
      "UpDown",
      contracts.UpDown.address
    );
    await contract
      .connect(signer)
      .play(taskArgs.up === "true", ethers.parseEther(taskArgs.deposit));
  });

task("finalizeUpDown", "Finishes UpDown game").setAction(
  async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "UpDown",
      contracts.UpDown.address
    );
    const price = await getPrice();
    await contract.finalizeGame(
      "0x00062e9d9e815f24d8d23cf51c8d7fced51262153cae9e5eea6c7d503688a101000000000000000000000000000000000000000000000000000000002c2cc205000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002800001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000012000037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b4390000000000000000000000000000000000000000000000000000000066716fdb0000000000000000000000000000000000000000000000000000000066716fdb00000000000000000000000000000000000000000000000000001ab71bb4af90000000000000000000000000000000000000000000000000001a56f63111d670000000000000000000000000000000000000000000000000000000006672c15b000000000000000000000000000000000000000000000dce82f13ff787bb9400000000000000000000000000000000000000000000000dce7d34a6b72f691980000000000000000000000000000000000000000000000dce88add937e00e0e800000000000000000000000000000000000000000000000000000000000000002cd568325fb12382a56a95dccf7f30026200372987abec0ac9f8e08dd9d49b2fb8e2b501a28d97dd4fe259d115592b3a22411296252b8de923726298f11f9bada00000000000000000000000000000000000000000000000000000000000000024579a79675b608f0a74a483c04a2e4a387880358d033a8b984bcfa06406be1c609fb62eeee9986d1316d87b3e085e0447d377369066b057139dfac765cf66a79"
    );
  }
);

task("startExactPrice", "Starts one vs one exact price game")
  .addParam("opponent", "Opponent address")
  .addParam("time", "How long game will be opened")
  .addParam("price", "Guess price")
  .addParam("betamount", "Bet amount")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneExactPrice",
      contracts.ExactPriceOneVsOne.address
    );
    await contract.createGame(
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
      "OneVsOneExactPrice",
      contracts.ExactPriceOneVsOne.address
    );
    await contract.connect(signer).acceptGame(taskArgs.id, taskArgs.price);
  });

task("finalizeExact", "Finalize exact price game")
  .addParam("id", "Bet id")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneExactPrice",
      contracts.ExactPriceOneVsOne.address
    );
    const price = await getPrice();
    await contract.finalizeGame(
      taskArgs.id,
      abiEncodeInt192(price, taskArgs.feedid)
    );
  });

task("startUpDown1vs1", "Starts one vs one up down game")
  .addParam("opponent", "Opponent address")
  .addParam("time", "How long game will be opened")
  .addParam("up", "Will go up?")
  .addParam("betamount", "Bet amount")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneUpDown",
      contracts.UpDownOneVsOne.address
    );
    const price = await getPrice();
    await contract.createGame(
      taskArgs.opponent,
      (
        await ethers.provider.getBlock("latest")
      ).timestamp,
      (await ethers.provider.getBlock("latest")).timestamp +
        Number(taskArgs.time),
      taskArgs.up === "true",
      ethers.parseEther(taskArgs.betamount),
      abiEncodeInt192(price, taskArgs.feedid),
      taskArgs.feedid,
      { gasLimit: 300_000 }
    );
  });

task("acceptUpDown", "Accept up down one vs one bet")
  .addParam("id", "Bet id")
  .addParam("better", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.better);
    const contract = await ethers.getContractAt(
      "OneVsOneUpDown",
      contracts.UpDownOneVsOne.address
    );
    await contract.connect(signer).acceptGame(taskArgs.id);
  });

task("finalizeUpDown1vs1", "Finalize up down one vs one game")
  .addParam("id", "Bet id")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneUpDown",
      contracts.UpDownOneVsOne.address
    );
    const price = await getPrice();
    await contract.finalizeGame(
      taskArgs.id,
      abiEncodeInt192(price, taskArgs.feedid)
    );
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
      "SetupsFactory",
      contracts.SetupsFactory.address
    );

    const price = await getPrice();

    await contract.createSetups(
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
    const id = await contract.gameId();
    const gameAddress = await contract.games(id);
    console.log("Bet id: ", id);
    console.log("Setup address: ", gameAddress);

    await treasury.grantRole(role, gameAddress);
  });

task("getSetupAddress", "Returns setup address by id")
  .addParam("id", "Game id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "SetupsFactory",
      contracts.SetupsFactory.address
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
    const contract = await ethers.getContractAt("Setups", taskArgs.address);
    await contract
      .connect(signer)
      .bet(taskArgs.sl === "true", ethers.parseEther(taskArgs.betamount));
  });

task("finalizeSetup", "Finalize up down one vs one game")
  .addParam("address", "Setup address")
  .addParam("price", "Final price")
  .addParam("feedid", "Price feed id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt("Setups", taskArgs.address);
    const price = await getPrice();
    await contract.finalizeGame(abiEncodeInt192(price, taskArgs.feedid));
  });

function abiEncodeInt192(price: string, feedId: string): string {
  const encoded = ethers.solidityPacked(["int192", "bytes32"], [price, feedId]);
  return encoded.slice(0, 3) + "0".repeat(16) + encoded.slice(3);
}

task("upDownBets", "make 5 updown bets").setAction(async () => {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDown.address
  );
  for (let i = 1; i < 6; i++) {
    let signer = ethers.HDNodeWallet.fromPhrase(
      "response sort awake wear uncle symbol length advice uniform cigar pride profit",
      undefined,
      `m/44'/0'/${i}'/0/0`
    );
    signer = signer.connect(ethers.provider);
    const isLong = Math.floor(Math.random() * 2) == 1 ? true : false;
    const deposit =
      Math.floor(Math.floor(Math.random() * (100 - 10 + 1) + 10) / 5) * 5;
    let tx = await contract
      .connect(signer)
      .play(isLong, ethers.parseEther(deposit.toString()));
    await tx.wait();
    console.log(`tx ${i} = ${tx.hash}`);
  }
});

task("setupsBets", "make 5 setups bets")
  .addParam("id", "Game id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt("Setups", taskArgs.id);
    for (let i = 1; i < 6; i++) {
      let signer = ethers.HDNodeWallet.fromPhrase(
        "response sort awake wear uncle symbol length advice uniform cigar pride profit",
        undefined,
        `m/44'/0'/${i}'/0/0`
      );
      signer = signer.connect(ethers.provider);
      const isLong = Math.floor(Math.random() * 2) == 1 ? true : false;
      const deposit =
        Math.floor(Math.floor(Math.random() * (100 - 10 + 1) + 10) / 5) * 5;
      let tx = await contract
        .connect(signer)
        .play(isLong, ethers.parseEther(deposit.toString()));
      await tx.wait();
      console.log(`tx ${i} = ${tx.hash}`);
    }
  });

task("bullseyeBets", "make 5 bullseye bets").setAction(async () => {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  const price = await getPrice();
  let minPrice = Math.floor(price - price / 1000);
  let maxPrice = Math.floor(price + price / 1000);
  for (let i = 1; i < 6; i++) {
    let signer = ethers.HDNodeWallet.fromPhrase(
      "response sort awake wear uncle symbol length advice uniform cigar pride profit",
      undefined,
      `m/44'/0'/${i}'/0/0`
    );
    signer = signer.connect(ethers.provider);
    const prediction =
      Math.floor(Math.random() * (maxPrice - minPrice)) + minPrice;
    let tx = await contract
      .connect(signer)
      .play(ethers.parseEther(prediction.toString()));
    await tx.wait();
    console.log(`tx ${i} = ${tx.hash}`);
  }
});

task("batchApprove", "make 5 approves").setAction(async () => {
  const contract = await ethers.getContractAt(
    "MockToken",
    contracts.USDC.address
  );

  for (let i = 1; i < 6; i++) {
    let signer = ethers.HDNodeWallet.fromPhrase(
      "response sort awake wear uncle symbol length advice uniform cigar pride profit",
      undefined,
      `m/44'/0'/${i}'/0/0`
    );
    signer = signer.connect(ethers.provider);
    let tx = await contract
      .connect(signer)
      .approve(contracts.Treasury.address, ethers.MaxUint256);
    await tx.wait();
    console.log(`tx ${i} = ${tx.hash}`);
  }
});

task("batchMint", "make 5 approves").setAction(async () => {
  const contract = await ethers.getContractAt(
    "MockToken",
    contracts.USDC.address
  );

  for (let i = 1; i < 6; i++) {
    let signer = ethers.HDNodeWallet.fromPhrase(
      "response sort awake wear uncle symbol length advice uniform cigar pride profit",
      undefined,
      `m/44'/0'/${i}'/0/0`
    );
    signer = signer.connect(ethers.provider);
    console.log("My adr = ", signer.address);
    let tx = await contract
      .connect(signer)
      .mint(signer.address, ethers.parseEther("100000000"));
    await tx.wait();
    console.log(`tx ${i} = ${tx.hash}`);
  }
});
