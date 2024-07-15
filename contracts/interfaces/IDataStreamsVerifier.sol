// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDataStreamsVerifier {
    function lastRetrievedPrice() external view returns (int192);

    function getPrice() external view returns (int192);

    function verifyReportWithTimestamp(
        bytes memory unverifiedReport,
        uint8 feedNumber
    ) external returns (int192, uint32);
}
