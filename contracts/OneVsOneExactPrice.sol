// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract OneVsOneExactPrice is AccessControl {
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event ExactPriceCreated(
        bytes32 gameId,
        uint8 feedNumber,
        address opponent,
        uint32 startTime,
        uint32 endTime,
        address initiator,
        uint256 initiatorPrice,
        uint256 depositAmount,
        address gameToken
    );
    event ExactPriceAccepted(
        bytes32 gameId,
        address opponent,
        uint256 opponentPrice
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
        Status gameStatus;
    }

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
        uint256 depositAmount;
        uint256 initiatorPrice;
        uint256 opponentPrice;
        int192 finalPrice;
    }

    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    mapping(bytes32 => GameInfoPacked) public games;
    address public treasury;
    uint256 public fee = 500;
    uint256 public refundFee = 1000;
    uint256 public minDuration = 280;
    uint256 public maxDuration = 4 weeks;
    bool public isActive = true;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates 1vs1 exact price mode game and deposit funds
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     * @param token token for game deposits
     */
    function createGame(
        uint8 feedNumber,
        address opponent,
        uint32 endTime,
        uint256 initiatorPrice,
        uint256 depositAmount,
        address token
    ) public {
        require(isActive, "Game is disabled");
        require(
            IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                feedNumber
            ) != bytes32(0),
            "Wrong feed number"
        );
        require(opponent != msg.sender, "Wrong opponent");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        ITreasury(treasury).setGameToken(gameId, token);
        ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            gameId,
            false
        );
        require(games[gameId].packedData == 0, "Game exists");
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        games[gameId].initiatorPrice = initiatorPrice;
        games[gameId].depositAmount = depositAmount;
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
            depositAmount,
            token
        );
    }

    /**
     * Creates 1vs1 exact price mode game with deposited funds
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     * @param token token for game deposits
     */
    function createGameWithDeposit(
        uint8 feedNumber,
        address opponent,
        uint32 endTime,
        uint256 initiatorPrice,
        uint256 depositAmount,
        address token
    ) public {
        require(isActive, "Game is disabled");
        require(
            IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                feedNumber
            ) != bytes32(0),
            "Wrong feed number"
        );
        require(opponent != msg.sender, "Wrong opponent");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        ITreasury(treasury).setGameToken(gameId, token);
        ITreasury(treasury).lock(depositAmount, msg.sender, gameId, false);
        require(games[gameId].packedData == 0, "Game exists");
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        games[gameId].initiatorPrice = initiatorPrice;
        games[gameId].depositAmount = depositAmount;
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
            depositAmount,
            token
        );
    }

    /**
     * Creates 1vs1 exact price mode game and deposit funds
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     * @param opponent address of the opponent
     * @param endTime when the game will end
     * @param initiatorPrice game initiator picked asset price
     * @param depositAmount amount to enter the game
     * @param token token for game deposits
     */
    function createGameWithPermit(
        uint8 feedNumber,
        address opponent,
        uint32 endTime,
        uint256 initiatorPrice,
        uint256 depositAmount,
        address token,
        ITreasury.PermitData calldata permitData
    ) public {
        require(isActive, "Game is disabled");
        require(
            IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                feedNumber
            ) != bytes32(0),
            "Wrong feed number"
        );
        require(opponent != msg.sender, "Wrong opponent");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );

        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        ITreasury(treasury).setGameToken(gameId, token);
        ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            gameId,
            false,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(endTime) << 160;
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        games[gameId].initiatorPrice = initiatorPrice;
        games[gameId].depositAmount = depositAmount;
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
            depositAmount,
            token
        );
    }

    /**
     * Accepts 1vs1 exact price mode game and deposit funds
     * @param gameId game id
     * @param opponentPrice picked asset price
     */
    function acceptGame(bytes32 gameId, uint256 opponentPrice) public {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(
            games[gameId].initiatorPrice != opponentPrice,
            "Same asset prices"
        );
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
        games[gameId].opponentPrice = opponentPrice;
        ITreasury(treasury).depositAndLock(
            games[gameId].depositAmount,
            msg.sender,
            gameId,
            false
        );
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
        uint256 opponentPrice
    ) public {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(
            games[gameId].initiatorPrice != opponentPrice,
            "Same asset prices"
        );
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
        games[gameId].opponentPrice = opponentPrice;
        ITreasury(treasury).lock(
            games[gameId].depositAmount,
            msg.sender,
            gameId,
            false
        );
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
        uint256 opponentPrice,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        require(
            games[gameId].initiatorPrice != opponentPrice,
            "Same asset prices"
        );
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
        games[gameId].opponentPrice = opponentPrice;
        ITreasury(treasury).depositAndLockWithPermit(
            games[gameId].depositAmount,
            msg.sender,
            gameId,
            false,
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
        require(
            game.gameStatus == Status.Created ||
                (
                    block.timestamp > game.endTime
                        ? block.timestamp - game.endTime >= 3 days
                        : false
                ),
            "Wrong status!"
        );
        ITreasury(treasury).refund(
            games[gameId].depositAmount,
            game.initiator,
            gameId
        );
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
        require(block.timestamp - game.endTime >= 3 days, "Too early");
        require(game.gameStatus == Status.Created, "Wrong status!");
        ITreasury(treasury).refundWithFees(
            games[gameId].depositAmount,
            game.initiator,
            refundFee,
            gameId
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
        GameInfo memory game = decodeData(gameId);
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        require(
            priceTimestamp - game.endTime <= 1 minutes,
            "Old chainlink report"
        );
        uint256 diff1 = games[gameId].initiatorPrice > uint192(finalPrice)
            ? games[gameId].initiatorPrice - uint192(finalPrice)
            : uint192(finalPrice) - games[gameId].initiatorPrice;
        uint256 diff2 = games[gameId].opponentPrice > uint192(finalPrice)
            ? games[gameId].opponentPrice - uint192(finalPrice)
            : uint192(finalPrice) - games[gameId].opponentPrice;
        uint256 finalRate;
        if (diff1 != diff2) {
            ITreasury(treasury).withdrawGameFee(
                games[gameId].depositAmount,
                fee,
                gameId
            );
            finalRate = ITreasury(treasury).calculateRate(
                games[gameId].depositAmount,
                0,
                gameId
            );
        }
        if (diff1 < diff2) {
            ITreasury(treasury).universalDistribute(
                game.initiator,
                games[gameId].depositAmount,
                gameId,
                finalRate
            );
            ITreasury(treasury).setGameFinished(gameId);
            emit ExactPriceFinalized(
                gameId,
                games[gameId].initiatorPrice,
                games[gameId].opponentPrice,
                finalPrice,
                Status.Finished
            );
        } else if (diff1 > diff2) {
            ITreasury(treasury).universalDistribute(
                game.opponent,
                games[gameId].depositAmount,
                gameId,
                finalRate
            );
            ITreasury(treasury).setGameFinished(gameId);
            emit ExactPriceFinalized(
                gameId,
                games[gameId].opponentPrice,
                games[gameId].initiatorPrice,
                finalPrice,
                Status.Finished
            );
        } else {
            ITreasury(treasury).refund(
                games[gameId].depositAmount,
                game.initiator,
                gameId
            );
            ITreasury(treasury).refund(
                games[gameId].depositAmount,
                game.opponent,
                gameId
            );
            emit ExactPriceCancelled(gameId);
        }
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Finished)) << 208);
        games[gameId].finalPrice = finalPrice;
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

        gameData.initiator = address(uint160(packedData2));
        gameData.startTime = uint256(uint32(packedData2 >> 160));
        gameData.gameStatus = Status(uint8(packedData2 >> 208));
        gameData.feedNumber = uint8(packedData2 >> 216);
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
        require(newFee <= 3000, "Fee exceeds the cap");
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

    /**
     * Turns game on/off
     */
    function toggleActive() public onlyRole(DEFAULT_ADMIN_ROLE) {
        isActive = !isActive;
    }
}
