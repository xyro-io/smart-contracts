// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract MockVerifier {
    int192 public lastRetrievedPrice;

    function setPrice(int192 priceData) public {
        lastRetrievedPrice = priceData;
    }

    function getPrice() public view returns (int192) {
        return lastRetrievedPrice;
    }

    function verifyReport(
        bytes memory unverifiedReport,
        uint8 feedId
    ) public pure returns (int192) {
        (int192 price, uint8 decodedFeed) = abi.decode(
            unverifiedReport,
            (int192, uint8)
        );
        require(feedId == decodedFeed, "Wrong feedId");
        return price;
    }

    function verifyReportWithTimestamp(
        bytes memory unverifiedReport,
        uint8 feedId
    ) public pure returns (int192, uint32) {
        (int192 price, uint8 decodedFeed, uint32 timestamp) = abi.decode(
            unverifiedReport,
            (int192, uint8, uint32)
        );
        require(feedId == decodedFeed, "Wrong feedId");
        return (price, timestamp);
    }
}
