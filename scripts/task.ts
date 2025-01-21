import contracts from "../contracts.json";
import { getPayload, getPrice } from "./fetchPrice";

task("balance", "Prints an account's balance")
  .addParam("address", "The account's address")
  .setAction(async (taskArgs) => {
    const contract = await ethers.getContractAt(
      "MockToken",
      contracts.USDC.address
    );
    const balance = await contract.balanceOf(taskArgs.account);
    console.log(ethers.formatEther(balance));
  });

task("approveTreasury", "Increases allowance")
  .addParam("address", "Token owner address")
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

task("betBullseye", "Bullseye bet").setAction(async () => {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  const price = await getPrice();
  await contract.play(price);
});

task("finalizeBullseye", "Finishes bullseye game").setAction(async () => {
  const contract = await ethers.getContractAt(
    "Bullseye",
    contracts.Bullseye.address
  );
  const payload = await getPayload();
  await contract.finalizeGame(payload);
});

task("startUpDown", "Starts updown game").setAction(async (taskArgs: any) => {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDown.address
  );
  await contract.startGame(
    (await ethers.provider.getBlock("latest")).timestamp + 60,
    (await ethers.provider.getBlock("latest")).timestamp + 55,
    "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439"
  );
});

task("transferOwnership", "Setup bet").setAction(async (taskArgs: any) => {
  const TokenOwner = await ethers.getContractAt("TokenOwner", "");
  const Token = await ethers.getContractAt("XyroTokenERC677", "");
  await Token.transferOwnership(await TokenOwner.getAddress());
  await TokenOwner.acceptOwnership();
});

task("betUpDown", "UpDown bet")
  .addParam("address", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.address);
    const contract = await ethers.getContractAt(
      "UpDown",
      contracts.UpDown.address
    );
    await contract.connect(signer).play(true, ethers.parseEther("100"));
  });

task("finalizeUpDown", "Finishes UpDown game").setAction(async () => {
  const contract = await ethers.getContractAt(
    "UpDown",
    contracts.UpDown.address
  );
  const payload = await getPayload();
  await contract.finalizeGame(payload);
});

task("startExactPrice", "Starts one vs one exact price game").setAction(
  async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneExactPrice",
      contracts.ExactPriceOneVsOne.address
    );
    await contract.createGame(
      "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439",
      "", //opponent
      (await ethers.provider.getBlock("latest")).timestamp + 300,
      ethers.parseEther("100"),
      ethers.parseEther("100")
    );
  }
);

task("betExact", "Accept exact price bet")
  .addParam("id", "Bet id")
  .addParam("address", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.address);
    const contract = await ethers.getContractAt(
      "OneVsOneExactPrice",
      contracts.ExactPriceOneVsOne.address
    );
    await contract
      .connect(signer)
      .acceptGame(taskArgs.id, ethers.parseEther("100"));
  });

task("finalizeExact", "Finalize exact price game")
  .addParam("id", "Bet id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneExactPrice",
      contracts.ExactPriceOneVsOne.address
    );
    const payload = await getPayload();
    await contract.finalizeGame(taskArgs.id, payload);
  });

task("startUpDown1vs1", "Starts one vs one up down game").setAction(
  async () => {
    const contract = await ethers.getContractAt(
      "OneVsOneUpDown",
      contracts.UpDownOneVsOne.address
    );
    const payload = await getPayload();
    await contract.createGame(
      "", //opponent
      (await ethers.provider.getBlock("latest")).timestamp + 300,
      true,
      ethers.parseEther("100"),
      payload,
      "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439"
    );
  }
);

task("acceptUpDown", "Accept up down one vs one bet")
  .addParam("id", "Bet id")
  .addParam("address", "Who is betting")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.address);
    const contract = await ethers.getContractAt(
      "OneVsOneUpDown",
      contracts.UpDownOneVsOne.address
    );
    await contract.connect(signer).acceptGame(taskArgs.id);
  });

task("finalizeUpDown1vs1", "Finalize up down one vs one game")
  .addParam("id", "Bet id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "OneVsOneUpDown",
      contracts.UpDownOneVsOne.address
    );
    const payload = await getPayload();
    await contract.finalizeGame(taskArgs.id, payload);
  });

task("createSetup", "Create setup game").setAction(async (taskArgs: any) => {
  const contract = await ethers.getContractAt("Setup", contracts.Setup.address);
  const payload = await getPayload();
  let tx = await contract.createSetup(
    true,
    (await ethers.provider.getBlock("latest")).timestamp + 1850,
    ethers.parseEther("65960"),
    ethers.parseEther("65920"),
    payload,
    "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439"
  );
  console.log(tx);
});

task("betSetup", "Setup bet")
  .addParam("id", "Game id")
  .addParam("address", "Who is betting")
  .addParam("betamount", "Bet amount")
  .setAction(async (taskArgs: any) => {
    const signer = await ethers.getSigner(taskArgs.address);
    const contract = await ethers.getContractAt(
      "Setup",
      contracts.Setup.address
    );
    await contract
      .connect(signer)
      .bet(true, ethers.parseEther(taskArgs.betamount), taskArgs.id);
  });

task("finalizeSetup", "Finalize up down one vs one game")
  .addParam("id", "game id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "Setup",
      contracts.Setup.address
    );
    const payload = await getPayload();
    await contract.finalizeGame(payload, taskArgs.id);
  });

task("closeSetup", "Finalize up down one vs one game")
  .addParam("id", "Setup id")
  .setAction(async (taskArgs: any) => {
    const contract = await ethers.getContractAt(
      "Setup",
      contracts.Setup.address
    );
    await contract.closeGame(taskArgs.id);
  });

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
    const contract = await ethers.getContractAt(
      "Setup",
      contracts.Setup.address
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
        .play(isLong, ethers.parseEther(deposit.toString()), taskArgs.id);
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
