// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SetupGameUni.sol";
import "./OneVsOneGameUpDownUFactory.sol";
import "./OneVsOneGameExactPriceUFactory.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;

    function transferOwnership(address newOwner) external;
}

contract GameFactoryUniswap is Ownable {
    address public treasury;
    uint256 betId;
    mapping(uint256 => address) public games;

    constructor(address newTreasury) Ownable(msg.sender) {
        treasury = newTreasury;
    }

    function createSetupGame(
        uint48 startTime,
        uint48 endTime,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        uint256 amount,
        address uniFactory,
        address token0,
        address token1,
        bool isStopLoss
    ) public returns (address newGame) {
        require(
            endTime - startTime >= 15 minutes,
            "Min game duration must be 15 minutes"
        );
        require(
            endTime - startTime <= 24 hours,
            "Max game duration must be 24 hours"
        );
        if(amount != 0) {
            ITreasury(treasury).deposit(amount, msg.sender);
        }
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, takeProfitPrice)),
            abi.encodePacked(
                type(SetupGameUni).creationCode,
                abi.encode(
                    isStopLoss,
                    startTime,
                    endTime,
                    takeProfitPrice,
                    stopLossPrice,
                    msg.sender,
                    amount,
                    uniFactory,
                    token0,
                    token1
                )
            )
        );
        IGame(newGame).setTreasury(treasury);
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
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
                type(OneVsOneGameUpDownUFactory).creationCode,
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
                type(OneVsOneGameExactPriceUFactory).creationCode,
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