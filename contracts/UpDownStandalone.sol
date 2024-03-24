// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract UpDownStandalone is Ownable {
    event UpDownCreated(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        address initiator
    );
    event UpDownAccepted(
        uint256 betId,
        address opponent,
        bool willGoUp,
        uint256 betAmount
    );
    event UpDownRefused(uint256 betId);
    event UpDownCancelled(
        uint256 betId,
        address initiator,
        uint256 betAmount,
        uint48 startTime,
        uint48 endTime,
        Status gameStatus
    );
    event UpDownFinalized(
        uint256 betId,
        address winner,
        bool willGoUp,
        address loser,
        uint256 betAmount,
        uint256 startingAssetPrice,
        uint256 finalAssetPrice,
        uint48 startTime,
        uint48 endTime,
        Status gameStatus
    );
    event UpDownStartingPriceSet(
        uint256 betId,
        address initiator,
        uint48 startTime,
        uint48 endTime,
        uint256 assetPrice,
        Status gameStatus
    );

    enum Status {
        Created,
        Prepared,
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
        bool willGoUp; //Initiator choise
        uint256 betAmount;
        uint256 startingAssetPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo[] public games;
    address public treasury;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;

    constructor() Ownable(msg.sender) {}

    function createBet(
        address _opponent,
        uint48 _startTime,
        uint48 _endTime,
        bool _willGoUp,
        uint256 _betAmount
    ) public {
        require(
            _endTime - _startTime >= minDuration,
            "Min bet duration must be higher"
        );
        require(
            _endTime - _startTime <= maxDuration,
            "Max bet duration must be lower"
        );
        require(_betAmount >= 1e19, "Wrong bet amount");
        BetInfo memory newBet;
        newBet.initiator = msg.sender;
        newBet.startTime = _startTime;
        newBet.endTime = _endTime;
        ITreasury(treasury).deposit(_betAmount, msg.sender);
        newBet.betAmount = _betAmount;
        newBet.opponent = _opponent;
        newBet.willGoUp = _willGoUp;
        newBet.gameStatus = Status.Created;
        games.push(newBet);
        emit UpDownCreated(
            _opponent,
            _startTime,
            _endTime,
            _willGoUp,
            _betAmount,
            msg.sender
        );
    }

    function setStartingPrice(
        uint256 assetPrice,
        uint256 betId
    ) public onlyOwner {
        require(games[betId].gameStatus == Status.Created, "Wrong status!");
        games[betId].gameStatus = Status.Prepared;
        games[betId].startingAssetPrice = assetPrice;
        emit UpDownStartingPriceSet(
            betId,
            games[betId].initiator,
            games[betId].startTime,
            games[betId].endTime,
            assetPrice,
            Status.Prepared
        );
    }

    function acceptBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Prepared, "Wrong status!");
        require(
            bet.startTime + (bet.endTime - bet.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        //If game is not private address should be 0
        if (bet.opponent != address(0)) {
            require(
                msg.sender == bet.opponent,
                "Only certain account can accept"
            );
        } else {
            bet.opponent == msg.sender;
        }
        ITreasury(treasury).deposit(bet.betAmount, msg.sender);
        bet.gameStatus = Status.Started;
        games[betId] = bet;
        emit UpDownAccepted(betId, msg.sender, !bet.willGoUp, bet.betAmount);
    }

    function refuseBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == bet.opponent, "Only opponent can refuse");
        bet.gameStatus = Status.Refused;
        games[betId] = bet;
        emit UpDownRefused(betId);
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
        emit UpDownCancelled(
            betId,
            msg.sender,
            bet.betAmount,
            bet.startTime,
            bet.endTime,
            Status.Cancelled
        );
    }

    //only owner
    function finalizeGame(uint256 betId, uint256 finalPrice) public onlyOwner {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        if (
            bet.willGoUp
                ? bet.startingAssetPrice < finalPrice
                : bet.startingAssetPrice > finalPrice
        ) {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.initiator,
                bet.betAmount
            );
            emit UpDownFinalized(
                betId,
                bet.initiator,
                bet.willGoUp,
                bet.opponent,
                bet.betAmount,
                bet.startingAssetPrice,
                finalPrice,
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
            emit UpDownFinalized(
                betId,
                bet.opponent,
                !bet.willGoUp,
                bet.initiator,
                bet.betAmount,
                bet.startingAssetPrice,
                finalPrice,
                bet.startTime,
                bet.endTime,
                Status.Finished
            );
        }
        bet.finalAssetPrice = finalPrice;
        bet.gameStatus = Status.Finished;
        games[betId] = bet;
    }

    //onlyDao
    function changeBetDuration(
        uint256 newMaxDuration,
        uint256 newMinDuration
    ) public {
        minDuration = newMinDuration;
        maxDuration = newMaxDuration;
    }

    function totalBets() public view returns (uint256) {
        return games.length;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
