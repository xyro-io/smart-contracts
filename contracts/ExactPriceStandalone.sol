// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract ExactPriceStandalone is Ownable {
    event ExactPriceCreated(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        uint256 initiatorPrice,
        uint256 betAmount,
        address initiator
    );
    event ExactPriceAccepted(
        uint256 betId,
        address opponent,
        uint256 opponentPrice
    );
    event ExactPriceRefused(uint256 betId);
    event ExactPriceCancelled(
        uint256 betId,
        address initiator,
        uint256 betAmount,
        uint48 startTime,
        uint48 endTime,
        Status gameStatus
    );
    event ExactPriceFinalized(
        uint256 betId,
        address winner,
        address loser,
        uint256 winnerGuessPrice,
        uint256 loserAssetPrice,
        uint256 betAmount,
        uint256 finalAssetPrice,
        uint48 startTime,
        uint48 endTime,
        Status gameStatus
    );

    enum Status {
        Created,
        Cancelled,
        Started,
        Finished,
        Refused
    }

    struct BetInfo {
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        uint256 betAmount;
        uint256 initiatorPrice;
        uint256 opponentPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo[] public games;
    address public treasury;

    constructor() Ownable(msg.sender) {}

    function createBet(
        address _opponent,
        uint48 _startTime,
        uint48 _endTime,
        uint256 _initiatorPrice,
        uint256 _betAmount
    ) public {
        require(
            _endTime - _startTime >= 30 minutes,
            "Min bet duration must be 30 minutes"
        );
        require(
            _endTime - _startTime <= 24 weeks,
            "Max bet duration must be 6 month"
        );
        require(_betAmount >= 1e19, "Wrong bet amount");
        BetInfo memory newBet;
        newBet.initiator = msg.sender;
        newBet.startTime = _startTime;
        newBet.endTime = _endTime;
        ITreasury(treasury).deposit(_betAmount, msg.sender);
        newBet.initiatorPrice = _initiatorPrice;
        newBet.betAmount = _betAmount;
        newBet.opponent = _opponent;
        newBet.gameStatus = Status.Created;
        games.push(newBet);
        emit ExactPriceCreated(
            _opponent,
            _startTime,
            _endTime,
            _initiatorPrice,
            _betAmount,
            msg.sender
        );
    }

    function acceptBet(uint256 betId, uint256 _opponentPrice) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(
            bet.startTime + (bet.endTime - bet.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(bet.initiatorPrice != _opponentPrice, "Same asset prices");
        //If game is not private address should be 0
        if (bet.opponent != address(0)) {
            require(
                msg.sender == bet.opponent,
                "Only certain account can accept"
            );
            if (_opponentPrice == 0) {
                bet.gameStatus = Status.Refused;
                games[betId] = bet;
                return;
            }
        } else {
            bet.opponent == msg.sender;
        }
        bet.opponentPrice = _opponentPrice;
        ITreasury(treasury).deposit(bet.betAmount, msg.sender);
        bet.gameStatus = Status.Started;
        games[betId] = bet;
        emit ExactPriceAccepted(betId, msg.sender, _opponentPrice);
    }

    function closeBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.initiator == msg.sender, "Wrong sender");
        require(
            bet.gameStatus == Status.Refused ||
                (bet.startTime + (bet.endTime - bet.startTime) / 3 <
                    block.timestamp &&
                    bet.gameStatus == Status.Created),
            "Wrong status!"
        );
        ITreasury(treasury).refund(bet.betAmount, bet.initiator);
        games[betId].gameStatus = Status.Cancelled;
        games[betId] = bet;
        emit ExactPriceCancelled(
            betId,
            bet.initiator,
            bet.betAmount,
            bet.startTime,
            bet.endTime,
            Status.Cancelled
        );
    }

    function refuseBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == bet.opponent, "Only opponent can refuse");
        bet.gameStatus = Status.Refused;
        games[betId] = bet;
        emit ExactPriceRefused(betId);
    }

    function finalizeGame(
        uint256 betId,
        uint256 finalAssetPrice
    ) public onlyOwner {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        uint256 diff1 = bet.initiatorPrice > finalAssetPrice
            ? bet.initiatorPrice - finalAssetPrice
            : finalAssetPrice - bet.initiatorPrice;
        uint256 diff2 = bet.opponentPrice > finalAssetPrice
            ? bet.opponentPrice - finalAssetPrice
            : finalAssetPrice - bet.opponentPrice;

        if (diff1 < diff2) {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.initiator,
                bet.betAmount
            );
            emit ExactPriceFinalized(
                betId,
                bet.initiator,
                bet.opponent,
                bet.initiatorPrice,
                bet.opponentPrice,
                bet.betAmount,
                finalAssetPrice,
                bet.startTime,
                bet.endTime,
                Status.Finished
            );
        } else {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.opponent,
                bet.betAmount
            );
            emit ExactPriceFinalized(
                betId,
                bet.opponent,
                bet.initiator,
                bet.opponentPrice,
                bet.initiatorPrice,
                bet.betAmount,
                finalAssetPrice,
                bet.startTime,
                bet.endTime,
                Status.Finished
            );
        }
        bet.finalAssetPrice = finalAssetPrice;
        bet.gameStatus = Status.Finished;
        games[betId] = bet;
    }

    function totalBets() public view returns (uint256) {
        return games.length;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
