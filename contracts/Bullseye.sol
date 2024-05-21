//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract Bullseye is Ownable {
    uint256 constant DENOMINATOR = 10000;
    uint256 public fee = 100;
    uint256[3] public rate = [5000, 3500, 1500];
    uint256[3] public exactRate = [7500, 1500, 1000];
    uint256[2] public twoPlayersRate = [7500, 2500];
    uint256[2] public twoPlayersExactRate = [8000, 2000];
    event BullseyeStart(uint48 startTime, uint48 endTime, uint256 depositAmount, bytes32 indexed gameId);
    event BullseyeNewPlayer(address player, int192 assetPrice, uint256 depositAmount, bytes32 indexed gameId);
    event BullseyeFinalized(address[3] topPlayers, uint256[3] wonAmount, int192[3] assetPrices, bytes32 indexed gameId);
    event BullseyeFinalized(address firstPlace, address secondPlace, uint256 wonAmountFirst, uint256 wonAmountSecond, bytes32 indexed gameId);

    struct GameInfo {
        bytes32 feedId;
        bytes32 gameId;
        uint48 startTime;
        uint48 endTime;
        uint256 depositAmount;
    }

    address[] public players;
    mapping(address => int192) public assetPrices;
    mapping(address => uint256) public playerTimestamp;

    GameInfo public game;
    address public treasury;

    constructor() Ownable(msg.sender) {}

    /**
     * Starts bullseye game
     * @param startTime when the game iteration will start
     * @param endTime when the game iteration will end
     * @param depositAmount amount to enter the game
     */
    function startGame(
        uint48 startTime,
        uint48 endTime,
        uint256 depositAmount,
        bytes32 feedId
    ) public onlyOwner {
        require(game.startTime == 0, "Finish previous game first");
        game.feedId = feedId;
        game.startTime = startTime;
        game.endTime = endTime;
        game.depositAmount = depositAmount;
        game.gameId = keccak256(abi.encodePacked(startTime, block.timestamp, address(this)));
        emit BullseyeStart(startTime, endTime, depositAmount, game.gameId);
    }

    /**
     * Participate in bullseye game
     * @param assetPrice player's picked asset price
     */
    function play(int192 assetPrice) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(assetPrices[msg.sender] == 0, "You are already in the game");
        playerTimestamp[msg.sender] = block.timestamp;
        players.push(msg.sender);
        assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).deposit(game.depositAmount, msg.sender);
        emit BullseyeNewPlayer(msg.sender, assetPrice, game.depositAmount, game.gameId);
    }

    /**
     * Participate in bullseye game with permit
     * @param assetPrice player's picked asset price
     */
    function playWithPermit(
        int192 assetPrice,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(assetPrices[msg.sender] == 0, "You are already in the game");
        playerTimestamp[msg.sender] = block.timestamp;
        players.push(msg.sender);
        assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).depositWithPermit(game.depositAmount, msg.sender, deadline, v, r, s);
        emit BullseyeNewPlayer(msg.sender, assetPrice, game.depositAmount, game.gameId);
    }

    /**
     * Finalizes bullseye game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(bytes memory unverifiedReport) public onlyOwner {
        require(players.length > 0 && block.timestamp > game.endTime, "Can't end");
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
                        game.depositAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[0]
                                : twoPlayersRate[0]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountFirst,
                    playerOne,
                    game.depositAmount,
                    fee
                );
                uint256 wonAmountSecond = (2 *
                        game.depositAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[1]
                                : twoPlayersRate[1]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountSecond,
                    playerTwo,
                    game.depositAmount,
                    fee
                );
                emit BullseyeFinalized(playerOne, playerTwo, wonAmountFirst, wonAmountSecond, game.gameId);
            } else {
                // player 2 closer
                uint256 wonAmountFirst = (2 *
                        game.depositAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[0]
                                : twoPlayersRate[0]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountFirst,
                    playerTwo,
                    game.depositAmount,
                    fee
                );
                uint256 wonAmountSecond = (2 *
                        game.depositAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[1]
                                : twoPlayersRate[1]
                        )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountSecond,
                    playerOne,
                    game.depositAmount,
                    fee
                );
                emit BullseyeFinalized(playerTwo, playerOne, wonAmountFirst, wonAmountSecond, game.gameId);
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
                uint256 currentTimestamp = playerTimestamp[currentAddress];
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
                        currentTimestamp < playerTimestamp[topPlayers[i]]
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
            uint256 totalDeposited = game.depositAmount * players.length;
            uint256[3] memory wonAmount;
            if (closestDiff[0] == 0) {
                wonAmount = exactRate;
            } else {
                wonAmount = rate;
            }
            for (uint256 i = 0; i < 3; i++) {
                if (topPlayers[i] != address(0)) {
                    ITreasury(treasury).distribute(
                        (totalDeposited * wonAmount[i]) / DENOMINATOR,
                        topPlayers[i],
                        game.depositAmount,
                        fee
                    );
                    totalDeposited -= wonAmount[i];
                }
            }
            emit BullseyeFinalized(topPlayers, wonAmount, [assetPrices[topPlayers[0]], assetPrices[topPlayers[1]], assetPrices[topPlayers[2]]], game.gameId);
        }
        for (uint256 i = 0; i < players.length; i++) {
            assetPrices[players[i]] = 0;
            playerTimestamp[players[i]] = 0;
        }
        delete game;
        delete players;
    }

    function getTotalPlayers() public view returns (uint256) {
        return players.length;
    }

    /**
     * onlyDAO
     * Do we need this?
     */
    function changeDepositAmount(uint256 newDepositAmount) public {
        game.depositAmount = newDepositAmount;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
