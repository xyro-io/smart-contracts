// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifierOptimized} from "./interfaces/IDataStreamsVerifierOptimized.sol";

contract OneVsOneExactPrice2 is AccessControl {
    event ExactPriceCreated(
        bytes32 gameId,
        uint8 feedId,
        address opponent,
        uint32 startTime,
        uint32 endTime,
        address initiator,
        uint32 initiatorPrice,
        uint32 depositAmount
    );
    event ExactPriceAccepted(
        bytes32 gameId,
        address opponent,
        uint32 opponentPrice
    );
    event ExactPriceRefused(bytes32 gameId);
    event ExactPriceCancelled(bytes32 gameId);
    event ExactPriceFinalized(
        bytes32 gameId,
        uint256 winnerGuessPrice,
        uint256 loserGuessPrice,
        int192 finalPrice,
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
        uint8 feedId;
        address initiator;
        uint256 startTime;
        uint256 endTime;
        address opponent;
        uint256 depositAmount;
        uint256 initiatorPrice;
        uint256 opponentPrice;
        uint256 finalPrice;
        Status gameStatus;
    }

    struct GameInfoPakced {
        uint256 packedData;
        uint256 packedData2;
    }

    mapping(bytes32 => GameInfoPakced) public games;
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
        uint8 feedId,
        address opponent,
        uint32 endTime,
        uint24 initiatorPrice,
        uint24 depositAmount
    ) public {
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        require(depositAmount >= 10, "Wrong deposit amount");

        ITreasury(treasury).deposit(uint256(depositAmount) * 1e18, msg.sender);
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData |= uint256(initiatorPrice) << 192;
        packedData |= uint256(feedId) << 216;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(depositAmount) << 192;
        packedData2 |= uint256(Status.Created) << 216;
        games[gameId].packedData = packedData;
        games[gameId].packedData2 = packedData2;
        emit ExactPriceCreated(
            gameId,
            feedId,
            opponent,
            uint32(block.timestamp),
            endTime,
            msg.sender,
            initiatorPrice,
            depositAmount
        );
    }

    function decodeData(
        bytes32 gameId
    ) public view returns (GameInfo memory gameData) {
        uint256 packedData = games[gameId].packedData;
        uint256 packedData2 = games[gameId].packedData2;
        gameData.opponent = address(uint160(packedData));
        gameData.endTime = uint256(uint32(packedData >> 160));
        gameData.initiatorPrice = uint256(uint24(packedData >> 192));
        gameData.feedId = uint8(packedData >> 216);
        gameData.opponentPrice = uint256(uint32(packedData >> 224));

        gameData.initiator = address(uint160(packedData2));
        gameData.startTime = uint256(uint32(packedData2 >> 160));
        gameData.depositAmount = uint256(uint24(packedData2 >> 192));
        gameData.gameStatus = Status(uint8(packedData2 >> 216));
        gameData.finalPrice = uint256(uint32(packedData2 >> 224));
    }

    /**
     * Creates 1vs1 exact price mode game
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     */
    // function createGameWithPermit(
    //     bytes32 feedId,
    //     address opponent,
    //     uint48 endTime,
    //     int192 initiatorPrice,
    //     uint256 depositAmount,
    //     ITreasury.PermitData calldata permitData
    // ) public {
    //     require(
    //         endTime - block.timestamp >= minDuration,
    //         "Min game duration must be higher"
    //     );
    //     require(
    //         endTime - block.timestamp <= maxDuration,
    //         "Max game duration must be lower"
    //     );
    //     require(depositAmount >= 1e19, "Wrong deposit amount");
    //     GameInfo memory newGame;
    //     newGame.initiator = msg.sender;
    //     newGame.startTime = block.timestamp;
    //     newGame.endTime = endTime;
    //     newGame.feedId = feedId;
    //     ITreasury(treasury).depositWithPermit(
    //         depositAmount,
    //         msg.sender,
    //         permitData.deadline,
    //         permitData.v,
    //         permitData.r,
    //         permitData.s
    //     );
    //     newGame.initiatorPrice = initiatorPrice;
    //     newGame.depositAmount = depositAmount;
    //     newGame.opponent = opponent;
    //     newGame.gameStatus = Status.Created;
    //     bytes32 gameId = keccak256(
    //         abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
    //     );
    //     games[gameId] = newGame;
    //     emit ExactPriceCreated(
    //         gameId,
    //         feedId,
    //         opponent,
    //         block.timestamp,
    //         endTime,
    //         initiatorPrice,
    //         depositAmount,
    //         msg.sender
    //     );
    // }

    /**
     * Accepts 1vs1 exact price mode game
     * @param gameId game id
     * @param opponentPrice picked asset price
     */
    function acceptGame(bytes32 gameId, uint32 opponentPrice) public {
        GameInfo memory game = decodeData(gameId);
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
                games[gameId].packedData2 |=
                    uint256(uint8(Status.Refused)) <<
                    216;
                return;
            }
        } else {
            require(msg.sender != game.initiator, "Wrong opponent");
            //???? rewrite?
            games[gameId].packedData = uint(uint160(msg.sender));
        }
        games[gameId].packedData |= uint256(opponentPrice) << 224;
        ITreasury(treasury).deposit(game.depositAmount * 1e18, msg.sender);
        games[gameId].packedData2 |= uint256(uint8(Status.Started)) << 216;
        emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    }

    // /**
    //  * Accepts 1vs1 exact price mode game
    //  * @param gameId game id
    //  * @param opponentPrice picked asset price
    //  */
    // function acceptGameWithPermit(
    //     bytes32 gameId,
    //     int192 opponentPrice,
    //     ITreasury.PermitData calldata permitData
    // ) public {
    //     GameInfo memory game = games[gameId];
    //     require(game.gameStatus == Status.Created, "Wrong status!");
    //     require(
    //         game.startTime + (game.endTime - game.startTime) / 3 >=
    //             block.timestamp,
    //         "Game is closed for new players"
    //     );
    //     require(game.initiatorPrice != opponentPrice, "Same asset prices");
    //     // If game is not private address should be 0
    //     if (game.opponent != address(0)) {
    //         require(
    //             msg.sender == game.opponent,
    //             "Only certain account can accept"
    //         );
    //         if (opponentPrice == 0) {
    //             game.gameStatus = Status.Refused;
    //             games[gameId] = game;
    //             return;
    //         }
    //     } else {
    //         require(msg.sender != game.initiator, "Wrong opponent");
    //         game.opponent = msg.sender;
    //     }
    //     game.opponentPrice = opponentPrice;
    //     ITreasury(treasury).depositWithPermit(
    //         game.depositAmount,
    //         msg.sender,
    //         permitData.deadline,
    //         permitData.v,
    //         permitData.r,
    //         permitData.s
    //     );
    //     game.gameStatus = Status.Started;
    //     games[gameId] = game;
    //     emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    // }

    // /**
    //  * Closes game and refunds tokens
    //  * @param gameId game id
    //  */
    // function closeGame(bytes32 gameId) public {
    //     GameInfo memory game = games[gameId];
    //     require(game.initiator == msg.sender, "Wrong sender");
    //     require(game.gameStatus == Status.Created, "Wrong status!");
    //     ITreasury(treasury).refund(game.depositAmount, game.initiator);
    //     game.gameStatus = Status.Cancelled;
    //     games[gameId] = game;
    //     emit ExactPriceCancelled(gameId);
    // }

    // /**
    //  * Changes game status if opponent refuses to play
    //  * @param gameId game id
    //  */
    // function refuseGame(bytes32 gameId) public {
    //     GameInfo memory game = games[gameId];
    //     require(game.gameStatus == Status.Created, "Wrong status!");
    //     require(msg.sender == game.opponent, "Only opponent can refuse");
    //     game.gameStatus = Status.Refused;
    //     games[gameId] = game;
    //     emit ExactPriceRefused(gameId);
    // }

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
        GameInfo memory game = decodeData(gameId);
        (
            int192 finalPrice,
            uint32 priceTimestamp
        ) = IDataStreamsVerifierOptimized(upkeep).verifyReportWithTimestamp(
                unverifiedReport,
                game.feedId
            );
        //block.timestamp must be > priceTimestamp
        require(
            priceTimestamp - game.endTime <= 10 minutes ||
                block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        uint256 diff1 = game.initiatorPrice > uint192(finalPrice)
            ? game.initiatorPrice - uint192(finalPrice)
            : uint192(finalPrice) - game.initiatorPrice;
        uint256 diff2 = game.opponentPrice > uint192(finalPrice)
            ? game.opponentPrice - uint192(finalPrice)
            : uint192(finalPrice) - game.opponentPrice;

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
                finalPrice,
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
                finalPrice,
                Status.Finished
            );
        }
        games[gameId].packedData2 |= uint256(uint8(Status.Finished)) << 216;
        games[gameId].packedData2 |=
            uint256(uint32(uint192(finalPrice / 1e18))) <<
            224;
        // uint32 test = uint32(uint192(finalPrice));
        // game.finalPrice = finalPrice;
        // game.gameStatus = Status.Finished;
        // games[gameId] = game;
    }

    // /**
    //  * Changes min and max game limits
    //  * @param newMaxDuration new max game duration
    //  * @param newMinDuration new min game duration
    //  */
    // function changeGameDuration(
    //     uint256 newMaxDuration,
    //     uint256 newMinDuration
    // ) public onlyRole(DEFAULT_ADMIN_ROLE) {
    //     minDuration = newMinDuration;
    //     maxDuration = newMaxDuration;
    // }

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
