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
    event ExactPriceClosed(uint256 betId, address initiator);
    event ExactPriceEnd(uint256 betId, address winner);

    enum Status {
        Created,
        Closed,
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
        require(_betAmount >= 10000000000000000000, "Wrong bet amount");
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
            "Time is up"
        );
        require(bet.initiatorPrice != _opponentPrice, "Same asset prices");
        //Если не приватная игра, то адрес будет 0
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
        games[betId].gameStatus = Status.Closed;
        games[betId] = bet;
        emit ExactPriceClosed(betId, bet.initiator);
    }

    function refuseBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == bet.opponent, "Only opponent can refuse");
        bet.gameStatus = Status.Refused;
        games[betId] = bet;
        emit ExactPriceRefused(betId);
    }

    //only owner
    function endGame(uint256 betId, uint256 finalPrice) public onlyOwner {
        BetInfo memory bet = games[betId];
        //Можно сделать чтобы токены передавались только бэком, а пару хранить в структуре
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        uint256 diff1 = bet.initiatorPrice > finalPrice
            ? bet.initiatorPrice - finalPrice
            : finalPrice - bet.initiatorPrice;
        uint256 diff2 = bet.opponentPrice > finalPrice
            ? bet.opponentPrice - finalPrice
            : finalPrice - bet.opponentPrice;

        if (diff1 < diff2) {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.initiator,
                bet.betAmount
            );
            emit ExactPriceEnd(betId, bet.initiator);
        } else {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.opponent,
                bet.betAmount
            );
            emit ExactPriceEnd(betId, bet.opponent);
        }
        bet.finalAssetPrice = finalPrice;
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
