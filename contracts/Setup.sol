// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Setup is AccessControl {
    event NewFee(uint256 newFee);
    event NewInitiatorFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event SetupNewPlayer(
        bytes32 gameId,
        bool isLong,
        uint256 depositAmount,
        address player,
        uint256 rakeback
    );
    event SetupCancelled(bytes32 gameId, address initiator);
    event SetupFinalized(
        bytes32 gameId,
        bool takeProfitWon,
        int192 finalPrice,
        uint256 endTime,
        uint256 initiatorFee,
        uint256 rate
    );
    event SetupCreated(CreateSetup data);
    event SetupGameID(bytes32 gameId);
    event SetupRetrieved(bytes32 gameId, address player, uint256 depositAmount);

    enum Status {
        Default,
        Created,
        Cancelled,
        Finished
    }

    enum UserStatus {
        Default,
        TP,
        SL,
        Claimed
    }

    struct CreateSetup {
        bytes32 gameId;
        uint8 feedNumber;
        uint32 startTime;
        uint32 endTime;
        int192 startingPrice;
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
        bool isLong;
        address creator;
        address token;
    }

    struct GameInfo {
        address initiator;
        uint8 feedNumber;
        bool isLong;
        Status gameStatus;
        uint256 startTime;
        uint256 endTime;
        uint256 SLplayers;
        uint256 TPplayers;
    }

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
        uint256 totalDepositsSL;
        uint256 totalDepositsTP;
        uint256 totalRakebackSL;
        uint256 totalRakebackTP;
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
        uint256 startingPrice;
        uint256 finalPrice;
        uint256 finalRate;
    }

    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    mapping(bytes32 => GameInfoPacked) public games;
    mapping(bytes32 => mapping(address => UserStatus)) public withdrawStatus;
    mapping(bytes32 => mapping(address => uint256)) public depositAmounts;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;
    uint256 public initiatorFee = 1000;
    uint256 public fee = 1000;
    address public treasury;
    bool public isActive = true;

    constructor(address newTreasury) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        require(newTreasury != address(0), "Zero address");
        treasury = newTreasury;
    }

    /**
     * Create setup game
     * @param isLong long or short?
     * @param endTime game end time
     * @param takeProfitPrice take profit asset price
     * @param stopLossPrice stop loss asset price
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     * @param token token for game deposits
     * @param unverifiedReport chainlink unverified report
     */
    function createSetup(
        bool isLong,
        uint32 endTime,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        uint8 feedNumber,
        address token,
        bytes memory unverifiedReport
    ) public {
        require(isActive, "Game is disabled");
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        require(
            IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                feedNumber
            ) != bytes32(0),
            "Wrong feed number"
        );
        bytes32 gameId = keccak256(
            abi.encodePacked(
                block.timestamp,
                endTime,
                takeProfitPrice,
                stopLossPrice,
                msg.sender,
                address(this)
            )
        );
        require(games[gameId].packedData == 0, "Game exists");
        ITreasury(treasury).setGameToken(gameId, token);
        (int192 startingPrice, uint32 startTime) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, feedNumber);
        require(
            block.timestamp - startTime <= 1 minutes,
            "Old chainlink report"
        );
        if (isLong) {
            require(
                uint192(startingPrice) > stopLossPrice &&
                    uint192(startingPrice) < takeProfitPrice,
                "Wrong tp or sl price"
            );
        } else {
            require(
                uint192(startingPrice) < stopLossPrice &&
                    uint192(startingPrice) > takeProfitPrice,
                "Wrong tp or sl price"
            );
        }

        GameInfoPacked memory data;
        data.packedData = uint256(uint160(msg.sender));
        data.packedData |= uint256(startTime) << 160;
        data.packedData |= uint256(endTime) << 192;
        data.startingPrice = uint192(startingPrice);
        data.takeProfitPrice = takeProfitPrice;
        data.stopLossPrice = stopLossPrice;
        data.packedData2 |= uint256(feedNumber) << 64;
        data.packedData2 |= uint256(uint8(Status.Created)) << 72;
        if (isLong) {
            data.packedData2 |= uint256(1) << 250;
        }
        games[gameId] = data;
        emit SetupCreated(
            CreateSetup(
                gameId,
                feedNumber,
                startTime,
                endTime,
                startingPrice,
                takeProfitPrice,
                stopLossPrice,
                isLong,
                msg.sender,
                token
            )
        );
    }

    /**
     * Participate in the game and deposit funds
     * @param isLong long or short?
     * @param gameId amount to deposit in the game
     * @param depositAmount game id
     */
    function play(bool isLong, uint256 depositAmount, bytes32 gameId) public {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Created, "Wrong status!");
        require(
            data.startTime + (data.endTime - data.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(
            depositAmounts[gameId][msg.sender] == 0,
            "You are already in the game"
        );
        uint256 rakeback = ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            gameId,
            true
        );
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            withdrawStatus[gameId][msg.sender] = UserStatus.TP;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 177)) |
                ((data.TPplayers + 1) << 177);
            games[gameId].totalDepositsTP += depositAmount;
            games[gameId].totalRakebackTP += rakeback;
        } else {
            withdrawStatus[gameId][msg.sender] = UserStatus.SL;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 209)) |
                ((data.SLplayers + 1) << 209);
            games[gameId].totalDepositsSL += depositAmount;
            games[gameId].totalRakebackSL += rakeback;
        }
        emit SetupNewPlayer(
            gameId,
            isLong,
            depositAmount,
            msg.sender,
            rakeback
        );
    }

    /**
     * Participate in the game with deposited funds
     * @param isLong long or short?
     * @param gameId amount to deposit in the game
     * @param depositAmount game id
     */
    function playWithDeposit(
        bool isLong,
        uint256 depositAmount,
        bytes32 gameId
    ) public {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Created, "Wrong status!");
        require(
            data.startTime + (data.endTime - data.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(
            depositAmounts[gameId][msg.sender] == 0,
            "You are already in the game"
        );
        uint256 rakeback = ITreasury(treasury).lock(
            depositAmount,
            msg.sender,
            gameId,
            true
        );
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            withdrawStatus[gameId][msg.sender] = UserStatus.TP;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 177)) |
                ((data.TPplayers + 1) << 177);
            games[gameId].totalDepositsTP += depositAmount;
            games[gameId].totalRakebackTP += rakeback;
        } else {
            withdrawStatus[gameId][msg.sender] = UserStatus.SL;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 209)) |
                ((data.SLplayers + 1) << 209);
            games[gameId].totalDepositsSL += depositAmount;
            games[gameId].totalRakebackSL += rakeback;
        }
        emit SetupNewPlayer(
            gameId,
            isLong,
            depositAmount,
            msg.sender,
            rakeback
        );
    }

    /**
     * Participate in the game with permit and deposit funds
     * @param isLong long or short?
     * @param depositAmount amount to deposit in the game
     * @param gameId game id
     * @param permitData data required by permit
     */
    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        bytes32 gameId,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Created, "Wrong status!");
        require(
            data.startTime + (data.endTime - data.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(
            depositAmounts[gameId][msg.sender] == 0,
            "You are already in the game"
        );
        uint256 rakeback = ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            gameId,
            true,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            withdrawStatus[gameId][msg.sender] = UserStatus.TP;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 177)) |
                ((data.TPplayers + 1) << 177);
            games[gameId].totalDepositsTP += depositAmount;
            games[gameId].totalRakebackTP += rakeback;
        } else {
            withdrawStatus[gameId][msg.sender] = UserStatus.SL;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 209)) |
                ((data.SLplayers + 1) << 209);
            games[gameId].totalDepositsSL += depositAmount;
            games[gameId].totalRakebackSL += rakeback;
        }
        emit SetupNewPlayer(
            gameId,
            isLong,
            depositAmount,
            msg.sender,
            rakeback
        );
    }

    /**
     * Closes setup game
     * @param gameId game id
     */
    function closeGame(bytes32 gameId) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory data = decodeData(gameId);
        require(data.startTime != 0, "Game doesn't exist");
        require(
            data.gameStatus == Status.Created &&
                ((data.startTime + (data.endTime - data.startTime) / 3 <
                    block.timestamp &&
                    (data.SLplayers == 0 || data.TPplayers == 0)) ||
                    block.timestamp > data.endTime),
            "Wrong status!"
        );
        //rewrites status
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 72)) |
            (uint256(uint8(Status.Cancelled)) << 72);
        emit SetupCancelled(gameId, data.initiator);
    }

    /**
     * Claim for refund if game was cancelled
     * @param gameId game id
     */
    function getRefund(bytes32 gameId) public {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Cancelled, "Wrong status!");
        require(
            withdrawStatus[gameId][msg.sender] == UserStatus.TP ||
                withdrawStatus[gameId][msg.sender] == UserStatus.SL,
            "Already claimed"
        );
        withdrawStatus[gameId][msg.sender] = UserStatus.Claimed;
        ITreasury(treasury).refund(
            depositAmounts[gameId][msg.sender],
            msg.sender,
            gameId
        );
        emit SetupRetrieved(
            gameId,
            msg.sender,
            depositAmounts[gameId][msg.sender]
        );
    }

    /**
     * Finalizes setup game
     * @param unverifiedReport chainlink unverified report
     * @param gameId game id
     */
    function finalizeGame(
        bytes memory unverifiedReport,
        bytes32 gameId
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Created, "Wrong status!");
        (int192 finalPrice, uint256 priceTimestamp) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, data.feedNumber);
        require(
            priceTimestamp > data.startTime && priceTimestamp <= data.endTime,
            "Old chainlink report"
        );
        if (data.SLplayers == 0 || data.TPplayers == 0) {
            //rewrites status
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFF) << 72)) |
                (uint256(uint8(Status.Cancelled)) << 72);
            games[gameId].finalPrice = uint192(finalPrice);
            emit SetupCancelled(gameId, data.initiator);
            return;
        }

        uint256 finalRate;
        uint256 withdrawnInitiatorFees;
        if (data.isLong) {
            require(
                uint192(finalPrice) <= games[gameId].stopLossPrice ||
                    uint192(finalPrice) >= games[gameId].takeProfitPrice,
                "Can't end"
            );
            if (uint192(finalPrice) >= games[gameId].takeProfitPrice) {
                ITreasury(treasury).withdrawGameFee(
                    games[gameId].totalDepositsSL,
                    fee,
                    gameId
                );
                withdrawnInitiatorFees = ITreasury(treasury)
                    .withdrawInitiatorFee(
                        games[gameId].totalDepositsSL,
                        games[gameId].totalDepositsTP,
                        initiatorFee,
                        data.initiator,
                        gameId
                    );
                finalRate = ITreasury(treasury).calculateRate(
                    games[gameId].totalDepositsTP -
                        ((games[gameId].totalDepositsTP * initiatorFee) /
                            FEE_DENOMINATOR),
                    games[gameId].totalRakebackSL,
                    gameId
                );
                emit SetupFinalized(
                    gameId,
                    true,
                    finalPrice,
                    priceTimestamp,
                    withdrawnInitiatorFees,
                    finalRate
                );
            } else if (uint192(finalPrice) <= games[gameId].stopLossPrice) {
                ITreasury(treasury).withdrawGameFee(
                    games[gameId].totalDepositsTP,
                    fee,
                    gameId
                );
                withdrawnInitiatorFees = ITreasury(treasury)
                    .withdrawInitiatorFee(
                        games[gameId].totalDepositsTP,
                        games[gameId].totalDepositsSL,
                        initiatorFee,
                        data.initiator,
                        gameId
                    );
                // sl team wins
                finalRate = ITreasury(treasury).calculateRate(
                    games[gameId].totalDepositsSL -
                        ((games[gameId].totalDepositsSL * initiatorFee) /
                            FEE_DENOMINATOR),
                    games[gameId].totalRakebackTP,
                    gameId
                );
                emit SetupFinalized(
                    gameId,
                    false,
                    finalPrice,
                    priceTimestamp,
                    withdrawnInitiatorFees,
                    finalRate
                );
            }
        } else {
            require(
                uint192(finalPrice) >= games[gameId].stopLossPrice ||
                    uint192(finalPrice) <= games[gameId].takeProfitPrice,
                "Can't end"
            );
            if (uint192(finalPrice) >= games[gameId].stopLossPrice) {
                // sl team wins
                ITreasury(treasury).withdrawGameFee(
                    games[gameId].totalDepositsTP,
                    fee,
                    gameId
                );
                withdrawnInitiatorFees = ITreasury(treasury)
                    .withdrawInitiatorFee(
                        games[gameId].totalDepositsTP,
                        games[gameId].totalDepositsSL,
                        initiatorFee,
                        data.initiator,
                        gameId
                    );
                // sl team wins
                finalRate = ITreasury(treasury).calculateRate(
                    games[gameId].totalDepositsSL -
                        ((games[gameId].totalDepositsSL * initiatorFee) /
                            FEE_DENOMINATOR),
                    games[gameId].totalRakebackTP,
                    gameId
                );
                emit SetupFinalized(
                    gameId,
                    false,
                    finalPrice,
                    priceTimestamp,
                    withdrawnInitiatorFees,
                    finalRate
                );
            } else if (uint192(finalPrice) <= games[gameId].takeProfitPrice) {
                ITreasury(treasury).withdrawGameFee(
                    games[gameId].totalDepositsSL,
                    fee,
                    gameId
                );
                withdrawnInitiatorFees = ITreasury(treasury)
                    .withdrawInitiatorFee(
                        games[gameId].totalDepositsSL,
                        games[gameId].totalDepositsTP,
                        initiatorFee,
                        data.initiator,
                        gameId
                    );
                finalRate = ITreasury(treasury).calculateRate(
                    games[gameId].totalDepositsTP -
                        ((games[gameId].totalDepositsTP * initiatorFee) /
                            FEE_DENOMINATOR),
                    games[gameId].totalRakebackSL,
                    gameId
                );
                emit SetupFinalized(
                    gameId,
                    true,
                    finalPrice,
                    priceTimestamp,
                    withdrawnInitiatorFees,
                    finalRate
                );
            }
        }

        uint256 packedData2 = games[gameId].packedData2;
        games[gameId].finalRate = finalRate;
        //rewrites endTime
        games[gameId].packedData =
            (games[gameId].packedData & ~(uint256(0xFFFFFFFF) << 192)) |
            (uint256(priceTimestamp) << 192);
        //rewrites status
        packedData2 =
            (packedData2 & ~(uint256(0xFF) << 72)) |
            (uint256(uint8(Status.Finished)) << 72);
        games[gameId].finalPrice = uint192(finalPrice);
        games[gameId].packedData2 = packedData2;
    }

    /**
     * Withdraws rewards or rakeback to your Treasury deposit
     * @param gameIds array of game IDs to claim your reward from
     */
    function retrieveRewards(bytes32[] calldata gameIds) public {
        for (uint i; i < gameIds.length; i++) {
            GameInfo memory data = decodeData(gameIds[i]);
            require(data.gameStatus == Status.Finished, "Wrong status!");
            require(
                withdrawStatus[gameIds[i]][msg.sender] == UserStatus.TP ||
                    withdrawStatus[gameIds[i]][msg.sender] == UserStatus.SL,
                "Already claimed"
            );
            if (data.isLong) {
                if (
                    games[gameIds[i]].finalPrice >=
                    games[gameIds[i]].takeProfitPrice
                ) {
                    if (
                        withdrawStatus[gameIds[i]][msg.sender] == UserStatus.SL
                    ) {
                        ITreasury(treasury).withdrawRakebackSetup(
                            gameIds[i],
                            msg.sender
                        );
                    } else {
                        ITreasury(treasury).universalDistribute(
                            msg.sender,
                            depositAmounts[gameIds[i]][msg.sender] -
                                ((depositAmounts[gameIds[i]][msg.sender] *
                                    initiatorFee) / FEE_DENOMINATOR),
                            gameIds[i],
                            games[gameIds[i]].finalRate
                        );
                    }
                } else if (
                    games[gameIds[i]].finalPrice <=
                    games[gameIds[i]].stopLossPrice
                ) {
                    // sl team wins
                    if (
                        withdrawStatus[gameIds[i]][msg.sender] == UserStatus.TP
                    ) {
                        ITreasury(treasury).withdrawRakebackSetup(
                            gameIds[i],
                            msg.sender
                        );
                    } else {
                        ITreasury(treasury).universalDistribute(
                            msg.sender,
                            depositAmounts[gameIds[i]][msg.sender] -
                                ((depositAmounts[gameIds[i]][msg.sender] *
                                    initiatorFee) / FEE_DENOMINATOR),
                            gameIds[i],
                            games[gameIds[i]].finalRate
                        );
                    }
                }
            } else {
                if (
                    games[gameIds[i]].finalPrice >=
                    games[gameIds[i]].stopLossPrice
                ) {
                    // sl team wins
                    if (
                        withdrawStatus[gameIds[i]][msg.sender] == UserStatus.TP
                    ) {
                        ITreasury(treasury).withdrawRakebackSetup(
                            gameIds[i],
                            msg.sender
                        );
                    } else {
                        ITreasury(treasury).universalDistribute(
                            msg.sender,
                            depositAmounts[gameIds[i]][msg.sender] -
                                ((depositAmounts[gameIds[i]][msg.sender] *
                                    initiatorFee) / FEE_DENOMINATOR),
                            gameIds[i],
                            games[gameIds[i]].finalRate
                        );
                    }
                } else if (
                    games[gameIds[i]].finalPrice <=
                    games[gameIds[i]].takeProfitPrice
                ) {
                    if (
                        withdrawStatus[gameIds[i]][msg.sender] == UserStatus.SL
                    ) {
                        ITreasury(treasury).withdrawRakebackSetup(
                            gameIds[i],
                            msg.sender
                        );
                    } else {
                        ITreasury(treasury).universalDistribute(
                            msg.sender,
                            depositAmounts[gameIds[i]][msg.sender] -
                                ((depositAmounts[gameIds[i]][msg.sender] *
                                    initiatorFee) / FEE_DENOMINATOR),
                            gameIds[i],
                            games[gameIds[i]].finalRate
                        );
                    }
                }
            }
            withdrawStatus[gameIds[i]][msg.sender] = UserStatus.Claimed;
            emit SetupRetrieved(
                gameIds[i],
                msg.sender,
                depositAmounts[gameIds[i]][msg.sender]
            );
        }
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
        gameData.initiator = address(uint160(packedData));
        gameData.startTime = uint256(uint32(packedData >> 160));
        gameData.endTime = uint256(uint32(packedData >> 192));

        gameData.feedNumber = uint8(packedData2 >> 64);
        gameData.gameStatus = Status(uint8(packedData2 >> 72));
        gameData.isLong = packedData2 >> 250 == 1;
        gameData.TPplayers = uint256(uint32(packedData2 >> 177));
        gameData.SLplayers = uint256(uint32(packedData2 >> 209));
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
     * Change fee
     * @param newFee new fee in bp
     */
    function setInitiatorFee(
        uint256 newFee
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        initiatorFee = newFee;
        emit NewInitiatorFee(newFee);
    }

    /**
     * Turns game on/off
     */
    function toggleActive() public onlyRole(DEFAULT_ADMIN_ROLE) {
        isActive = !isActive;
    }
}
