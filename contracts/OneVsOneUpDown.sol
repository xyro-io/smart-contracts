// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract OneVsOneUpDown is AccessControl {
    event UpDownCreated(CreateUpDown data);
    event UpDownAccepted(
        bytes32 gameId,
        address opponent,
        bool isLong,
        uint256 depositAmount
    );
    event UpDownRefused(bytes32 gameId);
    event UpDownCancelled(bytes32 gameId);
    event UpDownFinalized(
        bytes32 gameId,
        bool isLongWon,
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

    struct CreateUpDown {
        bytes32 gameId;
        uint8 feedId;
        address opponent;
        uint32 startTime;
        uint32 endTime;
        int192 startingAssetPrice;
        bool isLong;
        uint32 depositAmount;
        address initiator;
    }

    struct GameInfo {
        uint8 feedId;
        address initiator;
        uint256 startTime;
        uint256 endTime;
        address opponent;
        bool isLong; //Initiator choise
        uint256 depositAmount;
        uint256 startingAssetPrice;
        uint256 finalPrice;
        Status gameStatus;
    }

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
    }

    mapping(bytes32 => GameInfoPacked) public games;
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
        uint32 endTime,
        bool isLong,
        uint32 depositAmount,
        uint8 feedId,
        bytes memory unverifiedReport
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
        (
            int192 startingAssetPrice,
            uint32 priceTimestamp
        ) = IDataStreamsVerifier(ITreasury(treasury).upkeep())
                .verifyReportWithTimestamp(unverifiedReport, feedId);
        //block.timestamp must be > priceTimestamp
        require(
            block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(uint192(startingAssetPrice / 1e14)) << 160;
        packedData |= block.timestamp << 192;
        packedData |= uint256(endTime) << 224;
        packedData2 |= uint256(depositAmount) << 160;
        packedData2 |= uint256(feedId) << 192;
        packedData2 |= uint256(Status.Created) << 200;
        packedData2 |= isLong ? uint(1) << 208 : uint(0) << 208;
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        games[gameId] = GameInfoPacked(packedData, packedData2);
        emit UpDownCreated(
            CreateUpDown(
                gameId,
                feedId,
                opponent,
                uint32(block.timestamp),
                endTime,
                startingAssetPrice,
                isLong,
                depositAmount,
                msg.sender
            )
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
        uint32 endTime,
        bool isLong,
        uint32 depositAmount,
        uint8 feedId,
        bytes memory unverifiedReport,
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
        require(depositAmount >= 10, "Wrong deposit amount");
        (
            int192 startingAssetPrice,
            uint32 priceTimestamp
        ) = IDataStreamsVerifier(ITreasury(treasury).upkeep())
                .verifyReportWithTimestamp(unverifiedReport, feedId);
        //block.timestamp must be > priceTimestamp
        require(
            block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        ITreasury(treasury).depositWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        uint256 packedData = uint(uint160(opponent));
        uint256 packedData2 = uint(uint160(msg.sender));
        packedData |= uint256(uint192(startingAssetPrice / 1e14)) << 160;
        packedData |= block.timestamp << 192;
        packedData |= uint256(endTime) << 224;
        packedData2 |= uint256(depositAmount) << 160;
        packedData2 |= uint256(feedId) << 192;
        packedData2 |= uint256(Status.Created) << 200;
        packedData2 |= isLong ? uint(1) << 208 : uint(0) << 208;
        bytes32 gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, msg.sender, opponent)
        );
        games[gameId] = GameInfoPacked(packedData, packedData2);
        emit UpDownCreated(
            CreateUpDown(
                gameId,
                feedId,
                opponent,
                uint32(block.timestamp),
                endTime,
                startingAssetPrice,
                isLong,
                depositAmount,
                msg.sender
            )
        );
    }

    /**
     * Accepts 1vs1 up/down mode game
     * @param gameId game id
     */
    function acceptGame(bytes32 gameId) public {
        GameInfo memory game = decodeData(gameId);
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
            require(msg.sender != game.initiator, "Wrong opponent");
            games[gameId].packedData = uint256(uint160(msg.sender));
        }
        ITreasury(treasury).deposit(game.depositAmount, msg.sender);
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(~uint256(0) << 200)) |
            (uint256(uint8(Status.Started)) << 200);
        emit UpDownAccepted(
            gameId,
            msg.sender,
            !game.isLong,
            game.depositAmount
        );
    }

    /**
     * Accepts 1vs1 up/down mode game with permit
     * @param gameId game id
     */
    function acceptGameWithPermit(
        bytes32 gameId,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory game = decodeData(gameId);
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
            require(msg.sender != game.initiator, "Wrong opponent");
            games[gameId].packedData = uint256(uint160(msg.sender));
        }
        ITreasury(treasury).depositWithPermit(
            game.depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(~uint256(0) << 200)) |
            (uint256(uint8(Status.Started)) << 200);
        emit UpDownAccepted(
            gameId,
            msg.sender,
            !game.isLong,
            game.depositAmount
        );
    }

    /**
     * Changes game status if opponent refuses to play
     * @param gameId game id
     */
    function refuseGame(bytes32 gameId) public {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == game.opponent, "Only opponent can refuse");
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(~uint256(0) << 200)) |
            (uint256(uint8(Status.Refused)) << 200);
        emit UpDownRefused(gameId);
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
                game.gameStatus == Status.Refused,
            "Wrong status!"
        );
        ITreasury(treasury).refund(game.depositAmount, game.initiator);
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(~uint256(0) << 200)) |
            (uint256(uint8(Status.Cancelled)) << 200);
        emit UpDownCancelled(gameId);
    }

    /**
     * Finalizes 1vs1 up/down mode game and distributes rewards to players
     * @param gameId game id
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes32 gameId,
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedId);
        require(
            priceTimestamp - game.endTime <= 10 minutes ||
                block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        if (
            game.isLong
                ? game.startingAssetPrice < uint192(finalPrice) / 1e14
                : game.startingAssetPrice > uint192(finalPrice) / 1e14
        ) {
            ITreasury(treasury).distribute(
                game.depositAmount * 2,
                game.initiator,
                game.depositAmount,
                fee
            );
            emit UpDownFinalized(
                gameId,
                game.isLong,
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
            emit UpDownFinalized(
                gameId,
                !game.isLong,
                finalPrice,
                Status.Finished
            );
        }
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(~uint256(0) << 200)) |
            (uint256(uint8(Status.Finished)) << 200);
        games[gameId].packedData2 |= uint256(uint192(finalPrice) / 1e14) << 216;
    }

    function decodeData(
        bytes32 gameId
    ) public view returns (GameInfo memory gameData) {
        uint256 packedData = games[gameId].packedData;
        uint256 packedData2 = games[gameId].packedData2;
        gameData.opponent = address(uint160(packedData));
        gameData.startingAssetPrice = uint256(uint32(packedData >> 160));
        gameData.startTime = uint256(uint32(packedData >> 192));
        gameData.endTime = uint256(uint32(packedData >> 224));

        gameData.initiator = address(uint160(packedData2));
        gameData.depositAmount = uint256(uint32(packedData2 >> 160));
        gameData.feedId = uint8(packedData2 >> 192);
        gameData.gameStatus = Status(uint8(packedData2 >> 200));
        gameData.isLong = packedData2 >> 208 == 1;
        gameData.finalPrice = uint256(uint32(packedData2 >> 216));
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
