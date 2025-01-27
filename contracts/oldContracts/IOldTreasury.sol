// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOldTreasury {
    struct PermitData {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function DISTRIBUTOR_ROLE() external view returns (bytes32);

    function grantRole(bytes32 role, address account) external;

    function increaseFee(uint256 amount) external;

    function depositAndLock(uint256 amount, address from) external;

    function depositAndLockWithPermit(
        uint256 amount,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function lock(uint256 amount, address from) external;

    function upkeep() external view returns (address);

    function distribute(uint256 amount, address to, uint256 gameFee) external;

    function distributeBullseye(
        uint256 amount,
        address to,
        uint256 gameFee
    ) external;

    function approvedToken() external returns (address);

    function refund(uint256 amount, address to) external;

    function refundWithFees(
        uint256 amount,
        address to,
        uint256 refundFee
    ) external;

    function distributeWithoutFee(
        uint256 rate,
        address to,
        uint256 usedFee,
        uint256 initialDeposit
    ) external;

    function calculateSetupRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 setupFee,
        address initiator
    ) external returns (uint256, uint256);

    function calculateUpDownRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 updownFee
    ) external returns (uint256 rate);
}
