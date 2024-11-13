// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Setup is AccessControl {
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event SetupNewPlayer(
        bytes32 gameId,
        bool isLong,
        uint256 depositAmount,
        address player
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
        uint32 takeProfitPrice;
        uint32 stopLossPrice;
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
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
        uint256 startringPrice;
        uint256 finalPrice;
    }

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
        uint256 totalDepositsSL;
        uint256 totalDepositsTP;
        uint256 finalRate;
        address gameToken;
    }

    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    mapping(bytes32 => GameInfoPacked) public games;
    mapping(bytes32 => mapping(address => UserStatus)) public withdrawStatus;
    mapping(bytes32 => mapping(address => uint256)) public depositAmounts;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;
    uint256 public fee = 1000;
    address public treasury;
    bool public isActive = true;

    constructor(address newTreasury) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        treasury = newTreasury;
    }

    /**
     * Create setup game
     * @param isLong long or short?
     * @param endTime game end time
     * @param takeProfitPrice take profit asset price
     * @param stopLossPrice stop loss asset price
     * @param feedNumber chainlink feed number
     * @param unverifiedReport chainlink unverified report
     */
    function createSetup(
        bool isLong,
        uint32 endTime,
        uint32 takeProfitPrice,
        uint32 stopLossPrice,
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
        require(token != address(0), "Token must be set");
        bytes32 gameId = keccak256(
            abi.encodePacked(
                block.timestamp,
                endTime,
                takeProfitPrice,
                stopLossPrice,
                msg.sender
            )
        );
        (int192 startingPrice, uint32 startTime) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, feedNumber);
        require(
            block.timestamp - startTime <= 1 minutes,
            "Old chainlink report"
        );
        if (isLong) {
            require(
                uint192(startingPrice) / 1e14 > stopLossPrice &&
                    uint192(startingPrice) / 1e14 < takeProfitPrice,
                "Wrong tp or sl price"
            );
        } else {
            require(
                uint192(startingPrice) / 1e14 < stopLossPrice &&
                    uint192(startingPrice) / 1e14 > takeProfitPrice,
                "Wrong tp or sl price"
            );
        }

        GameInfoPacked memory data;
        data.packedData = uint256(uint160(msg.sender));
        data.packedData |= uint256(startTime) << 160;
        data.packedData |= uint256(endTime) << 192;
        data.packedData |=
            uint256(uint32(uint192(startingPrice / 1e14))) <<
            224;
        data.packedData2 = uint256(takeProfitPrice);
        data.packedData2 |= uint256(stopLossPrice) << 32;
        data.packedData2 |= uint256(feedNumber) << 64;
        data.packedData2 |= uint256(uint8(Status.Created)) << 72;
        if (isLong) {
            data.packedData2 |= uint256(1) << 250;
        }
        data.gameToken = token;
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
        ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            games[gameId].gameToken
        );
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            withdrawStatus[gameId][msg.sender] = UserStatus.TP;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 177)) |
                ((data.TPplayers + 1) << 177);
            games[gameId].totalDepositsTP += depositAmount;
        } else {
            withdrawStatus[gameId][msg.sender] = UserStatus.SL;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 209)) |
                ((data.SLplayers + 1) << 209);
            games[gameId].totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
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
        ITreasury(treasury).lock(
            depositAmount,
            msg.sender,
            games[gameId].gameToken
        );
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            withdrawStatus[gameId][msg.sender] = UserStatus.TP;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 177)) |
                ((data.TPplayers + 1) << 177);
            games[gameId].totalDepositsTP += depositAmount;
        } else {
            withdrawStatus[gameId][msg.sender] = UserStatus.SL;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 209)) |
                ((data.SLplayers + 1) << 209);
            games[gameId].totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
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
        ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            games[gameId].gameToken,
            msg.sender,
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
        } else {
            withdrawStatus[gameId][msg.sender] = UserStatus.SL;
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 209)) |
                ((data.SLplayers + 1) << 209);
            games[gameId].totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    }

    /**
     * Closes setup game
     * @param gameId game id
     */
    function closeGame(bytes32 gameId) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory data = decodeData(gameId);
        require(data.startTime != 0, "Game doesn't exist");
        require(
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
            games[gameId].gameToken
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
        (int192 finalPrice, uint256 endTime) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, data.feedNumber);

        if (data.SLplayers == 0 || data.TPplayers == 0) {
            //rewrites status
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFF) << 72)) |
                (uint256(uint8(Status.Cancelled)) << 72);
            games[gameId].packedData2 |=
                uint256(uint192(finalPrice) / 1e14) <<
                145;
            emit SetupCancelled(gameId, data.initiator);
            return;
        }

        uint256 initiatorFee;
        uint256 finalRate;
        if (data.isLong) {
            require(
                uint192(finalPrice) / 1e14 <= data.stopLossPrice ||
                    uint192(finalPrice) / 1e14 >= data.takeProfitPrice,
                "Can't end"
            );
            if (uint192(finalPrice) / 1e14 >= data.takeProfitPrice) {
                // tp team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsSL,
                        games[gameId].totalDepositsTP,
                        games[gameId].gameToken,
                        fee,
                        data.initiator
                    );
                emit SetupFinalized(
                    gameId,
                    true,
                    finalPrice,
                    endTime,
                    initiatorFee,
                    finalRate
                );
            } else if (uint192(finalPrice) / 1e14 <= data.stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsTP,
                        games[gameId].totalDepositsSL,
                        games[gameId].gameToken,
                        fee,
                        data.initiator
                    );
                emit SetupFinalized(
                    gameId,
                    false,
                    finalPrice,
                    endTime,
                    initiatorFee,
                    finalRate
                );
            }
        } else {
            require(
                uint192(finalPrice) / 1e14 >= data.stopLossPrice ||
                    uint192(finalPrice) / 1e14 <= data.takeProfitPrice,
                "Can't end"
            );
            if (uint192(finalPrice) / 1e14 >= data.stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsTP,
                        games[gameId].totalDepositsSL,
                        games[gameId].gameToken,
                        fee,
                        data.initiator
                    );
                emit SetupFinalized(
                    gameId,
                    false,
                    finalPrice,
                    endTime,
                    initiatorFee,
                    finalRate
                );
            } else if (uint192(finalPrice) / 1e14 <= data.takeProfitPrice) {
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsSL,
                        games[gameId].totalDepositsTP,
                        games[gameId].gameToken,
                        fee,
                        data.initiator
                    );
                emit SetupFinalized(
                    gameId,
                    true,
                    finalPrice,
                    endTime,
                    initiatorFee,
                    finalRate
                );
            }
        }

        uint256 packedData2 = games[gameId].packedData2;
        games[gameId].finalRate = finalRate;
        //rewrites endTime
        games[gameId].packedData =
            (games[gameId].packedData & ~(uint256(0xFFFFFFFF) << 192)) |
            (uint256(endTime) << 192);
        //rewrites status
        packedData2 =
            (packedData2 & ~(uint256(0xFF) << 72)) |
            (uint256(uint8(Status.Finished)) << 72);
        packedData2 |= uint256(uint192(finalPrice) / 1e14) << 145;
        games[gameId].packedData2 = packedData2;
    }

    function retrieveRewards(bytes32 gameId) public {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Finished, "Wrong status!");
        require(
            withdrawStatus[gameId][msg.sender] == UserStatus.TP ||
                withdrawStatus[gameId][msg.sender] == UserStatus.SL,
            "Already claimed"
        );
        if (data.isLong) {
            if (data.finalPrice >= data.takeProfitPrice) {
                require(
                    withdrawStatus[gameId][msg.sender] == UserStatus.TP,
                    "You lost"
                );
                withdrawStatus[gameId][msg.sender] = UserStatus.Claimed;
                ITreasury(treasury).distributeWithoutFee(
                    games[gameId].finalRate,
                    msg.sender,
                    games[gameId].gameToken,
                    fee,
                    depositAmounts[gameId][msg.sender]
                );
            } else if (data.finalPrice <= data.stopLossPrice) {
                // sl team wins
                require(
                    withdrawStatus[gameId][msg.sender] == UserStatus.SL,
                    "You lost"
                );
                withdrawStatus[gameId][msg.sender] = UserStatus.Claimed;
                ITreasury(treasury).distributeWithoutFee(
                    games[gameId].finalRate,
                    msg.sender,
                    games[gameId].gameToken,
                    fee,
                    depositAmounts[gameId][msg.sender]
                );
            }
        } else {
            if (data.finalPrice >= data.stopLossPrice) {
                // sl team wins
                require(
                    withdrawStatus[gameId][msg.sender] == UserStatus.SL,
                    "You lost"
                );
                withdrawStatus[gameId][msg.sender] = UserStatus.Claimed;
                ITreasury(treasury).distributeWithoutFee(
                    games[gameId].finalRate,
                    msg.sender,
                    games[gameId].gameToken,
                    fee,
                    depositAmounts[gameId][msg.sender]
                );
            } else if (data.finalPrice <= data.takeProfitPrice) {
                require(
                    withdrawStatus[gameId][msg.sender] == UserStatus.TP,
                    "You lost"
                );
                withdrawStatus[gameId][msg.sender] = UserStatus.Claimed;
                ITreasury(treasury).distributeWithoutFee(
                    games[gameId].finalRate,
                    msg.sender,
                    games[gameId].gameToken,
                    fee,
                    depositAmounts[gameId][msg.sender]
                );
            }
        }
        emit SetupRetrieved(
            gameId,
            msg.sender,
            depositAmounts[gameId][msg.sender]
        );
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
        gameData.startringPrice = uint256(uint32(packedData >> 224));

        gameData.takeProfitPrice = uint32(packedData2);
        gameData.stopLossPrice = uint256(uint32(packedData2 >> 32));
        gameData.feedNumber = uint8(packedData2 >> 64);
        gameData.gameStatus = Status(uint8(packedData2 >> 72));
        gameData.isLong = packedData2 >> 250 == 1;
        gameData.finalPrice = uint256(uint32(packedData2 >> 145));
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
        fee = newFee;
        emit NewFee(newFee);
    }

    /**
     * Turns game on/off
     */
    function toggleActive() public onlyRole(DEFAULT_ADMIN_ROLE) {
        isActive = !isActive;
    }
}
