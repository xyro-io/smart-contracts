//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract BullseyeGame is Ownable {
    uint256 constant DENOMINATOR = 10000;
    uint256 public fee = 100;
    uint256[3] public rate = [5000, 3500, 1500];
    uint256[3] public exactRate = [7500, 1500, 1000];
    uint256[2] public twoPlayersRate = [7500, 2500];
    uint256[2] public twoPlayersExactRate = [8000, 2000];
    uint256 public gameId;
    event BullseyeStart(uint48 startTime, uint48 endTime, uint256 betAmount, uint256 indexed gameId);
    event BullseyeBet(address player, int192 assetPrice, uint256 betAmount, uint256 indexed gameId);
    event BullseyeFinalized(address[3] topPlayers, uint256[3] wonAmount, uint256 indexed gameId);
    event BullseyeFinalized(address firstPlace, address secondPlace, uint256 wonAmountFirst, uint256 wonAmountSecond, uint256 indexed gameId);

    struct BetInfo {
        bytes32 feedId;
        uint48 startTime;
        uint48 endTime;
        uint256 betAmount;
    }

    address[] public players;
    mapping(address => int192) public assetPrices;
    mapping(address => uint256) public betTimestamp;

    BetInfo public game;
    address public treasury;

    constructor() Ownable(msg.sender) {}

    /**
     * Starts bullseye game
     * @param startTime when the game iteration will start
     * @param endTime when the game iteration will end
     * @param betAmount amount to enter the game
     */
    function startGame(
        uint48 startTime,
        uint48 endTime,
        uint256 betAmount,
        bytes32 feedId
    ) public onlyOwner {
        game.feedId = feedId;
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        emit BullseyeStart(startTime, endTime, betAmount, gameId);
    }

    /**
     * Participate in bullseye game
     * @param assetPrice player's picked asset price
     */
    function bet(int192 assetPrice) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(assetPrices[msg.sender] == 0, "Bet already exists");
        betTimestamp[msg.sender] = block.timestamp;
        players.push(msg.sender);
        assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        emit BullseyeBet(msg.sender, assetPrice, game.betAmount, gameId);
    }

    /**
     * Participate in bullseye game with permit
     * @param assetPrice player's picked asset price
     */
    function betWithPermit(
        int192 assetPrice,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(assetPrices[msg.sender] == 0, "Bet already exists");
        betTimestamp[msg.sender] = block.timestamp;
        players.push(msg.sender);
        assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).depositWithPermit(game.betAmount, msg.sender, deadline, v, r, s);
        emit BullseyeBet(msg.sender, assetPrice, game.betAmount, gameId);
    }

    /**
     * Finalizes bullseye game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(bytes memory unverifiedReport) public onlyOwner {
        require(players.length > 0, "Can't end");
        require(block.timestamp >= game.endTime, "Too early to finish");
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
        if (players.length == 2) {
            address playerOne = players[0];
            address playerTwo = players[1];
            int192 playerOneDiff = assetPrices[playerOne] > finalPrice
                ? assetPrices[playerOne] - finalPrice
                : finalPrice - assetPrices[playerOne];
            int192 playerTwoDiff = assetPrices[playerTwo] > finalPrice
                ? assetPrices[playerTwo] - finalPrice
                : finalPrice - assetPrices[playerTwo];
            if (playerOneDiff < playerTwoDiff) {
                // player 1 closer
                uint256 wonAmountFirst = (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[0]
                                : twoPlayersRate[0]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountFirst,
                    playerOne,
                    game.betAmount,
                    fee
                );
                uint256 wonAmountSecond = (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[1]
                                : twoPlayersRate[1]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountSecond,
                    playerTwo,
                    game.betAmount,
                    fee
                );
                emit BullseyeFinalized(playerOne, playerTwo, wonAmountFirst, wonAmountSecond, gameId);
            } else {
                // player 2 closer
                uint256 wonAmountFirst = (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[0]
                                : twoPlayersRate[0]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountFirst,
                    playerTwo,
                    game.betAmount,
                    fee
                );
                uint256 wonAmountSecond = (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[1]
                                : twoPlayersRate[1]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountSecond,
                    playerOne,
                    game.betAmount,
                    fee
                );
                emit BullseyeFinalized(playerTwo, playerOne, wonAmountFirst, wonAmountSecond, gameId);
            }
        } else {
            address[3] memory topPlayers;
            int192[3] memory closestDiff = [
                type(int192).max,
                type(int192).max,
                type(int192).max
            ];
            for (uint256 j = 0; j < players.length; j++) {
                address currentAddress = players[j];
                int192 currentGuess = assetPrices[currentAddress];
                int192 currentDiff = currentGuess > finalPrice
                    ? currentGuess - finalPrice
                    : finalPrice - currentGuess;
                uint256 currentTimestamp = betTimestamp[currentAddress];
                for (uint256 i = 0; i < 3; i++) {
                    if (currentDiff < closestDiff[i]) {
                        for (uint256 k = 2; k > i; k--) {
                            closestDiff[k] = closestDiff[k - 1];
                            topPlayers[k] = topPlayers[k - 1];
                        }
                        closestDiff[i] = currentDiff;
                        topPlayers[i] = currentAddress;
                        break;
                    } else if (
                        currentDiff == closestDiff[i] &&
                        currentTimestamp < betTimestamp[topPlayers[i]]
                    ) {
                        for (uint256 k = 2; k > i; k--) {
                            closestDiff[k] = closestDiff[k - 1];
                            topPlayers[k] = topPlayers[k - 1];
                        }
                        topPlayers[i] = currentAddress;
                        break;
                    }
                }
            }
            uint256 totalBets = game.betAmount * players.length;
            uint256[3] memory wonAmount;
            if (closestDiff[0] == 0) {
                wonAmount = exactRate;
            } else {
                wonAmount = rate;
            }
            for (uint256 i = 0; i < 3; i++) {
                if (topPlayers[i] != address(0)) {
                    ITreasury(treasury).distribute(
                        (totalBets * wonAmount[i]) / DENOMINATOR,
                        topPlayers[i],
                        game.betAmount,
                        fee
                    );
                    totalBets -= wonAmount[i];
                }
            }
            emit BullseyeFinalized(topPlayers, wonAmount, gameId);
        }
        //Do we need to clear mappings?
        for (uint256 i = 0; i < players.length; i++) {
            assetPrices[players[i]] = 0;
            betTimestamp[players[i]] = 0;
        }
        delete game;
        gameId++;
    }

    function getTotalPlayers() public view returns (uint256) {
        return players.length;
    }

    /**
     * onlyDAO
     * Do we need this?
     */
    function changeBetAmount(uint256 newBetAmount) public {
        game.betAmount = newBetAmount;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
