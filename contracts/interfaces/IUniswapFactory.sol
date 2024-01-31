// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapFactory {
    function getPair(address token0, address token1) view external returns (address);
}
