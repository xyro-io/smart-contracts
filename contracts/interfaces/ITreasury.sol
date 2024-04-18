// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITreasury {
    function increaseFee(uint256 amount) external;

    function deposit(uint256 amount, address initiator) external;

    function depositWithPermit(
        uint256 amount,
        address initiator,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function distribute(
        uint256 amount,
        address winner,
        uint256 initialBet,
        uint256 gameFee
    ) external;

    function refund(uint256 amount, address initiator) external;

    function distributeWithoutFee(
        uint256 rate,
        address winner,
        uint256 initialBet
    ) external;

    function calculateSetupRate(
        uint256 lostTeamBets,
        uint256 wonTeamBets,
        address initiator
    ) external returns (uint256 rate);
}
