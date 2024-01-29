// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITreasury {
    function deposit(uint256 amount, address initiator) external;

    function distribute(uint256 amount, address winner) external;

    function refund(uint256 amount, address initiator) external;
}
