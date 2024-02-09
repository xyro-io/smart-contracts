// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITreasury {
    function deposit(uint256 amount, address initiator) external;

    function distribute(uint256 amount, address winner) external;

    function refund(uint256 amount, address initiator) external;

    function distributeWithoutFee(uint256 rate, address winner, uint256 initialBet) external;

    function calculateSetupRate(uint256 lostTeamBets, uint256 wonTeamBets, address initiator) external returns (uint256 rate);
}
