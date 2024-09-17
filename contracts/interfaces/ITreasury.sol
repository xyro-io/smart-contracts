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

    function depositAndLock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) external returns (uint256);

    function depositAndLockWithPermit(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    function lock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) external returns (uint256);

    function upkeep() external view returns (address);

    function distribute(
        uint256 amount,
        address to,
        uint256 initialDeposit,
        uint256 gameFee,
        bytes32 gameId
    ) external;

    function refund(uint256 amount, address to, bytes32 gameId) external;

    function refundWithFees(
        uint256 amount,
        address to,
        uint256 adminFee,
        bytes32 gameId
    ) external;

    function distributeWithoutFee(
        uint256 rate,
        address to,
        uint256 usedFee,
        uint256 initialDeposit,
        bytes32 gameId
    ) external;

    function calculateSetupRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 setupFee,
        address initiator,
        bytes32 gameId
    ) external returns (uint256, uint256);

    function calculateUpDownRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 updownFee,
        bytes32 gameId
    ) external returns (uint256 rate);

    function setGameFinished(bytes32 gameId) external;
}
