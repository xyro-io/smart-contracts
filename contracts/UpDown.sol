// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UpDownGame is Ownable {
    event UpDownStart(
        uint48 startTime,
        uint48 endTime,
        uint256 betAmount,
        int192 startingPrice,
        uint256 indexed gameId
    );
    event UpDownBet(address player, bool willGoUp, uint256 betAmount, uint256 indexed gameId);
    event UpDownFinalized(int192 finalPrice, uint256 wonAmount, uint256 indexed gameId);

    struct BetInfo {
        uint48 startTime;
        uint48 endTime;
        int192 startingPrice;
        uint256 betAmount;
        bytes32 feedId;
    }

    address[] public UpPlayers;
    address[] public DownPlayers;
    BetInfo public game;
    address public treasury;
    uint256 public fee = 100;
    uint256 public gameId;

    constructor() Ownable(msg.sender) {}

    /**
     * Creates up/down game
     * @param startTime when the game will start
     * @param endTime when the game will end
     * @param betAmount amount to enter the game
     * @param unverifiedReport Chainlink DataStreams report
     */
    function startGame(
        uint48 startTime,
        uint48 endTime,
        uint256 betAmount,
        bytes memory unverifiedReport,
        bytes32 feedId
    ) public onlyOwner {
        address upkeep = ITreasury(treasury).upkeep();
        game.startingPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            feedId
        );
        game.feedId = feedId;
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        emit UpDownStart(startTime, endTime, betAmount, game.startingPrice, gameId);
    }

    /**
     * Take a participation in up/down game
     * @param willGoUp up = true, down = false
     */
    function bet(bool willGoUp) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for bets"
        );
        require(!betExists(msg.sender), "Bet exists");
        if (willGoUp) {
            UpPlayers.push(msg.sender);
        } else {
            DownPlayers.push(msg.sender);
        }
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        emit UpDownBet(msg.sender, willGoUp, game.betAmount, gameId);
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(bytes memory unverifiedReport) public onlyOwner {
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
        BetInfo memory _game = game;
        require(
            UpPlayers.length > 0 && DownPlayers.length > 0,
            "Can't end"
        );
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (finalPrice > _game.startingPrice) {
            uint256 wonAmount = _game.betAmount +
                ((_game.betAmount * DownPlayers.length) /
                    UpPlayers.length);
            for (uint i = 0; i < UpPlayers.length; i++) {
                ITreasury(treasury).distribute(
                    wonAmount,
                    UpPlayers[i],
                    _game.betAmount,
                    fee
                );
            }
            emit UpDownFinalized(finalPrice, wonAmount, gameId);
        } else {
            uint256 wonAmount = _game.betAmount +
                ((_game.betAmount * UpPlayers.length) /
                    DownPlayers.length);
            for (uint i = 0; i < DownPlayers.length; i++) {
                ITreasury(treasury).distribute(
                    wonAmount,
                    DownPlayers[i],
                    _game.betAmount,
                    fee
                );
            }
            emit UpDownFinalized(finalPrice, wonAmount, gameId);
        }

        delete DownPlayers;
        delete UpPlayers;
        delete game;
        gameId++;
    }

    function getTotalPlayers() public view returns(uint256, uint256) {
        return (UpPlayers.length, DownPlayers.length);
    }

    /**
     * Check if player is participating in the game
     * @param player player address
     */
    function betExists(address player) internal view returns (bool) {
        for (uint i = 0; i < UpPlayers.length; i++) {
            if (UpPlayers[i] == player) {
                return true;
            }
        }
        for (uint i = 0; i < DownPlayers.length; i++) {
            if (DownPlayers[i] == player) {
                return true;
            }
        }
        return false;
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
