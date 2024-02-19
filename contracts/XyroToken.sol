// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";

contract XyroToken is ERC20Burnable, ERC20Capped {
    mapping(address account => uint256) private _balances;
    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    constructor(uint256 initialSupply) ERC20("Xyro", "XYR") ERC20Capped(1000000001 * 10**18) {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal virtual override(ERC20Capped,ERC20) {
        super._update(from, to, value);
    }
}