// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IToken {
    function acceptOwnership() external;
}

contract TokenOwner {
    address public token;

    constructor(address _token) {
        token = _token;
    }

    function acceptOwnership() external {
        IToken(token).acceptOwnership();
    }
}
