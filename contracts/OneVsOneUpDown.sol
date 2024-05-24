// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from  "./interfaces/ITreasury.sol";
import {IMockUpkeep} from  "./interfaces/IMockUpkeep.sol";

contract OneVsOneUpDown is AccessControl {
    event UpDownCreated(
        uint256 gameId,
        address opponent,
        uint256 startTime,
        uint48 endTime,
        bool isLong,
        uint256 depositAmount,
        address initiator
    );
    event UpDownAccepted(
        uint256 gameId,
        address opponent,
        bool isLong,
        uint256 depositAmount
    );
    event UpDownRefused(uint256 gameId);
    event UpDownCancelled(
        uint256 gameId,
        address initiator,
        uint256 depositAmount,
        uint256 startTime,
        uint48 endTime,
        Status gameStatus
    );
    event UpDownFinalized(
        uint256 gameId,
        address winner,
        bool isLong,
        address loser,
        uint256 depositAmount,
        int192 startingAssetPrice,
        int192 finalAssetPrice,
        uint256 startTime,
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
    struct GameInfo {
        bytes32 feedId;
        address initiator;
        uint256 startTime;
        uint48 endTime;
        address opponent;
        bool isLong; //Initiator choise
        uint256 depositAmount;
        int192 startingAssetPrice;
        int192 finalAssetPrice;
        Status gameStatus;
    }

    GameInfo[] public games;
    address public treasury;
    uint256 public fee = 100;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 4 weeks;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /** Creates 1vs1 up/down mode game
    //@param opponent address of the opponent
    //@param endTime when the game will end
    //@param isLong up = true, down = false
    //@param depositAmount amount to enter the game
    //@param unverifiedReport Chainlink DataStreams report
    */
    function createGame(
        address opponent,
        uint48 endTime,
        bool isLong,
        uint256 depositAmount,
        bytes memory unverifiedReport,
        bytes32 feedId
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
        address upkeep = ITreasury(treasury).upkeep();
        newGame.startingAssetPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            feedId
        );
        newGame.feedId = feedId;
        newGame.initiator = msg.sender;
        newGame.startTime = block.timestamp;
        newGame.endTime = endTime;
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        newGame.depositAmount = depositAmount;
        newGame.opponent = opponent;
        newGame.isLong = isLong;
        newGame.gameStatus = Status.Created;
        games.push(newGame);
        emit UpDownCreated(
            games.length - 1,
            opponent,
            block.timestamp,
            endTime,
            isLong,
            depositAmount,
            msg.sender
        );
    }

    /** Creates 1vs1 up/down mode game
    //@param opponent address of the opponent
    //@param endTime when the game will end
    //@param isLong up = true, down = false
    //@param depositAmount amount to enter the game
    //@param unverifiedReport Chainlink DataStreams report
    */
    function createGameWithPermit(
        address opponent,
        uint48 endTime,
        bool isLong,
        uint256 depositAmount,
        bytes memory unverifiedReport,
        bytes32 feedId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
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
        address upkeep = ITreasury(treasury).upkeep();
        newGame.startingAssetPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            feedId
        );
        newGame.feedId = feedId;
        newGame.initiator = msg.sender;
        newGame.startTime = block.timestamp;
        newGame.endTime = endTime;
        ITreasury(treasury).depositWithPermit(depositAmount, msg.sender, deadline, v, r, s);
        newGame.depositAmount = depositAmount;
        newGame.opponent = opponent;
        newGame.isLong = isLong;
        newGame.gameStatus = Status.Created;
        games.push(newGame);
        emit UpDownCreated(
            games.length - 1,
            opponent,
            block.timestamp,
            endTime,
            isLong,
            depositAmount,
            msg.sender
        );
    }

    /**
     * Accepts 1vs1 up/down mode game
     * @param gameId game id
     */
    function acceptGame(uint256 gameId) public {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        //If game is not private address should be 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
        } else {
            game.opponent == msg.sender;
        }
        ITreasury(treasury).deposit(game.depositAmount, msg.sender);
        game.gameStatus = Status.Started;
        games[gameId] = game;
        emit UpDownAccepted(gameId, msg.sender, !game.isLong, game.depositAmount);
    }

    /**
     * Accepts 1vs1 up/down mode game with permit
     * @param gameId game id
     */
    function acceptGameWithPermit(
        uint256 gameId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        //If game is not private address should be 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
        } else {
            game.opponent == msg.sender;
        }
        ITreasury(treasury).depositWithPermit(game.depositAmount, msg.sender, deadline, v, r, s);
        game.gameStatus = Status.Started;
        games[gameId] = game;
        emit UpDownAccepted(gameId, msg.sender, !game.isLong, game.depositAmount);
    }

    /**
     * Changes game status if opponent refuses to play
     * @param gameId game id
     */
    function refuseGame(uint256 gameId) public {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == game.opponent, "Only opponent can refuse");
        game.gameStatus = Status.Refused;
        games[gameId] = game;
        emit UpDownRefused(gameId);
    }

    /**
     * Closes game and refunds tokens
     * @param gameId game id
     */
    function closeGame(uint256 gameId) public {
        GameInfo memory game = games[gameId];
        require(game.initiator == msg.sender, "Wrong sender");
        require(
            game.gameStatus == Status.Refused ||
                (game.startTime + (game.endTime - game.startTime) / 3 <
                    block.timestamp &&
                    game.gameStatus == Status.Created),
            "Wrong status!"
        );
        ITreasury(treasury).refund(game.depositAmount, game.initiator);
        games[gameId].gameStatus = Status.Cancelled;
        games[gameId] = game;
        emit UpDownCancelled(
            gameId,
            msg.sender,
            game.depositAmount,
            game.startTime,
            game.endTime,
            Status.Cancelled
        );
    }

    /**
     * Finalizes 1vs1 up/down mode game and distributes rewards to players
     * @param gameId game id
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        uint256 gameId,
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory game = games[gameId];
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
        if (
            game.isLong
                ? game.startingAssetPrice < finalPrice
                : game.startingAssetPrice > finalPrice
        ) {
            ITreasury(treasury).distribute(
                game.depositAmount,
                game.initiator,
                game.depositAmount,
                fee
            );
            emit UpDownFinalized(
                gameId,
                game.initiator,
                game.isLong,
                game.opponent,
                game.depositAmount,
                game.startingAssetPrice,
                finalPrice,
                game.startTime,
                game.endTime,
                Status.Finished
            );
        } else {
            ITreasury(treasury).distribute(
                game.depositAmount,
                game.opponent,
                game.depositAmount,
                fee
            );
            emit UpDownFinalized(
                gameId,
                game.opponent,
                !game.isLong,
                game.initiator,
                game.depositAmount,
                game.startingAssetPrice,
                finalPrice,
                game.startTime,
                game.endTime,
                Status.Finished
            );
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
        games[gameId] = game;
    }

    /**
     * onlyDao
     * Changes min and max game limits
     * @param newMaxDuration new max game duration
     * @param newMinDuration new min game duration
     */
    function changeGameDuration(
        uint256 newMaxDuration,
        uint256 newMinDuration
    ) public {
        minDuration = newMinDuration;
        maxDuration = newMaxDuration;
    }

    //Returns amount of all games
    function totalGames() public view returns (uint256) {
        return games.length;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(address newTreasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = newTreasury;
    }
}
