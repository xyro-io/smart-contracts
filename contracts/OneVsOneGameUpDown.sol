// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract OneVsOneGameUpDown is Ownable {
    enum Status {
        Created,
        Prepared,
        Closed,
        Started,
        Finished,
        Refused
    }
    //разделить игру на два контракта по режимам
    struct BetInfo {
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        bool willGoUp; //что выбрал инициатор игры
        uint256 betAmount;
        uint256 startingAssetPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo public game;
    address public treasury;

    constructor(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        address initiator
    ) Ownable(msg.sender) {
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        game.opponent = opponent;
        game.willGoUp = willGoUp;
        game.gameStatus = Status.Created;
    }

    function setStartingPrice(uint256 assetPrice) onlyOwner public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        game.gameStatus = Status.Prepared;
        game.startingAssetPrice = assetPrice;
    }

    function acceptBet() public {
        require(game.gameStatus == Status.Prepared, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        //Если не приватная игра, то адрес будет 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
        } else {
            game.opponent == msg.sender;
        }
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        game.gameStatus = Status.Started;
    }

    function refuseBet() public {
        require(game.gameStatus == Status.Prepared, "Wrong status!");
        require(msg.sender == game.opponent, "Only opponent can refuse");
        game.gameStatus = Status.Refused;
    }

    function closeBet() public {
        require(game.initiator == msg.sender, "Wrong sender");
        require(
            game.gameStatus == Status.Refused ||
                (game.startTime + (game.endTime - game.startTime) / 3 <
                    block.timestamp &&
                    game.gameStatus == Status.Prepared),
            "Wrong status!"
        );
        ITreasury(treasury).refund(game.betAmount, game.initiator);
        game.gameStatus = Status.Closed;
    }

    //only owner
    function endGame(uint256 finalPrice) public onlyOwner {
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (
            game.willGoUp
                ? game.startingAssetPrice < finalPrice
                : game.startingAssetPrice > finalPrice
        ) {
            ITreasury(treasury).distribute(game.betAmount, game.initiator);
        } else {
            ITreasury(treasury).distribute(game.betAmount, game.opponent);
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
