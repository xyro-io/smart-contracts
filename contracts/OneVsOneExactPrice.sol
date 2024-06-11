// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IMockUpkeep} from "./interfaces/IMockUpkeep.sol";

contract OneVsOneExactPrice is AccessControl {
    event ExactPriceCreated(
        bytes32 gameId,
        bytes32 feedId,
        address opponent,
        uint256 startTime,
        uint48 endTime,
        int192 initiatorPrice,
        uint256 depositAmount,
        address initiator
    );
    event ExactPriceAccepted(
        bytes32 gameId,
        address opponent,
        int192 opponentPrice
    );
    event ExactPriceRefused(bytes32 gameId);
    event ExactPriceCancelled(bytes32 gameId);
    event ExactPriceFinalized(
        bytes32 gameId,
        int192 winnerGuessPrice,
        int192 loserGuessPrice,
        int192 finalAssetPrice,
        Status gameStatus
    );

    enum Status {
        Created,
        Cancelled,
        Started,
        Finished,
        Refused
    }

    struct GameInfo {
        bytes32 feedId;
        address initiator;
        uint256 startTime;
        uint48 endTime;
        address opponent;
        uint256 depositAmount;
        int192 initiatorPrice;
        int192 opponentPrice;
        int192 finalAssetPrice;
        Status gameStatus;
    }

    mapping(bytes32 => GameInfo) public games;
    address public treasury;
    uint256 public fee = 100;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 4 weeks;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates 1vs1 exact price mode game
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     */
    function createGame(
        bytes32 feedId,
        address opponent,
        uint48 endTime,
        int192 initiatorPrice,
        uint256 depositAmount
    ) public {
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        require(depositAmount >= 1e19, "Wrong deposit amount");
        GameInfo memory newGame;
        newGame.initiator = msg.sender;
        newGame.startTime = block.timestamp;
        newGame.endTime = endTime;
        newGame.feedId = feedId;
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        newGame.initiatorPrice = initiatorPrice;
        newGame.depositAmount = depositAmount;
        newGame.opponent = opponent;
        newGame.gameStatus = Status.Created;
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        games[gameId] = newGame;
        emit ExactPriceCreated(
            gameId,
            feedId,
            opponent,
            block.timestamp,
            endTime,
            initiatorPrice,
            depositAmount,
            msg.sender
        );
    }

    /**
     * Creates 1vs1 exact price mode game
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     */
    function createGameWithPermit(
        bytes32 feedId,
        address opponent,
        uint48 endTime,
        int192 initiatorPrice,
        uint256 depositAmount,
        ITreasury.PermitData calldata permitData
    ) public {
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        require(depositAmount >= 1e19, "Wrong deposit amount");
        GameInfo memory newGame;
        newGame.initiator = msg.sender;
        newGame.startTime = block.timestamp;
        newGame.endTime = endTime;
        newGame.feedId = feedId;
        ITreasury(treasury).depositWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        newGame.initiatorPrice = initiatorPrice;
        newGame.depositAmount = depositAmount;
        newGame.opponent = opponent;
        newGame.gameStatus = Status.Created;
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        games[gameId] = newGame;
        emit ExactPriceCreated(
            gameId,
            feedId,
            opponent,
            block.timestamp,
            endTime,
            initiatorPrice,
            depositAmount,
            msg.sender
        );
    }

    /**
     * Accepts 1vs1 exact price mode game
     * @param gameId game id
     * @param opponentPrice picked asset price
     */
    function acceptGame(bytes32 gameId, int192 opponentPrice) public {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(game.initiatorPrice != opponentPrice, "Same asset prices");
        // If game is not private address should be 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
            if (opponentPrice == 0) {
                game.gameStatus = Status.Refused;
                games[gameId] = game;
                return;
            }
        } else {
            game.opponent == msg.sender;
        }
        game.opponentPrice = opponentPrice;
        ITreasury(treasury).deposit(game.depositAmount, msg.sender);
        game.gameStatus = Status.Started;
        games[gameId] = game;
        emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    }

    /**
     * Accepts 1vs1 exact price mode game
     * @param gameId game id
     * @param opponentPrice picked asset price
     */
    function acceptGameWithPermit(
        bytes32 gameId,
        int192 opponentPrice,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(game.initiatorPrice != opponentPrice, "Same asset prices");
        // If game is not private address should be 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
            if (opponentPrice == 0) {
                game.gameStatus = Status.Refused;
                games[gameId] = game;
                return;
            }
        } else {
            game.opponent == msg.sender;
        }
        game.opponentPrice = opponentPrice;
        ITreasury(treasury).depositWithPermit(
            game.depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        game.gameStatus = Status.Started;
        games[gameId] = game;
        emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    }

    /**
     * Closes game and refunds tokens
     * @param gameId game id
     */
    function closeGame(bytes32 gameId) public {
        GameInfo memory game = games[gameId];
        require(game.initiator == msg.sender, "Wrong sender");
        require(game.gameStatus == Status.Created, "Wrong status!");
        ITreasury(treasury).refund(game.depositAmount, game.initiator);
        game.gameStatus = Status.Cancelled;
        games[gameId] = game;
        emit ExactPriceCancelled(gameId);
    }

    /**
     * Changes game status if opponent refuses to play
     * @param gameId game id
     */
    function refuseGame(bytes32 gameId) public {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == game.opponent, "Only opponent can refuse");
        game.gameStatus = Status.Refused;
        games[gameId] = game;
        emit ExactPriceRefused(gameId);
    }

    /**
     * Finalizes 1vs1 exact price mode game and distributes rewards to players
     * @param gameId game id
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes32 gameId,
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        address upkeep = ITreasury(treasury).upkeep();
        GameInfo memory game = games[gameId];
        int192 finalAssetPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        int192 diff1 = game.initiatorPrice > finalAssetPrice
            ? game.initiatorPrice - finalAssetPrice
            : finalAssetPrice - game.initiatorPrice;
        int192 diff2 = game.opponentPrice > finalAssetPrice
            ? game.opponentPrice - finalAssetPrice
            : finalAssetPrice - game.opponentPrice;

        if (diff1 < diff2) {
            ITreasury(treasury).distribute(
                game.depositAmount * 2,
                game.initiator,
                game.depositAmount,
                fee
            );
            emit ExactPriceFinalized(
                gameId,
                game.initiatorPrice,
                game.opponentPrice,
                finalAssetPrice,
                Status.Finished
            );
        } else {
            ITreasury(treasury).distribute(
                game.depositAmount * 2,
                game.opponent,
                game.depositAmount,
                fee
            );
            emit ExactPriceFinalized(
                gameId,
                game.opponentPrice,
                game.initiatorPrice,
                finalAssetPrice,
                Status.Finished
            );
        }
        game.finalAssetPrice = finalAssetPrice;
        game.gameStatus = Status.Finished;
        games[gameId] = game;
    }

    /**
     * Changes min and max game limits
     * @param newMaxDuration new max game duration
     * @param newMinDuration new min game duration
     */
    function changeGameDuration(
        uint256 newMaxDuration,
        uint256 newMinDuration
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minDuration = newMinDuration;
        maxDuration = newMaxDuration;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(
        address newTreasury
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = newTreasury;
    }
}
