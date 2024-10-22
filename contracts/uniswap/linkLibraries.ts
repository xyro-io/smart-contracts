/*
This is needed because there's currently no way in ethers.js to link a
library when you're working with the contract ABI/bytecode.

See https://github.com/ethers-io/ethers.js/issues/195
*/

import utils from "ethers";

export function linkLibraries(
  bytecode: string,
  libraries: {
    [name: string]: string;
  } = {}
): string {
  let linkedBytecode = bytecode;
  for (const [name, address] of Object.entries(libraries)) {
    const placeholder = `__\$${utils
      .solidityPacked(["string"], [name])
      .slice(2, 36)}\$__`;
    const formattedAddress = utils
      .getAddress(address)
      .toLowerCase()
      .replace("0x", "");
    if (linkedBytecode.indexOf(placeholder) === -1) {
      throw new Error(`Unable to find placeholder for library ${name}`);
    }
    while (linkedBytecode.indexOf(placeholder) !== -1) {
      linkedBytecode = linkedBytecode.replace(placeholder, formattedAddress);
    }
  }
  return linkedBytecode;
}
