import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { XyroToken } from "../typechain-types/contracts/XyroToken";
import { MockToken } from "../typechain-types/contracts/mock/MockERC20.sol/MockToken";

interface VRS {
  r: string;
  s: string;
  v: number;
}

export async function wrapFnc(params: any, fnc: any) {
  let deployer: HardhatEthersSigner;

  [deployer] = await ethers.getSigners();

  for (let i = 0; i <= 1; i++) {
    let actualNonce: number = -1;

    try {
      let indexNonce = params.findIndex(
        (x: any) => x.nonce !== undefined || x.gasLimit !== undefined
      );
      actualNonce =
        actualNonce === -1
          ? await ethers.provider.getTransactionCount(
              deployer.address,
              "pending"
            )
          : actualNonce;

      if (indexNonce !== -1) {
        params[indexNonce].nonce = actualNonce;
      } else {
        params.push({ nonce: actualNonce });
      }

      indexNonce = params.findIndex((x: any) => x.nonce !== undefined);
      let gp = (await ethers.provider.getFeeData()).gasPrice;
      if (params.gasPrice === undefined) {
        if (indexNonce !== -1) {
          params[indexNonce].gasPrice = gp;
        } else {
          params.push({ gasPrice: gp });
        }
      }
      let res: any = null;
      if (fnc?.deploy) {
        if (params.length > 1) {
          res = await fnc.deploy(...params);
        } else {
          res = await fnc.deploy(...params);
        }
      } else {
        let isFulfilled = false;
        let isRejected = false;

        for (let f = 0; ; f++) {
          console.log(...params);
          res = await fnc(...params);
          let network = await ethers.provider.getNetwork();
          await new Promise((resolve, reject) => {
            console.log(`\nTrying to send tx... ${f + 1}`);
            console.log(
              `function name: ${res.data.substring(0, 10)}, on network: ${
                network.name
              } \n tx hash: ${res.hash} `
            );
            console.log(
              `\nTransaction cost (native): ${ethers.formatUnits(
                (res.gasPrice * res.gasLimit).toString()
              )}`
            );
            console.log(`Transaction gas limit: ${res.gasLimit.toString()}`);
            console.log(
              `Transaction gas price: ${ethers.formatUnits(
                res.gasPrice?.toString() || "0",
                "gwei"
              )} Gwei`
            );

            const timer = setTimeout(
              () => reject("Reject in timeout reason"),
              180_000
            ); // wait tx, max 3 min
            res.wait().then(
              (...args: any[]) => {
                clearTimeout(timer);
                isFulfilled = true;
                resolve([...args]);
              },
              (...args: any[]) => {
                clearTimeout(timer);
                isRejected = true;
                reject(...args);
              }
            );
          });

          if (isFulfilled) break;
          gp = (await ethers.provider.getFeeData()).gasPrice;
          params[indexNonce].gasPrice = gp;
        }

        return res;
      }

      await res.waitForDeployment();
      if (fnc?.deploy) {
        let network = await ethers.provider.getNetwork();
        console.log(`Contract ${res.target} deployed on ${network.name}`);
      }
      return res;
    } catch (e) {
      console.log("WARNING: Once again due ", (e as Error).message);
      timeout(30_000);
      actualNonce =
        (await ethers.provider.getTransactionCount(
          deployer.address,
          "pending"
        )) -
          (await ethers.provider.getTransactionCount(deployer.address)) >
        0
          ? await ethers.provider.getTransactionCount(deployer.address)
          : await ethers.provider.getTransactionCount(
              deployer.address,
              "pending"
            );
    }
  }

  throw new Error("Interrupted: Something went wrong!");
}

export function splitSignatureToVRS(signature: string): VRS {
  const r = "0x" + signature.substring(2).substring(0, 64);
  const s = "0x" + signature.substring(2).substring(64, 128);
  const v = parseInt(signature.substring(2).substring(128, 130), 16);

  return { r, s, v };
}

export async function getPermitSignature(
  wallet: HardhatEthersSigner,
  token: XyroToken | MockToken,
  spender: string,
  value = ethers.MaxUint256,
  deadline = ethers.MaxUint256,
  permitConfig?: {
    nonce?: number;
    name?: string;
    chainId?: number;
    version?: string;
  }
): Promise<VRS> {
  const [nonce, name, version, chainId] = await Promise.all([
    permitConfig?.nonce ?? token.nonces(wallet.address),
    permitConfig?.name ?? token.name(),
    permitConfig?.version ?? "1",
    permitConfig?.chainId ?? "1337",
  ]);

  return splitSignatureToVRS(
    await wallet.signTypedData(
      {
        name,
        version,
        chainId,
        verifyingContract: await token.getAddress(),
      },
      {
        Permit: [
          {
            name: "owner",
            type: "address",
          },
          {
            name: "spender",
            type: "address",
          },
          {
            name: "value",
            type: "uint256",
          },
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
          },
        ],
      },
      {
        owner: wallet.address,
        spender,
        value,
        nonce,
        deadline,
      }
    )
  );
}

export function abiEncodeInt192(num: string): string {
  const encoded = ethers.solidityPacked(["int192"], [num]);
  return encoded.slice(0, 3) + "0".repeat(16) + encoded.slice(3);
}

export function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
