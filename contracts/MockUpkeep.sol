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

    function verify(
        bytes memory unverifiedReport
    ) public pure returns (int192) {
        int192 price = abi.decode(unverifiedReport, (int192));
        return price;
    }
}
