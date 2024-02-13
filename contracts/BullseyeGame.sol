// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract BullseyeGame is Ownable {
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
    }

    function bet(uint256 assetPrice) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        require(game.assetPrices[msg.sender] == 0, "Bet already exists");
        game.betTimestamp[msg.sender] = block.timestamp;
        game.players.push(msg.sender);
        game.assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
    }

    //only owner
    function endGame(uint256 finalPrice) public onlyOwner {
        require(game.players.length > 0, "Can't end");
        require(block.timestamp >= game.endTime, "Too early to finish");
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
        //нужен ли тут цикл?
        for (uint256 i = 0; i < 3; i++) {
            if (closestDiff[i] == 0 && i == 0) {
                ITreasury(treasury).distributeBullseye(
                    ((game.betAmount * game.players.length) * 5000) / 10000,
                    topPlayers[i],
                    game.betAmount
                );
            } else if (i == 0) {
                ITreasury(treasury).distributeBullseye(
                    ((game.betAmount * game.players.length) * 2500) / 10000,
                    topPlayers[i],
                    game.betAmount
                );
            } else if (topPlayers[i] != address(0) && i == 1) {
                ITreasury(treasury).distributeBullseye(
                    ((game.betAmount * game.players.length) * 1500) / 10000,
                    topPlayers[i],
                    game.betAmount
                );
            } else if (topPlayers[i] != address(0) && i == 2) {
                ITreasury(treasury).distributeBullseye(
                    ((game.betAmount * game.players.length) * 1000) / 10000,
                    topPlayers[i],
                    game.betAmount
                );
            }
            //нужен подсчет сколько фи осталось нам после игры
        }
        delete game;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
