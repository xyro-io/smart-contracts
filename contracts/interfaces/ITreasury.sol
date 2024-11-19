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

    function depositAndLock(
        uint256 amount,
        address from,
        address token,
        bytes32 gameId,
        bool isRakeback
    ) external;

    function depositAndLockWithPermit(
        uint256 amount,
        address token,
        address from,
        bytes32 gameId,
        bool isRakeback,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function lock(
        uint256 amount,
        address from,
        address token,
        bytes32 gameId,
        bool isRakeback
    ) external;

    function upkeep() external view returns (address);

    function distribute(
        uint256 amount,
        address to,
        address token,
        uint256 initialDeposit,
        uint256 gameFee,
        bytes32 gameId
    ) external;

    function distributeBullseye(
        uint256 amount,
        uint256 initialDeposit,
        address to,
        address token,
        uint256 gameFee,
        bytes32 gameId
    ) external;

    function approvedTokens(address token) external returns (bool);

    function refund(
        uint256 amount,
        address to,
        address token,
        bytes32 gameId
    ) external;

    function refundWithFees(
        uint256 amount,
        address to,
        address token,
        uint256 refundFee,
        bytes32 gameId
    ) external;

    function distributeWithoutFee(
        uint256 rate,
        address to,
        address token,
        uint256 usedFee,
        uint256 initialDeposit,
        bytes32 gameId
    ) external;

    function calculateSetupRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        address token,
        uint256 setupFee,
        address initiator,
        bytes32 gameId
    ) external returns (uint256, uint256);

    function calculateUpDownRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        address token,
        uint256 updownFee,
        bytes32 gameId
    ) external returns (uint256 rate);

    function universalDistribute(
        uint256 amount,
        address to,
        address token,
        uint256 initialDeposit,
        uint256 gameFee,
        bytes32 gameId,
        uint256 rate
    ) external;

    function withdrawGameFee(
        uint256 lostTeamDeposits,
        address token,
        uint256 gameFee,
        bytes32 gameId
    ) external;

    function calculateRate(
        uint256 wonTeamTotal,
        bytes32 gameId
    ) external view returns (uint256);

    function withdrawInitiatorFee(
        uint256 lostTeamDeposits,
        address token,
        uint256 initiatorFee,
        address initiator,
        bytes32 gameId
    ) external;
}
