// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
//добавить AccessControl
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OneVsOneGame is Ownable {
    enum Status {
        Created,
        Closed,
        Prepared,
        Started,
        Finished,
        Refused
    }

    struct BetInfo {
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        bool isUpDown; //режим игры
        bool willGoUp; //что выбрал инициатор игры
        uint256 betAmount;
        uint256 initiatorPrice;
        uint256 opponentPrice;
        uint256 startingAssetPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    mapping(uint256 => BetInfo) public games;
    uint256 public totalBets;
    address public treasury;

    constructor() Ownable(msg.sender){}

    function createBet(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool gameMode,
        bool willGoUp,
        uint256 initiatorPrice,
        uint256 betAmount
    ) public {
        require(
            endTime - startTime >= 30 minutes,
            "Min bet duration must be 30 minutes"
        ); 
        require(
            endTime - startTime <= 24 weeks,
            "Max bet duration must be 6 month"
        );
        require(betAmount >= 10000000000000000000, "Wrong bet amount");
        BetInfo memory newBet;
        newBet.initiator = msg.sender;
        newBet.startTime = startTime;
        newBet.endTime = endTime;
        ITreasury(treasury).deposit(betAmount, msg.sender);
        newBet.initiatorPrice = initiatorPrice;
        newBet.betAmount = betAmount;
        newBet.opponent = opponent;
        newBet.isUpDown = gameMode;
        newBet.willGoUp = willGoUp;
        newBet.gameStatus = gameMode ? Status.Created : Status.Prepared;
        games[totalBets++] = newBet;
        //добавить event
    }

    function setStartingPrice(uint256 betId, uint256 assetPrice) onlyOwner public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        bet.gameStatus = Status.Prepared;
        bet.startingAssetPrice = assetPrice;
        games[betId] = bet;
    }

    function acceptBet(uint256 betId, uint256 opponentPrice) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Prepared, "Wrong status!");
        require(
            bet.startTime + (bet.endTime - bet.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        if (bet.isUpDown) {
            require(bet.initiatorPrice != opponentPrice, "Same asset prices");
        }
        //Если не приватная игра, то адрес будет 0
        if (bet.opponent != address(0)) {
            require(
                msg.sender == bet.opponent,
                "Only certain account can accept"
            );
            if (opponentPrice == 0) {
                bet.gameStatus = Status.Refused;
                games[betId] = bet;
                return;
            }
        } else {
            bet.opponent == msg.sender;
        }
        bet.opponentPrice = opponentPrice;
        ITreasury(treasury).deposit(bet.betAmount, msg.sender);
        bet.gameStatus = Status.Started;
        games[betId] = bet;
    }

    function closeBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.initiator == msg.sender, "Wrong sender");
        require(
            bet.gameStatus == Status.Refused ||
                (bet.startTime + (bet.endTime - bet.startTime) / 3 <
                    block.timestamp &&
                    bet.gameStatus == Status.Prepared), "Wrong status!"
        );
        ITreasury(treasury).refund(bet.betAmount, bet.initiator);
        games[betId].gameStatus = Status.Closed;
        games[betId] = bet;
    }

    //only owner
    function endGame(uint256 betId, uint256 finalPrice) onlyOwner public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        if (bet.isUpDown) {
            if (
                bet.willGoUp
                    ? bet.startingAssetPrice < finalPrice
                    : bet.startingAssetPrice > finalPrice
            ) {
                ITreasury(treasury).distribute(bet.betAmount, bet.initiator, bet.betAmount);
            } else {
                ITreasury(treasury).distribute(bet.betAmount, bet.opponent, bet.betAmount);
            }
        } else {
            uint256 diff1 = bet.initiatorPrice > finalPrice
                ? bet.initiatorPrice - finalPrice
                : finalPrice - bet.initiatorPrice;
            uint256 diff2 = bet.opponentPrice > finalPrice
                ? bet.opponentPrice - finalPrice
                : finalPrice - bet.opponentPrice;

            if (diff1 < diff2) {
                ITreasury(treasury).distribute(bet.betAmount, bet.initiator, bet.betAmount);
            } else {
                ITreasury(treasury).distribute(bet.betAmount, bet.opponent, bet.betAmount);
            }
        }
        bet.finalAssetPrice = finalPrice;
        bet.gameStatus = Status.Finished;
        games[betId] = bet;
    }

    function setTreasury(address newTreasury) onlyOwner public {
        treasury = newTreasury;
    }

}