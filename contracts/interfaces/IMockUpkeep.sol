// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockUpkeep {
    function lastRetrievedPrice() external view returns (int192);

    function getPrice() external view returns (int192);

    function verifyReport(
        bytes memory unverifiedReport,
        bytes32 feedId
    ) external pure returns (int192);
}
