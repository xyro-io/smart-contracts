// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapFactory.sol";
import "../interfaces/IERC20.sol";

contract BullseyeGameUni is Ownable {
    event BullseyeBet(address player, uint256 assetPrice, uint256 betAmount);
    event BullseyeEnd(address[3] topPlayers, uint256[3] wonAmount);

    struct BetInfo {
        address token0;
        address token1;
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
        uint256 betAmount,
        address token0,
        address token1
    ) public onlyOwner {
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        game.token0 = token0;
        game.token1 = token1;
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
        emit BullseyeBet(msg.sender, assetPrice, game.betAmount);
    }

    //only owner
    function endGame(address uniFactory) public onlyOwner {
        require(game.players.length > 0, "Can't end");
        require(block.timestamp >= game.endTime, "Too early to finish");
        uint256 finalPrice = getTokenPrice(
            game.token0,
            game.token1,
            uniFactory
        );
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
        uint256[3] memory wonAmount = [
            closestDiff[0] == 0
                ? (totalBets * 5000) / 10000
                : (totalBets * 2500) / 10000,
            (totalBets * 1500) / 10000,
            (totalBets * 1000) / 10000
        ];
        for (uint256 i = 0; i < 3; i++) {
            if (topPlayers[i] != address(0)) {
                ITreasury(treasury).distributeBullseye(
                    wonAmount[i],
                    topPlayers[i],
                    game.betAmount
                );
                totalBets -= wonAmount[i];
            }
        }
        ITreasury(treasury).increaseFee(totalBets);

        emit BullseyeEnd(topPlayers, wonAmount);
        delete game;
    }

    function getTokenPrice(
        address token0,
        address token1,
        address uniFactory
    ) public view returns (uint256 finalPrice) {
        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapFactory(uniFactory).getPair(token0, token1)
        );
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        if (token0 == pair.token1()) {
            uint256 amount = reserve0 *
                (10 ** IERC20(pair.token1()).decimals());
            finalPrice = amount / reserve1;
            return finalPrice; // return amount of token0 needed to buy token1
        } else if (token0 == pair.token0()) {
            uint256 amount = reserve1 *
                (10 ** IERC20(pair.token0()).decimals());
            finalPrice = amount / reserve1;
            return finalPrice; // return amount of token1 needed to buy token0
        }
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
