//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UpDownGame is Ownable {
    event UpDownStart(uint48 startTime, uint48 endTime, uint256 betAmount);
    event UpDownBet(address player, bool willGoUp, uint256 betAmount);
    event UpDownFinalized(uint256 topPlayers, uint256 wonAmount);

    struct BetInfo {
        uint48 startTime;
        uint48 endTime;
        uint256 startingPrice;
        uint256 betAmount;
        address[] UpPlayers;
        address[] DownPlayers;
    }

    BetInfo public game;
    address public treasury;

    constructor() Ownable(msg.sender) {}

    function startGame(
        uint48 startTime,
        uint48 endTime,
        uint256 betAmount,
        uint256 startingPrice
    ) public onlyOwner {
        game.startingPrice = startingPrice;
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        emit UpDownStart(startTime, endTime, betAmount);
    }

    function bet(bool willGoUp) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(!betExists(msg.sender), "Bet exists");
        if (willGoUp) {
            game.UpPlayers.push(msg.sender);
        } else {
            game.DownPlayers.push(msg.sender);
        }
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        emit UpDownBet(msg.sender, willGoUp, game.betAmount);
    }

    function finalizeGame(uint256 finalPrice) public onlyOwner {
        BetInfo memory _game = game;
        require(
            game.UpPlayers.length > 0 && game.DownPlayers.length > 0,
            "Can't end"
        );
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (finalPrice > _game.startingPrice) {
            uint256 wonAmount = _game.betAmount +
                ((_game.betAmount * _game.DownPlayers.length) /
                    _game.UpPlayers.length);
            for (uint i = 0; i < _game.UpPlayers.length; i++) {
                ITreasury(treasury).distributeUpDown(
                    wonAmount,
                    _game.UpPlayers[i],
                    _game.betAmount
                );
            }
            emit UpDownFinalized(finalPrice, wonAmount);
        } else {
            uint256 wonAmount = _game.betAmount +
                ((_game.betAmount * _game.UpPlayers.length) /
                    _game.DownPlayers.length);
            for (uint i = 0; i < _game.DownPlayers.length; i++) {
                ITreasury(treasury).distributeUpDown(
                    wonAmount,
                    _game.DownPlayers[i],
                    _game.betAmount
                );
            }
            emit UpDownFinalized(finalPrice, wonAmount);
        }
        delete game;
    }

    function betExists(address player) internal view returns (bool) {
        for (uint i = 0; i < game.UpPlayers.length; i++) {
            if (game.UpPlayers[i] == player) {
                return true;
            }
        }
        for (uint i = 0; i < game.DownPlayers.length; i++) {
            if (game.DownPlayers[i] == player) {
                return true;
            }
        }
        return false;
    }

    function changeBetAmount(uint256 newBetAmount) public {
        game.betAmount = newBetAmount;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
