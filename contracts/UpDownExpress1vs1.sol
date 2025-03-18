// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";
import "hardhat/console.sol";

contract UpDownExpress1vs1 is AccessControl {
    event OneVsOneToggle(bool isActive);
    event NewRefundFee(uint256 newRefundFee);
    event NewGameDuration(uint256 newMaxDuration, uint256 newMinDuration);
    event NewFee(uint256 newFee, address token);
    event NewTreasury(address newTreasury);
    event ExactPriceCreated(
        bytes32 gameId,
        uint8 feedNumber,
        address opponent,
        uint32 priceTimeGap,
        uint32 startTime,
        uint32 endTime,
        address initiator,
        bool[] initiatorPredictions,
        uint256 depositAmount,
        address gameToken
    );
    event ExactPriceAccepted(
        bytes32 gameId,
        address opponent,
        bool[] predictions
    );
    event ExactPriceCancelled(bytes32 gameId);
    event ExactPriceFinalized(
        bytes32 gameId,
        uint256 playerOneCorrect,
        uint256 playerTwoCorrect,
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
        uint8 numberOfGuesses;
        address initiator;
        uint256 startTime;
        uint256 endTime;
        uint256 priceTimeGap;
        address opponent;
        bool[] initiatorPredictions;
        bool[] opponentPredictions;
        Status gameStatus;
    }

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
        uint256 depositAmount;
    }

    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    uint8 public constant MAX_PREDICTION_AMOUNT = 12;
    mapping(bytes32 => GameInfoPacked) public games;
    address public treasury;
    mapping(address => uint256) public fees;
    uint256 public refundFee = 1000;
    uint256 public minDuration = 280;
    uint256 public maxDuration = 4 weeks;
    bool public isActive = true;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createGame(
        uint8 feedNumber,
        uint8 numberOfGuesses,
        address opponent,
        uint32 endTime,
        uint32 priceTimeGap,
        bool[] memory predictions,
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
        require(fees[token] != 0, "No fee set");
        bytes32 gameId = keccak256(
            abi.encodePacked(
                endTime,
                block.timestamp,
                msg.sender,
                opponent,
                address(this)
            )
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
        require(
            predictions.length == numberOfGuesses &&
                numberOfGuesses <= MAX_PREDICTION_AMOUNT,
            "Wrong amount of predictions"
        );
        packedData |= uint256(numberOfGuesses) << 192;
        for (uint8 i = 0; i < numberOfGuesses; i++) {
            if (predictions[i]) {
                packedData |= uint256(1) << (200 + i);
            }
        }
        packedData2 |= block.timestamp << 160;
        packedData2 |= uint256(Status.Created) << 208;
        packedData2 |= uint256(feedNumber) << 216;
        console.log(packedData2);
        packedData2 |= uint256(priceTimeGap) << 224;
        console.log(packedData2);
        games[gameId].depositAmount = depositAmount;
        games[gameId].packedData = packedData;
        games[gameId].packedData2 = packedData2;
        emit ExactPriceCreated(
            gameId,
            feedNumber,
            opponent,
            priceTimeGap,
            uint32(block.timestamp),
            endTime,
            msg.sender,
            predictions,
            depositAmount,
            token
        );
    }

    function acceptGame(
        bytes32 gameId,
        bool[] memory opponentPredictions
    ) public {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
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
        //gas?
        for (uint8 i = 0; i < game.numberOfGuesses; i++) {
            if (opponentPredictions[i]) {
                games[gameId].packedData |= uint256(1) << (212 + i);
            }
        }
        require(
            (games[gameId].packedData >> 200) & 0xFFF !=
                (games[gameId].packedData >> 212) & 0xFFF,
            "Same asset prices"
        );
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
        emit ExactPriceAccepted(gameId, msg.sender, opponentPredictions);
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
                    (game.gameStatus == Status.Created ||
                        game.gameStatus == Status.Started) &&
                        block.timestamp > game.endTime
                        ? block.timestamp - game.endTime >= 3 days
                        : false
                ),
            "Wrong status!"
        );
        if (game.gameStatus == Status.Started) {
            ITreasury(treasury).refund(
                games[gameId].depositAmount,
                game.opponent,
                gameId
            );
        }
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
     */
    function finalizeGame(
        bytes32 gameId,
        bytes[] memory unverifiedReports
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData(gameId);
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        console.log(unverifiedReports.length, game.numberOfGuesses);
        require(
            unverifiedReports.length == game.numberOfGuesses,
            "Wrong number of reports"
        );
        address upkeep = ITreasury(treasury).upkeep();
        int192[] memory finalPrices = new int192[](game.numberOfGuesses);
        uint32[] memory finalTimestamps = new uint32[](game.numberOfGuesses);
        for (uint i; i < unverifiedReports.length; i++) {
            (int192 priceData, uint32 priceTimestamp) = IDataStreamsVerifier(
                upkeep
            ).verifyReportWithTimestamp(unverifiedReports[i], game.feedNumber);
            //check for proper timestamps betweeen final prices
            require(
                priceTimestamp -
                    (block.timestamp + game.priceTimeGap * (i + 1)) <=
                    10 seconds,
                "Old chainlink report"
            );
            finalPrices[i] = priceData;
            finalTimestamps[i] = priceTimestamp;
        }

        uint256 playerOneCorrect;
        uint256 playerTwoCorrect;
        for (uint j = 1; j < unverifiedReports.length; j++) {
            if (
                finalPrices[j] > finalPrices[j - 1] &&
                game.initiatorPredictions[j]
            ) {
                playerOneCorrect++;
            }
            if (
                finalPrices[j] > finalPrices[j - 1] &&
                game.opponentPredictions[j]
            ) {
                playerTwoCorrect++;
            }
        }

        //set a default fee 10% if fee was 0
        if (fees[ITreasury(treasury).gameToken(gameId)] == 0) {
            fees[ITreasury(treasury).gameToken(gameId)] = 1000;
        }
        ITreasury(treasury).withdrawGameFee(
            games[gameId].depositAmount,
            fees[ITreasury(treasury).gameToken(gameId)],
            gameId
        );
        uint256 finalRate = ITreasury(treasury).calculateRate(
            games[gameId].depositAmount,
            0,
            gameId
        );
        if (playerOneCorrect < playerTwoCorrect) {
            ITreasury(treasury).universalDistribute(
                game.initiator,
                games[gameId].depositAmount,
                gameId,
                finalRate
            );
            ITreasury(treasury).setGameFinished(gameId);
            emit ExactPriceFinalized(
                gameId,
                playerOneCorrect,
                playerTwoCorrect,
                Status.Finished
            );
        } else if (playerOneCorrect > playerTwoCorrect) {
            ITreasury(treasury).universalDistribute(
                game.opponent,
                games[gameId].depositAmount,
                gameId,
                finalRate
            );
            ITreasury(treasury).setGameFinished(gameId);
            emit ExactPriceFinalized(
                gameId,
                playerOneCorrect,
                playerTwoCorrect,
                Status.Finished
            );
        }
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 208)) |
            (uint256(uint8(Status.Finished)) << 208);
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
        gameData.numberOfGuesses = uint8(packedData >> 192);

        bool[] memory predictions = new bool[](gameData.numberOfGuesses);
        for (uint8 i = 0; i < gameData.numberOfGuesses; i++) {
            predictions[i] = ((packedData >> (200 + i)) & 1) == 1;
        }
        gameData.initiatorPredictions = predictions;
        predictions = new bool[](gameData.numberOfGuesses);
        for (uint8 i = 0; i < gameData.numberOfGuesses; i++) {
            predictions[i] = ((packedData >> (212 + i)) & 1) == 1;
        }
        gameData.opponentPredictions = predictions;

        gameData.initiator = address(uint160(packedData2));
        gameData.startTime = uint256(uint32(packedData2 >> 160));
        gameData.gameStatus = Status(uint8(packedData2 >> 208));
        gameData.feedNumber = uint8(packedData2 >> 216);
        gameData.priceTimeGap = uint256(uint32(packedData2 >> 224));
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
        emit NewGameDuration(newMaxDuration, newMinDuration);
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
     * @param token for wich fee will be set
     */
    function setFee(
        address token,
        uint256 newFee
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFee <= 3000, "Fee exceeds the cap");
        fees[token] = newFee;
        emit NewFee(newFee, token);
    }

    /**
     * Change refund fee
     * @param newRefundFee new fee in bp
     */
    function setRefundFee(
        uint256 newRefundFee
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRefundFee <= 3000, "Fee exceeds the cap");
        refundFee = newRefundFee;
        emit NewRefundFee(newRefundFee);
    }

    /**
     * Turns game on/off
     */
    function toggleActive() public onlyRole(DEFAULT_ADMIN_ROLE) {
        isActive = !isActive;
        emit OneVsOneToggle(isActive);
    }
}
