// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./OneVsOneGameUpDown.sol";
import "./OneVsOneGameExactPrice.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;

    function transferOwnership(address newOwner) external;
}

contract GameFactory is Ownable {
    address public treasury;
    uint256 betId;
    mapping(uint256 => address) public games;

    constructor(address newTreasury) Ownable(msg.sender) {
        treasury = newTreasury;
    }

    function createUpDownGame(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        address uniFactory,
        address token0,
        address token1
    ) public returns (address newGame) {
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
                abi.encode(
                    opponent,
                    startTime,
                    endTime,
                    willGoUp,
                    betAmount,
                    msg.sender,
                    uniFactory,
                    token0,
                    token1
                )
            )
        );
        ITreasury(treasury).deposit(betAmount, msg.sender);
        IGame(newGame).setTreasury(treasury);
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
    }

    function createExactPriceGame(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        uint256 initiatorPrice,
        uint256 betAmount,
        address token0,
        address token1
    ) public returns (address newGame) {
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
                type(OneVsOneGameExactPrice).creationCode,
                abi.encode(
                    opponent,
                    startTime,
                    endTime,
                    initiatorPrice,
                    betAmount,
                    msg.sender,
                    token0,
                    token1
                )
            )
        );
        ITreasury(treasury).deposit(betAmount, msg.sender);
        IGame(newGame).setTreasury(treasury);
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
    }
}
