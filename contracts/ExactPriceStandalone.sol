// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IMockUpkeep.sol";

contract ExactPriceStandalone is Ownable {
    event ExactPriceCreated(
        uint256 betId,
        address opponent,
        uint48 startTime,
        uint48 endTime,
        int192 initiatorPrice,
        uint256 betAmount,
        address initiator
    );
    event ExactPriceAccepted(
        uint256 betId,
        address opponent,
        int192 opponentPrice
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
        int192 winnerGuessPrice,
        int192 loserAssetPrice,
        uint256 betAmount,
        int192 finalAssetPrice,
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
        bytes32 feedId;
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        uint256 betAmount;
        int192 initiatorPrice;
        int192 opponentPrice;
        int192 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo[] public games;
    address public treasury;
    uint256 public fee = 100;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;

    constructor() Ownable(msg.sender) {}

    /**
     * Creates 1vs1 exact price mode game
     * @param opponent address of the opponent
     * @param startTime when the game will start
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param betAmount amount to enter the game
     */
    function createBet(
        bytes32 feedId,
        address opponent,
        uint48 startTime,
        uint48 endTime,
        int192 initiatorPrice,
        uint256 betAmount
    ) public {
        require(
            endTime - startTime >= minDuration,
            "Min bet duration must be higher"
        );
        require(
            endTime - startTime <= maxDuration,
            "Max bet duration must be lower"
        );
        require(betAmount >= 1e19, "Wrong bet amount");
        BetInfo memory newBet;
        newBet.initiator = msg.sender;
        newBet.startTime = startTime;
        newBet.endTime = endTime;
        newBet.feedId = feedId;
        ITreasury(treasury).deposit(betAmount, msg.sender);
        newBet.initiatorPrice = initiatorPrice;
        newBet.betAmount = betAmount;
        newBet.opponent = opponent;
        newBet.gameStatus = Status.Created;
        games.push(newBet);
        emit ExactPriceCreated(
            games.length,
            opponent,
            startTime,
            endTime,
            initiatorPrice,
            betAmount,
            msg.sender
        );
    }

    /**
     * Accepts 1vs1 exact price mode game
     * @param betId game id
     * @param opponentPrice picked asset price
     */
    function acceptBet(uint256 betId, int192 opponentPrice) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(
            bet.startTime + (bet.endTime - bet.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(bet.initiatorPrice != opponentPrice, "Same asset prices");
        // If game is not private address should be 0
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
        emit ExactPriceAccepted(betId, msg.sender, opponentPrice);
    }

    /**
     * Accepts 1vs1 exact price mode game
     * @param betId game id
     * @param opponentPrice picked asset price
     */
    function acceptBetWithPermit(
        uint256 betId, 
        int192 opponentPrice, 
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(
            bet.startTime + (bet.endTime - bet.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(bet.initiatorPrice != opponentPrice, "Same asset prices");
        // If game is not private address should be 0
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
        ITreasury(treasury).depositWithPermit(bet.betAmount, msg.sender, deadline, v, r, s);
        bet.gameStatus = Status.Started;
        games[betId] = bet;
        emit ExactPriceAccepted(betId, msg.sender, opponentPrice);
    }

    /**
     * Closes game and refunds tokens
     * @param betId game id
     */
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
        bet.gameStatus = Status.Cancelled;
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

    /**
     * Changes bet status if opponent refuses to play
     * @param betId game id
     */
    function refuseBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == bet.opponent, "Only opponent can refuse");
        bet.gameStatus = Status.Refused;
        games[betId] = bet;
        emit ExactPriceRefused(betId);
    }

    /**
     * Finalizes 1vs1 exact price mode game and distributes rewards to players
     * @param betId game id
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        uint256 betId,
        bytes memory unverifiedReport
    ) public onlyOwner {
        address upkeep = ITreasury(treasury).upkeep();
        BetInfo memory bet = games[betId];
        int192 finalAssetPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            bet.feedId
        );
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        int192 diff1 = bet.initiatorPrice > finalAssetPrice
            ? bet.initiatorPrice - finalAssetPrice
            : finalAssetPrice - bet.initiatorPrice;
        int192 diff2 = bet.opponentPrice > finalAssetPrice
            ? bet.opponentPrice - finalAssetPrice
            : finalAssetPrice - bet.opponentPrice;

        if (diff1 < diff2) {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.initiator,
                bet.betAmount,
                fee
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
                bet.betAmount,
                fee
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

    /**
     * onlyDao
     * Changes min and max game limits
     * @param newMaxDuration new max game duration
     * @param newMinDuration new min game duration
     */
    function changeBetDuration(
        uint256 newMaxDuration,
        uint256 newMinDuration
    ) public {
        minDuration = newMinDuration;
        maxDuration = newMaxDuration;
    }

    /**
     * Returns amount of all games
     */
    function totalBets() public view returns (uint256) {
        return games.length;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
