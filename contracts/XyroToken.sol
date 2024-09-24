// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract XyroToken is ERC20Permit {
    constructor(
        uint256 initialSupply
    ) ERC20("Xyro", "XYR") ERC20Permit("Xyro") {
        _mint(msg.sender, initialSupply);
    }
}
