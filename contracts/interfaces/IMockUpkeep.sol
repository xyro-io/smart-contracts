// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockUpkeep {
    function lastRetrievedPrice() external view returns (int192);

    function getPrice() external view returns (int192);

    function verify(
        bytes memory unverifiedReport
    ) external pure returns (int192);
}
