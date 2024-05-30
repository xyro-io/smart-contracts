// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract MockUpkeep {
    int192 public lastRetrievedPrice;

    function setPrice(int192 priceData) public {
        lastRetrievedPrice = priceData;
    }

    function getPrice() public view returns (int192) {
        return lastRetrievedPrice;
    }

    function verifyReport(
        bytes memory unverifiedReport,
        bytes32 feedId
    ) public pure returns (int192) {
        (int192 price, bytes32 decodedFeed) = abi.decode(
            unverifiedReport,
            (int192, bytes32)
        );
        require(feedId == decodedFeed, "Wrong feedId");
        return price;
    }

    function verifyReportWithTimestamp(
        bytes memory unverifiedReport,
        bytes32 feedId
    ) public pure returns (int192, uint32) {
        (int192 price, bytes32 decodedFeed, uint32 timestamp) = abi.decode(
            unverifiedReport,
            (int192, bytes32, uint32)
        );
        require(feedId == decodedFeed, "Wrong feedId");
        return (price, timestamp);
    }
}
