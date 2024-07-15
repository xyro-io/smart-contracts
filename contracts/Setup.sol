// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Setup is AccessControl {
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
        uint256 initiatorFee
    );
    event SetupCreated(CreateSetup data);
    event SetupGameID(bytes32 gameId);

    enum Status {
        Created,
        Cancelled,
        Finished
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
    }

    struct GameInfo {
        address initiator;
        uint8 feedNumber;
        bool isLong;
        Status gameStatus;
        uint256 startTime;
        uint256 endTime;
        uint256 totalDepositsSL;
        uint256 totalDepositsTP;
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
        uint256 startringPrice;
        uint256 finalPrice;
    }

    struct GameInfoPacked {
        uint256 packedData;
        uint256 packedData2;
        address[] teamSL;
        address[] teamTP;
    }

    mapping(bytes32 => GameInfoPacked) public games;
    mapping(bytes32 => mapping(address => uint256)) public depositAmounts;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;
    address public treasury;

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
        bytes32 gameId = keccak256(
            abi.encodePacked(
                block.timestamp,
                endTime,
                takeProfitPrice,
                stopLossPrice
            )
        );
        (int192 startingPrice, uint32 startTime) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, feedNumber);
        if (isLong) {
            require(
                uint192(startingPrice) / 1e14 > stopLossPrice ||
                    uint192(startingPrice) / 1e14 < takeProfitPrice,
                "Wrong tp or sl price"
            );
        } else {
            require(
                uint192(startingPrice) / 1e14 < stopLossPrice ||
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
                msg.sender
            )
        );
    }

    /**
     * Participate in the game
     * @param isLong long or short?
     * @param gameId amount to deposit in the game
     * @param depositAmount game id
     */
    function play(bool isLong, uint256 depositAmount, bytes32 gameId) public {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Created, "Wrong status!");
        require(
            data.startTime + (data.endTime - data.startTime) / 3 >
                block.timestamp &&
                (data.totalDepositsSL + depositAmount <= type(uint32).max ||
                    data.totalDepositsTP + depositAmount <= type(uint32).max),
            "Game is closed for new players"
        );
        require(
            depositAmounts[gameId][msg.sender] == 0,
            "You are already in the game"
        );
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            games[gameId].teamTP.push(msg.sender);
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 113)) |
                ((depositAmount + data.totalDepositsTP) << 113);
        } else {
            games[gameId].teamSL.push(msg.sender);
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 81)) |
                ((depositAmount + data.totalDepositsSL) << 81);
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    }

    /**
     * Participate in the game with permit
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
                block.timestamp &&
                (data.totalDepositsSL + depositAmount <= type(uint32).max ||
                    data.totalDepositsTP + depositAmount <= type(uint32).max),
            "Game is closed for new players"
        );
        require(
            depositAmounts[gameId][msg.sender] == 0,
            "You are already in the game"
        );
        ITreasury(treasury).depositWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            games[gameId].teamTP.push(msg.sender);

            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 113)) |
                ((depositAmount + data.totalDepositsTP) << 113);
        } else {
            games[gameId].teamSL.push(msg.sender);
            games[gameId].packedData2 =
                (games[gameId].packedData2 & ~(uint256(0xFFFFFFFF) << 81)) |
                ((depositAmount + data.totalDepositsSL) << 81);
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    }

    /**
     * Closes setup game
     * @param gameId game id
     */
    function closeGame(bytes32 gameId) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory data = decodeData(gameId);
        require(data.startTime != 0, "Game doesn't exist");
        require(
            ((data.startTime + (data.endTime - data.startTime) / 3 <
                block.timestamp &&
                (games[gameId].teamSL.length == 0 ||
                    games[gameId].teamTP.length == 0)) ||
                block.timestamp > data.endTime),
            "Wrong status!"
        );
        for (uint i; i < games[gameId].teamSL.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[gameId][games[gameId].teamSL[i]],
                games[gameId].teamSL[i]
            );
        }
        for (uint i; i < games[gameId].teamTP.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[gameId][games[gameId].teamTP[i]],
                games[gameId].teamTP[i]
            );
        }
        //encode gamaStatus
        games[gameId].packedData2 =
            (games[gameId].packedData2 & ~(uint256(0xFF) << 72)) |
            (uint256(uint8(Status.Cancelled)) << 72);
        emit SetupCancelled(gameId, data.initiator);
    }

    /**
     * Finalizes setup game
     * @param unverifiedReport chainlink unverified report
     * @param gameId game id
     */
    function finalizeGame(
        bytes memory unverifiedReport,
        bytes32 gameId
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory data = decodeData(gameId);
        require(data.gameStatus == Status.Created, "Wrong status!");
        (int192 finalPrice, uint256 endTime) = IDataStreamsVerifier(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, data.feedNumber);

        if (
            games[gameId].teamSL.length == 0 || games[gameId].teamTP.length == 0
        ) {
            for (uint i; i < games[gameId].teamSL.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[gameId][games[gameId].teamSL[i]],
                    games[gameId].teamSL[i]
                );
            }
            for (uint i; i < games[gameId].teamTP.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[gameId][games[gameId].teamTP[i]],
                    games[gameId].teamTP[i]
                );
            }
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
                        data.totalDepositsSL,
                        data.totalDepositsTP,
                        data.initiator
                    );
                for (uint i; i < games[gameId].teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamTP[i],
                        depositAmounts[gameId][games[gameId].teamTP[i]]
                    );
                }
                emit SetupFinalized(
                    gameId,
                    true,
                    finalPrice,
                    endTime,
                    initiatorFee
                );
            } else if (uint192(finalPrice) / 1e14 <= data.stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        data.totalDepositsTP,
                        data.totalDepositsSL,
                        data.initiator
                    );
                for (uint i; i < games[gameId].teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamSL[i],
                        depositAmounts[gameId][games[gameId].teamSL[i]]
                    );
                }
                emit SetupFinalized(
                    gameId,
                    false,
                    finalPrice,
                    endTime,
                    initiatorFee
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
                        data.totalDepositsTP,
                        data.totalDepositsSL,
                        data.initiator
                    );

                for (uint i; i < games[gameId].teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamSL[i],
                        depositAmounts[gameId][games[gameId].teamSL[i]]
                    );
                }
                emit SetupFinalized(
                    gameId,
                    false,
                    finalPrice,
                    endTime,
                    initiatorFee
                );
            } else if (uint192(finalPrice) / 1e14 <= data.takeProfitPrice) {
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        data.totalDepositsSL,
                        data.totalDepositsTP,
                        data.initiator
                    );
                for (uint i; i < games[gameId].teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamTP[i],
                        depositAmounts[gameId][games[gameId].teamTP[i]]
                    );
                }
                emit SetupFinalized(
                    gameId,
                    true,
                    finalPrice,
                    endTime,
                    initiatorFee
                );
            }
        }

        uint256 packedData2 = games[gameId].packedData2;

        games[gameId].packedData =
            (games[gameId].packedData & ~(uint256(0xFFFFFFFF) << 192)) |
            (uint256(endTime) << 192);
        packedData2 =
            (packedData2 & ~(uint256(0xFF) << 72)) |
            (uint256(uint8(Status.Finished)) << 72);
        packedData2 |= uint256(uint192(finalPrice) / 1e14) << 145;
        games[gameId].packedData2 = packedData2;
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
        gameData.totalDepositsSL = uint256(uint32(packedData2 >> 81));
        gameData.totalDepositsTP = uint256(uint32(packedData2 >> 113));
        gameData.finalPrice = uint256(uint32(packedData2 >> 145));
    }

    /**
     * Returns amount of game participants
     * @param gameId game id
     */
    function getPlayersAmount(
        bytes32 gameId
    ) public view returns (uint256, uint256) {
        return (games[gameId].teamSL.length, games[gameId].teamTP.length);
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
