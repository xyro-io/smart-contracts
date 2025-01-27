// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IOldTreasury} from "./IOldTreasury.sol";
import {IDataStreamsVerifier} from "../interfaces/IDataStreamsVerifier.sol";

contract OldOneVsOne is AccessControl {
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event ExactPriceCreated(
        bytes32 gameId,
        uint8 feedNumber,
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
    event ExactPriceCancelled(bytes32 gameId);
    event ExactPriceFinalized(
        bytes32 gameId,
        uint256 winnerGuessPrice,
        uint256 loserGuessPrice,
        int192 finalPrice,
        Status gameStatus
    );

    enum Status {
        Default,
        Created,
        Cancelled,
        Started,
        Finished
    }

    struct GameInfo {
        uint8 feedNumber;
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

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
    }

    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    mapping(bytes32 => GameInfoPacked) public games;
    address public treasury;
    uint256 public fee = 500;
    uint256 public refundFee = 1000;
    uint256 public minDuration = 280;
    uint256 public maxDuration = 4 weeks;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates 1vs1 exact price mode game and deposit funds
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     */
    function createGame(
        uint8 feedNumber,
        address opponent,
        uint32 endTime,
        uint32 initiatorPrice,
        uint16 depositAmount
    ) public {
        require(opponent != msg.sender, "Wrong opponent");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );

        IOldTreasury(treasury).depositAndLock(depositAmount, msg.sender);
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        require(games[gameId].packedData == 0, "Game exists");
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData |= uint256(initiatorPrice) << 192;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(depositAmount) << 192;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        games[gameId].packedData = packedData;
        games[gameId].packedData2 = packedData2;
        emit ExactPriceCreated(
            gameId,
            feedNumber,
            opponent,
            uint32(block.timestamp),
            endTime,
            msg.sender,
            initiatorPrice,
            depositAmount
        );
    }

    /**
     * Creates 1vs1 exact price mode game with deposited funds
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     */
    function createGameWithDeposit(
        uint8 feedNumber,
        address opponent,
        uint32 endTime,
        uint32 initiatorPrice,
        uint16 depositAmount
    ) public {
        require(opponent != msg.sender, "Wrong opponent");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );

        IOldTreasury(treasury).lock(depositAmount, msg.sender);
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        require(games[gameId].packedData == 0, "Game exists");
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData |= uint256(initiatorPrice) << 192;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(depositAmount) << 192;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        games[gameId].packedData = packedData;
        games[gameId].packedData2 = packedData2;
        emit ExactPriceCreated(
            gameId,
            feedNumber,
            opponent,
            uint32(block.timestamp),
            endTime,
            msg.sender,
            initiatorPrice,
            depositAmount
        );
    }

    /**
     * Creates 1vs1 exact price mode game and deposit funds
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     */
    function createGameWithPermit(
        uint8 feedNumber,
        address opponent,
        uint32 endTime,
        uint32 initiatorPrice,
        uint16 depositAmount,
        IOldTreasury.PermitData calldata permitData
    ) public {
        require(opponent != msg.sender, "Wrong opponent");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );

        IOldTreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData |= uint256(initiatorPrice) << 192;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(depositAmount) << 192;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        games[gameId].packedData = packedData;
        games[gameId].packedData2 = packedData2;
        emit ExactPriceCreated(
            gameId,
            feedNumber,
            opponent,
            uint32(block.timestamp),
            endTime,
            msg.sender,
            initiatorPrice,
            depositAmount
        );
    }

    /**
     * Accepts 1vs1 exact price mode game and deposit funds
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
        } else {
            require(msg.sender != game.initiator, "Wrong opponent");
            games[gameId].packedData |= uint256(uint160(msg.sender));
        }
        games[gameId].packedData |= uint256(opponentPrice) << 224;
        IOldTreasury(treasury).depositAndLock(game.depositAmount, msg.sender);
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Started)) << 208);
        emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    }

    /**
     * Accepts 1vs1 exact price mode game with deposited funds
     * @param gameId game id
     * @param opponentPrice picked asset price
     */
    function acceptGameWithDeposit(
        bytes32 gameId,
        uint32 opponentPrice
    ) public {
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
        } else {
            require(msg.sender != game.initiator, "Wrong opponent");
            games[gameId].packedData |= uint256(uint160(msg.sender));
        }
        games[gameId].packedData |= uint256(opponentPrice) << 224;
        IOldTreasury(treasury).lock(game.depositAmount, msg.sender);
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Started)) << 208);
        emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    }

    /**
     * Accepts 1vs1 exact price mode game and deposit funds
     * @param gameId game id
     * @param opponentPrice picked asset price
     */
    function acceptGameWithPermit(
        bytes32 gameId,
        uint32 opponentPrice,
        IOldTreasury.PermitData calldata permitData
    ) public {
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
        } else {
            require(msg.sender != game.initiator, "Wrong opponent");
            games[gameId].packedData |= uint256(uint160(msg.sender));
        }
        games[gameId].packedData |= uint256(opponentPrice) << 224;
        IOldTreasury(treasury).depositAndLockWithPermit(
            game.depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Started)) << 208);
        emit ExactPriceAccepted(gameId, msg.sender, opponentPrice);
    }

    /**
     * Closes game and refunds tokens
     * @param gameId game id
     */
    function closeGame(bytes32 gameId) public {
        GameInfo memory game = decodeData(gameId);
        require(game.initiator == msg.sender, "Wrong sender");
        require(game.gameStatus == Status.Created, "Wrong status!");
        IOldTreasury(treasury).refund(game.depositAmount, game.initiator);
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Cancelled)) << 208);
        emit ExactPriceCancelled(gameId);
    }

    /**
     * Allows admin to close old\outdated games
     * @param gameId game id
     */
    function liquidateGame(bytes32 gameId) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData(gameId);
        require(block.timestamp - game.endTime >= 1 weeks, "Too early");
        require(game.gameStatus == Status.Created, "Wrong status!");
        IOldTreasury(treasury).refundWithFees(
            game.depositAmount,
            game.initiator,
            refundFee
        );
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Cancelled)) << 208);
        emit ExactPriceCancelled(gameId);
    }

    /**
     * Finalizes 1vs1 exact price mode game and distributes rewards to players
     * @param gameId game id
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes32 gameId,
        bytes memory unverifiedReport
    ) public onlyRole(GAME_MASTER_ROLE) {
        address upkeep = IOldTreasury(treasury).upkeep();
        GameInfo memory game = decodeData(gameId);
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        require(
            priceTimestamp - game.endTime <= 1 minutes ||
                block.timestamp - priceTimestamp <= 1 minutes,
            "Old chainlink report"
        );
        uint256 diff1 = game.initiatorPrice > uint192(finalPrice) / 1e14
            ? game.initiatorPrice - uint192(finalPrice) / 1e14
            : uint192(finalPrice) / 1e14 - game.initiatorPrice;
        uint256 diff2 = game.opponentPrice > uint192(finalPrice) / 1e14
            ? game.opponentPrice - uint192(finalPrice) / 1e14
            : uint192(finalPrice) / 1e14 - game.opponentPrice;
        if (diff1 < diff2) {
            IOldTreasury(treasury).distribute(
                game.depositAmount * 2,
                game.initiator,
                fee
            );
            emit ExactPriceFinalized(
                gameId,
                game.initiatorPrice,
                game.opponentPrice,
                finalPrice,
                Status.Finished
            );
        } else if (diff1 > diff2) {
            IOldTreasury(treasury).distribute(
                game.depositAmount * 2,
                game.opponent,
                fee
            );
            emit ExactPriceFinalized(
                gameId,
                game.opponentPrice,
                game.initiatorPrice,
                finalPrice,
                Status.Finished
            );
        } else {
            IOldTreasury(treasury).refund(game.depositAmount, game.initiator);
            IOldTreasury(treasury).refund(game.depositAmount, game.opponent);
            emit ExactPriceCancelled(gameId);
        }
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Finished)) << 208);
        games[gameId].packedData2 |= uint256(uint192(finalPrice / 1e14)) << 224;
    }

    /**
     * Returns decoded game data
     * @param gameId game id
     */
    function decodeData(
        bytes32 gameId
    ) public view returns (GameInfo memory gameData) {
        uint256 packedData = games[gameId].packedData;
        uint256 packedData2 = games[gameId].packedData2;
        gameData.opponent = address(uint160(packedData));
        gameData.endTime = uint256(uint32(packedData >> 160));
        gameData.initiatorPrice = uint256(uint32(packedData >> 192));
        gameData.opponentPrice = uint256(uint32(packedData >> 224));

        gameData.initiator = address(uint160(packedData2));
        gameData.startTime = uint256(uint32(packedData2 >> 160));
        gameData.depositAmount = uint256(uint16(packedData2 >> 192));
        gameData.gameStatus = Status(uint8(packedData2 >> 208));
        gameData.feedNumber = uint8(packedData2 >> 216);
        gameData.finalPrice = uint256(uint32(packedData2 >> 224));
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
        require(newTreasury != address(0), "Zero address");
        treasury = newTreasury;
        emit NewTreasury(newTreasury);
    }

    /**
     * Change fee
     * @param newFee new fee in bp
     */
    function setFee(uint256 newFee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        fee = newFee;
        emit NewFee(newFee);
    }

    /**
     * Change refund fee
     * @param newRefundFee new fee in bp
     */
    function setRefundFee(
        uint256 newRefundFee
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        refundFee = newRefundFee;
    }
}
