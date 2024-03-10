// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SetupGame.sol";
import "./OneVsOneGameUpDown.sol";
import "./OneVsOneGameExactPrice.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;

    function transferOwnership(address newOwner) external;
}

contract GameFactory is Ownable {
    event SetupCreated(uint48 startTime, uint48 endTime, uint256 takeProfitPrice, uint256 stopLossPrice, uint256 betAmount, bool isStopLoss, address creator);
    event UpDownCreated(address opponent, uint48 startTime, uint48 endTime, bool willGoUp, uint256 betAmount, address creator);
    event ExactPriceCreated(address opponent, uint48 startTime, uint48 endTime, uint256 initiatorPrice, uint256 betAmount, address creator);

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
        uint256 betAmount,
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
        if(betAmount != 0) {
            ITreasury(treasury).deposit(betAmount, msg.sender);
        }
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, takeProfitPrice)),
            abi.encodePacked(
                type(SetupGame).creationCode,
                abi.encode(
                    isStopLoss,
                    startTime,
                    endTime,
                    takeProfitPrice,
                    stopLossPrice,
                    msg.sender,
                    betAmount
                )
            )
        );
        emit SetupCreated(startTime, endTime, takeProfitPrice, stopLossPrice, betAmount, isStopLoss, msg.sender);
        IGame(newGame).setTreasury(treasury);
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
    }

    function createUpDownGame(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount
    ) public returns (address newGame) {
        require(
            endTime - startTime >= 30 minutes,
            "Min bet duration must be 30 minutes"
        );
        require(
            endTime - startTime <= 24 weeks,
            "Max bet duration must be 6 month"
        );
        require(betAmount >= 1e19, "Wrong bet amount");
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, betAmount)),
            abi.encodePacked(
                type(OneVsOneGameUpDown).creationCode,
                abi.encode(
                    opponent,
                    startTime,
                    endTime,
                    willGoUp,
                    betAmount,
                    msg.sender
                )
            )
        );
        emit UpDownCreated(opponent, startTime, endTime, willGoUp, betAmount, msg.sender);
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
        uint256 betAmount
    ) public returns (address newGame) {
        require(
            endTime - startTime >= 30 minutes,
            "Min bet duration must be 30 minutes"
        );
        require(
            endTime - startTime <= 24 weeks,
            "Max bet duration must be 6 month"
        );
        require(betAmount >= 1e19, "Wrong bet amount");
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, initiatorPrice)),
            abi.encodePacked(
                type(OneVsOneGameExactPrice).creationCode,
                abi.encode(
                    opponent,
                    startTime,
                    endTime,
                    initiatorPrice,
                    betAmount,
                    msg.sender
                )
            )
        );
        emit ExactPriceCreated(opponent, startTime, endTime, initiatorPrice, betAmount, msg.sender);
        ITreasury(treasury).deposit(betAmount, msg.sender);
        IGame(newGame).setTreasury(treasury);
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
    }
}
