// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract BullseyeGame is Ownable {
    uint256 constant DENOMINATOR = 10000;
    uint256 public fee = 100;
    uint256[3] public rate = [5000, 3500, 1500];
    uint256[3] public exactRate = [7500, 1500, 1000];
    uint256[2] public twoPlayersRate = [7500, 2500];
    uint256[2] public twoPlayersExactRate = [8000, 2000];
    event BullseyeStart(uint48 startTime, uint48 endTime, uint256 betAmount);
    event BullseyeBet(address player, uint256 assetPrice, uint256 betAmount);
    event BullseyeFinalized(address[3] topPlayers, uint256[3] wonAmount);

    struct BetInfo {
        uint48 startTime;
        uint48 endTime;
        uint256 betAmount;
        address[] players;
        mapping(address => uint256) assetPrices;
        mapping(address => uint256) betTimestamp;
    }

    BetInfo public game;
    address public treasury;

    constructor() Ownable(msg.sender) {}

    function startGame(
        uint48 startTime,
        uint48 endTime,
        uint256 betAmount
    ) public onlyOwner {
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        emit BullseyeStart(startTime, endTime, betAmount);
    }

    function bet(uint256 assetPrice) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(game.assetPrices[msg.sender] == 0, "Bet already exists");
        game.betTimestamp[msg.sender] = block.timestamp;
        game.players.push(msg.sender);
        game.assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        emit BullseyeBet(msg.sender, assetPrice, game.betAmount);
    }

    //only owner
    function finalizeGame(uint256 finalPrice) public onlyOwner {
        require(game.players.length > 0, "Can't end");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (game.players.length == 2) {
            address playerOne = game.players[0];
            address playerTwo = game.players[1];
            uint256 playerOneDiff = game.assetPrices[playerOne] > finalPrice
                ? game.assetPrices[playerOne] - finalPrice
                : finalPrice - game.assetPrices[playerOne];
            uint256 playerTwoDiff = game.assetPrices[playerTwo] > finalPrice
                ? game.assetPrices[playerTwo] - finalPrice
                : finalPrice - game.assetPrices[playerTwo];
            if (playerOneDiff < playerTwoDiff) {
                //player 1 closer
                ITreasury(treasury).distribute(
                    (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[0]
                                : twoPlayersRate[0]
                        )) / DENOMINATOR,
                    playerOne,
                    game.betAmount,
                    fee
                );
                ITreasury(treasury).distribute(
                    (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[1]
                                : twoPlayersRate[1]
                        )) / DENOMINATOR,
                    playerTwo,
                    game.betAmount,
                    fee
                );
            } else {
                //player 2 closer
                ITreasury(treasury).distribute(
                    (2 *
                        game.betAmount *
                        (
                            playerTwoDiff == 0
                                ? twoPlayersExactRate[0]
                                : twoPlayersRate[0]
                        )) / DENOMINATOR,
                    playerTwo,
                    game.betAmount,
                    fee
                );
                ITreasury(treasury).distribute(
                    (2 *
                        game.betAmount *
                        (
                            playerOneDiff == 0
                                ? twoPlayersExactRate[1]
                                : twoPlayersRate[1]
                        )) / DENOMINATOR,
                    playerOne,
                    game.betAmount,
                    fee
                );
            }
        } else {
            address[3] memory topPlayers;
            uint256[3] memory closestDiff = [
                type(uint256).max,
                type(uint256).max,
                type(uint256).max
            ];

            for (uint256 j = 0; j < game.players.length; j++) {
                address currentAddress = game.players[j];
                uint256 currentGuess = game.assetPrices[currentAddress];
                uint256 currentDiff = currentGuess > finalPrice
                    ? currentGuess - finalPrice
                    : finalPrice - currentGuess;
                uint256 currentTimestamp = game.betTimestamp[currentAddress];

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
                        currentTimestamp < game.betTimestamp[topPlayers[i]]
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

            uint256 totalBets = game.betAmount * game.players.length;
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
        }
        // emit BullseyeFinalized(topPlayers, wonAmount);
        delete game;
    }

    //onlyDAO
    function changeBetAmount(uint256 newBetAmount) public {
        game.betAmount = newBetAmount;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
