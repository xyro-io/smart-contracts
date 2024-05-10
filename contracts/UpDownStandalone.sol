// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract UpDownStandalone is Ownable {
    event UpDownCreated(
        uint256 betId,
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
        int192 startingAssetPrice,
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
        bool willGoUp; //Initiator choise
        uint256 betAmount;
        int192 startingAssetPrice;
        int192 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo[] public games;
    address public treasury;
    uint256 public fee = 100;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;

    constructor() Ownable(msg.sender) {}

    /** Creates 1vs1 up/down mode game
    //@param opponent address of the opponent
    //@param startTime when the game will start
    //@param endTime when the game will end
    //@param willGoUp up = true, down = false
    //@param betAmount amount to enter the game
    //@param unverifiedReport Chainlink DataStreams report
    */
    function createBet(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        bytes memory unverifiedReport,
        bytes32 feedId
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
        address upkeep = ITreasury(treasury).upkeep();
        newBet.startingAssetPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            feedId
        );
        newBet.feedId = feedId;
        newBet.initiator = msg.sender;
        newBet.startTime = startTime;
        newBet.endTime = endTime;
        ITreasury(treasury).deposit(betAmount, msg.sender);
        newBet.betAmount = betAmount;
        newBet.opponent = opponent;
        newBet.willGoUp = willGoUp;
        newBet.gameStatus = Status.Created;
        games.push(newBet);
        emit UpDownCreated(
            games.length,
            opponent,
            startTime,
            endTime,
            willGoUp,
            betAmount,
            msg.sender
        );
    }

    /**
     * Accepts 1vs1 up/down mode game
     * @param betId game id
     */
    function acceptBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
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
        emit UpDownRefused(betId);
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

    /**
     * Finalizes 1vs1 up/down mode game and distributes rewards to players
     * @param betId game id
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        uint256 betId,
        bytes memory unverifiedReport
    ) public onlyOwner {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            bet.feedId
        );
        if (
            bet.willGoUp
                ? bet.startingAssetPrice < finalPrice
                : bet.startingAssetPrice > finalPrice
        ) {
            ITreasury(treasury).distribute(
                bet.betAmount,
                bet.initiator,
                bet.betAmount,
                fee
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
                bet.betAmount,
                fee
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

    //Returns amount of all games
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
