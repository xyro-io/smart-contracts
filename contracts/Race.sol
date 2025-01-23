// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Race is AccessControl {
    event NewAssetCap(uint256 newMinAssetAmount, uint256 newMaxAssetAmount);
    event NewMaxPlayersAmount(uint256 newMax);
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event RaceCreated(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 endTime,
        uint8[] feedNumber,
        bytes32 gameId,
        address token,
        uint256 minDepositAmount
    );
    event RaceNewPlayer(
        address player,
        uint256 depositAmount,
        uint256 depositId,
        bytes32 gameId,
        uint8 feedNumbers,
        uint256 rakeback,
        address gameToken
    );
    event RaceStarted(
        int192[] startingPrices,
        uint32[] priceTimestamps,
        bytes32 gameId
    );
    event RaceFinalized(
        int192[] finalPrice,
        int256[] priceDiffs,
        uint32[] priceTimestamps,
        uint256 wonFeedNumber,
        bytes32 gameId
    );
    event RaceCancelled(bytes32 gameId);
    event RaceDraw(bytes32 gameId);

    struct GameInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        uint256 depositId;
    }

    struct AssetData {
        address[] players;
        uint256[] depositIds;
        uint256 totalDeposits;
        uint256 totalRakeback;
        int192 startingPrice;
    }

    uint256 packedData;
    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    uint256 constant timeGap = 30 seconds;
    mapping(uint8 => mapping(address => uint256)) public depositAmounts;
    mapping(uint8 => AssetData) public assetData;
    bytes32 public currentGameId;
    uint8[] public assetFeedNumber;
    address public treasury;
    uint256 public minDepositAmount;
    uint256 public maxPlayers = 100;
    uint256 public fee = 1000;
    uint256 public minAssetAmount = 2;
    uint256 public maxAssetAmount = 5;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates race game
     * @param endTime when the game will end
     * @param stopPredictAt time when players can't enter the game
     * @param depositAmount amount to enter the game
     * @param token token for game deposits
     * @param feedNumbers token position in array of Chainlink DataStreams feed IDs
     */
    function startGame(
        uint32 endTime,
        uint32 stopPredictAt,
        uint256 depositAmount,
        address token,
        uint8[] memory feedNumbers
    ) public onlyRole(GAME_MASTER_ROLE) {
        require(
            feedNumbers.length >= minAssetAmount &&
                feedNumbers.length <= maxAssetAmount,
            "Wrong asset length"
        );
        require(packedData == 0, "Finish previous game first");
        require(stopPredictAt - block.timestamp >= timeGap, "Wrong stop time");
        require(
            endTime - stopPredictAt >= timeGap,
            "Timeframe gap must be higher"
        );
        for (uint i = 0; i < feedNumbers.length; i++) {
            require(
                IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                    feedNumbers[i]
                ) != bytes32(0),
                "Wrong feed number"
            );
        }
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(endTime) << 64));
        currentGameId = keccak256(
            abi.encodePacked(
                endTime,
                stopPredictAt,
                depositAmount,
                block.timestamp,
                address(this)
            )
        );
        assetFeedNumber = feedNumbers;
        ITreasury(treasury).setGameToken(currentGameId, token);
        minDepositAmount = depositAmount;
        emit RaceCreated(
            block.timestamp,
            stopPredictAt,
            endTime,
            feedNumbers,
            currentGameId,
            token,
            depositAmount
        );
    }

    /**
     * Take a participation in coin race game and deposit funds
     * @param depositAmount amount to deposit
     * @param feedNumbers coind id of choise
     */
    function play(uint256 depositAmount, uint8 feedNumbers) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(
            depositAmounts[feedNumbers][msg.sender] == 0,
            "Already participating"
        );
        //проверять ассет айди на валидный
        GameInfo memory game = decodeData();
        require(game.depositId + 1 <= maxPlayers, "Max player amount reached");
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );

        depositAmounts[feedNumbers][msg.sender] = depositAmount;
        uint256 rakeback = ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            currentGameId,
            game.depositId
        );
        assetData[feedNumbers].totalDeposits += depositAmount;
        assetData[feedNumbers].totalRakeback += rakeback;
        assetData[feedNumbers].players.push(msg.sender);
        assetData[feedNumbers].depositIds.push(game.depositId);

        emit RaceNewPlayer(
            msg.sender,
            depositAmount,
            game.depositId,
            currentGameId,
            feedNumbers,
            rakeback,
            ITreasury(treasury).gameToken(currentGameId)
        );

        packedData =
            (packedData & ~(uint256(0xFFFFFFFF) << 96)) |
            ((game.depositId + 1) << 96);
    }

    /**
     * Take a participation in coin race game and deposit funds
     * @param depositAmount amount to deposit
     * @param feedNumbers coind id of choise
     */
    function playWithDeposit(uint256 depositAmount, uint8 feedNumbers) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(
            depositAmounts[feedNumbers][msg.sender] == 0,
            "Already participating"
        );
        //проверять ассет айди на валидный
        GameInfo memory game = decodeData();
        require(game.depositId + 1 <= maxPlayers, "Max player amount reached");
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );

        depositAmounts[feedNumbers][msg.sender] = depositAmount;
        uint256 rakeback = ITreasury(treasury).lock(
            depositAmount,
            msg.sender,
            game.depositId,
            currentGameId
        );
        assetData[feedNumbers].totalDeposits += depositAmount;
        assetData[feedNumbers].totalRakeback += rakeback;
        assetData[feedNumbers].players.push(msg.sender);
        assetData[feedNumbers].depositIds.push(game.depositId);

        emit RaceNewPlayer(
            msg.sender,
            depositAmount,
            game.depositId,
            currentGameId,
            feedNumbers,
            rakeback,
            ITreasury(treasury).gameToken(currentGameId)
        );

        packedData =
            (packedData & ~(uint256(0xFFFFFFFF) << 96)) |
            ((game.depositId + 1) << 96);
    }

    /**
     * Take a participation in coin race game and deposit funds
     * @param depositAmount amount to deposit
     * @param feedNumbers coind id of choise
     */
    function playWithPermit(
        uint256 depositAmount,
        uint8 feedNumbers,
        ITreasury.PermitData calldata permitData
    ) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(
            depositAmounts[feedNumbers][msg.sender] == 0,
            "Already participating"
        );
        //проверять ассет айди на валидный
        GameInfo memory game = decodeData();
        require(game.depositId + 1 <= maxPlayers, "Max player amount reached");
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );

        depositAmounts[feedNumbers][msg.sender] = depositAmount;
        uint256 rakeback = ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            currentGameId,
            game.depositId,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        assetData[feedNumbers].totalDeposits += depositAmount;
        assetData[feedNumbers].totalRakeback += rakeback;
        assetData[feedNumbers].players.push(msg.sender);
        assetData[feedNumbers].depositIds.push(game.depositId);

        emit RaceNewPlayer(
            msg.sender,
            depositAmount,
            game.depositId,
            currentGameId,
            feedNumbers,
            rakeback,
            ITreasury(treasury).gameToken(currentGameId)
        );

        packedData =
            (packedData & ~(uint256(0xFFFFFFFF) << 96)) |
            ((game.depositId + 1) << 96);
    }

    /**
     * Sets starting price wich will be used to compare with final price
     * @param unverifiedReports an array of Chainlink DataStreams reports
     */
    function setStartingPrice(
        bytes[] memory unverifiedReports
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData();
        require(block.timestamp >= game.stopPredictAt, "Too early");
        require(hasEnoughPlayers(), "Not enough players");
        address upkeep = ITreasury(treasury).upkeep();
        int192[] memory assetPrices = new int192[](unverifiedReports.length);
        require(
            unverifiedReports.length == assetFeedNumber.length,
            "Wrong reports length"
        );
        uint32[] memory priceTimestamps = new uint32[](
            unverifiedReports.length
        );
        for (uint i; i < unverifiedReports.length; i++) {
            (int192 priceData, uint32 priceTimestamp) = IDataStreamsVerifier(
                upkeep
            ).verifyReportWithTimestamp(
                    unverifiedReports[i],
                    assetFeedNumber[i]
                );
            require(
                priceTimestamp - game.stopPredictAt <= 1 minutes,
                "Old chainlink report"
            );
            require(
                assetData[assetFeedNumber[i]].startingPrice == 0,
                "Starting price already set"
            );
            assetData[assetFeedNumber[i]].startingPrice = priceData;
            assetPrices[i] = priceData;
            priceTimestamps[i] = priceTimestamp;
        }
        emit RaceStarted(assetPrices, priceTimestamps, currentGameId);
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReports Chainlink DataStreams report
     */
    function finalizeGame(
        bytes[] memory unverifiedReports
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData();
        require(packedData != 0, "Start the game first");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (!hasEnoughPlayers()) {
            closeGame();
            return;
        }

        address upkeep = ITreasury(treasury).upkeep();
        int256[] memory finalPricesDiff = new int256[](
            unverifiedReports.length
        );
        int192[] memory finalPrices = new int192[](unverifiedReports.length);
        uint32[] memory finalTimestamps = new uint32[](
            unverifiedReports.length
        );
        int256 topDiff = type(int256).min;
        uint256 topIndex = 0;
        require(
            unverifiedReports.length == assetFeedNumber.length,
            "Wrong reports length"
        );
        for (uint i; i < unverifiedReports.length; i++) {
            (int192 priceData, uint32 priceTimestamp) = IDataStreamsVerifier(
                upkeep
            ).verifyReportWithTimestamp(
                    unverifiedReports[i],
                    assetFeedNumber[i]
                );
            require(
                priceTimestamp - game.endTime <= 1 minutes,
                "Old chainlink report"
            );
            finalTimestamps[i] = priceTimestamp;
            require(
                assetData[assetFeedNumber[i]].startingPrice != 0,
                "Starting price not set"
            );
            finalPricesDiff[i] =
                ((priceData - assetData[assetFeedNumber[i]].startingPrice) *
                    10000) /
                assetData[assetFeedNumber[i]].startingPrice;
            if (finalPricesDiff[i] > topDiff) {
                topDiff = finalPricesDiff[i];
                topIndex = i;
            } else if (finalPricesDiff[i] == topDiff) {
                emit RaceDraw(currentGameId);
                closeGame();
            }
            finalPrices[i] = priceData;
        }

        uint256 totalLostDeposits;
        uint256 totalLostRakeback;
        for (uint i; i < assetFeedNumber.length; i++) {
            if (i != topIndex) {
                totalLostDeposits += assetData[assetFeedNumber[i]]
                    .totalDeposits;
                totalLostRakeback += assetData[assetFeedNumber[i]]
                    .totalRakeback;
            }
        }
        ITreasury(treasury).withdrawGameFee(
            totalLostDeposits,
            fee,
            currentGameId
        );
        uint256 finalRate = ITreasury(treasury).calculateRate(
            assetData[assetFeedNumber[topIndex]].totalDeposits,
            totalLostRakeback,
            currentGameId
        );
        for (
            uint i;
            i < assetData[assetFeedNumber[topIndex]].players.length;
            i++
        ) {
            ITreasury(treasury).universalDistribute(
                assetData[assetFeedNumber[topIndex]].players[i],
                depositAmounts[assetFeedNumber[topIndex]][
                    assetData[assetFeedNumber[topIndex]].players[i]
                ],
                currentGameId,
                assetData[assetFeedNumber[topIndex]].depositIds[i],
                finalRate
            );
        }
        emit RaceFinalized(
            finalPrices,
            finalPricesDiff,
            finalTimestamps,
            topIndex,
            currentGameId
        );
        ITreasury(treasury).setGameFinished(currentGameId);
        for (uint i; i < assetFeedNumber.length; i++) {
            delete assetData[assetFeedNumber[i]];
        }
        packedData = 0;
        currentGameId = bytes32(0);
        delete assetFeedNumber;
    }

    /**
     * Closes game and refunds tokens
     */
    function closeGame() public onlyRole(GAME_MASTER_ROLE) {
        require(currentGameId != bytes32(0), "Game not started");
        for (uint i; i < assetFeedNumber.length; i++) {
            for (
                uint k;
                k < assetData[assetFeedNumber[i]].players.length;
                k++
            ) {
                ITreasury(treasury).refund(
                    depositAmounts[assetFeedNumber[i]][
                        assetData[assetFeedNumber[i]].players[k]
                    ],
                    assetData[assetFeedNumber[i]].players[k],
                    currentGameId,
                    assetData[assetFeedNumber[i]].depositIds[k]
                );
                delete depositAmounts[assetFeedNumber[i]][
                    assetData[assetFeedNumber[i]].players[k]
                ];
            }
            delete assetData[assetFeedNumber[i]];
        }
        emit RaceCancelled(currentGameId);
        packedData = 0;
        currentGameId = bytes32(0);
        delete assetFeedNumber;
    }

    /**
     * Returns decoded game data
     */
    function decodeData() public view returns (GameInfo memory data) {
        data.startTime = uint256(uint32(packedData));
        data.stopPredictAt = uint256(uint32(packedData >> 32));
        data.endTime = uint256(uint32(packedData >> 64));
        data.depositId = uint256(uint160(packedData >> 96));
    }

    function hasEnoughPlayers() public view returns (bool) {
        uint256 playersSufficient;
        for (uint i; i < assetFeedNumber.length; i++) {
            if (assetData[assetFeedNumber[i]].players.length != 0) {
                playersSufficient += 1;
            }
        }
        return playersSufficient <= 1 ? false : true;
    }

    /**
     * Change maximum players number
     * @param newMax new maximum number
     */
    function setMaxPlayers(uint256 newMax) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPlayers = newMax;
        emit NewMaxPlayersAmount(newMax);
    }

    function setAssetAmount(
        uint256 newMinAssetAmount,
        uint256 newMaxAssetAmount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minAssetAmount = newMinAssetAmount;
        maxAssetAmount = newMaxAssetAmount;
        emit NewAssetCap(newMinAssetAmount, newMaxAssetAmount);
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
}
