// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract XyroToken is ERC20Permit {
    mapping(address account => uint256) private _balances;
    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    constructor(
        uint256 initialSupply
    ) ERC20("Xyro", "XYR") ERC20Permit("Xyro") {
        _mint(msg.sender, initialSupply);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        super._update(from, to, value);
    }
}
