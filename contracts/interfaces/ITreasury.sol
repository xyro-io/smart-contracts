// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITreasury {

    struct PermitData {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function DISTRIBUTOR_ROLE() external view returns (bytes32);

    function grantRole(bytes32 role, address account) external;

    function increaseFee(uint256 amount) external;

    function deposit(uint256 amount, address from) external;

    function depositWithPermit(
        uint256 amount,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function upkeep() external view returns (address);

    function distribute(
        uint256 amount,
        address to,
        uint256 initialDeposit,
        uint256 gameFee
    ) external;

    function refund(uint256 amount, address to) external;

    function distributeWithoutFee(
        uint256 rate,
        address to,
        uint256 initialDeposit
    ) external;

    function calculateSetupRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        address initiator
    ) external returns (uint256, uint256);

    function calculateUpDownRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 updownFee
    ) external returns (uint256 rate);
}
