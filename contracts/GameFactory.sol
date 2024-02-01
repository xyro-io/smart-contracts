    // SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IUniswapFactory.sol";
import "./OneVsOneGameUpDown.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;
}

contract GameFactory is Ownable {
    address public treasury;
    constructor(address newTreasury) Ownable(msg.sender) {
        treasury = newTreasury;
    }

    function createUpDownGame(address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        address uniFactory,
        address token0,
        address token1) public returns (address newGame) {
        require(
            endTime - startTime >= 30 minutes,
            "Min bet duration must be 30 minutes"
        );
        require(
            endTime - startTime <= 24 weeks,
            "Max bet duration must be 6 month"
        );
        require(betAmount >= 10000000000000000000, "Wrong bet amount");
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, token0)),
            abi.encodePacked(
                type(OneVsOneGameUpDown).creationCode,
                abi.encode(opponent, startTime, endTime, willGoUp, betAmount, msg.sender, uniFactory, token0, token1)
            )
        );
        IGame(newGame).setTreasury(treasury);
    }
}