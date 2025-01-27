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

    function gameToken(bytes32 gameId) external view returns (address);

    function grantRole(bytes32 role, address account) external;

    function lockedRakeback(
        bytes32 gameId,
        address player,
        uint256 depositId
    ) external returns (uint256);

    function depositAndLock(
        uint256 amount,
        address from,
        bytes32 gameId,
        uint256 depositId
    ) external returns (uint256);

    function depositAndLock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) external returns (uint256 rakeback);

    function depositAndLockWithPermit(
        uint256 amount,
        address from,
        bytes32 gameId,
        uint256 depositId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 rakeback);

    function depositAndLockWithPermit(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 rakeback);

    function lock(
        uint256 amount,
        address from,
        uint256 depositId,
        bytes32 gameId
    ) external returns (uint256 rakeback);

    function lock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) external returns (uint256 rakeback);

    function upkeep() external view returns (address);

    function bullseyeResetLockedAmount(bytes32 gameId) external;

    function distributeBullseye(
        uint256 rate,
        uint256 lostTeamRakeback,
        address to,
        bytes32 gameId,
        uint256 depositId
    ) external;

    function approvedTokens(address token) external returns (bool);

    function refund(uint256 amount, address to, bytes32 gameId) external;

    function refund(
        uint256 amount,
        address to,
        bytes32 gameId,
        uint256 depositId
    ) external;

    function refundWithFees(
        uint256 amount,
        address to,
        uint256 refundFee,
        bytes32 gameId
    ) external;

    function refundWithFees(
        uint256 amount,
        address to,
        uint256 refundFee,
        bytes32 gameId,
        uint256 depositId
    ) external;

    function universalDistribute(
        address to,
        uint256 initialDeposit,
        bytes32 gameId,
        uint256 rate
    ) external;

    function withdrawGameFee(
        uint256 lostTeamDeposits,
        uint256 gameFee,
        bytes32 gameId
    ) external returns (uint256 withdrawnFees);

    function calculateRate(
        uint256 wonTeamTotal,
        uint256 lostTeamRakeback,
        bytes32 gameId
    ) external returns (uint256);

    function withdrawInitiatorFee(
        uint256 lostTeamDeposits,
        uint256 wonTeamDeposits,
        uint256 initiatorFee,
        address initiator,
        bytes32 gameId
    ) external returns (uint256 withdrawnFees);

    function calculateRakebackAmount(
        address target,
        uint256 initialDeposit
    ) external;

    function setGameFinished(bytes32 gameId) external;

    function withdrawRakebackSetup(bytes32 gameId, address target) external;

    function setGameToken(bytes32 gameId, address token) external;

    function minDepositAmount(address token) external returns (uint256 amount);
}
