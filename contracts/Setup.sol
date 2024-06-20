// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IMockUpkeep} from "./interfaces/IMockUpkeep.sol";

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
    event SetupCreated(
        bytes32 gameId,
        bytes32 feedId,
        uint256 startTime,
        uint256 endTime,
        int192 startingPrice,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        bool isLong,
        address creator
    );

    enum Status {
        Created,
        Cancelled,
        Finished
    }

    struct GameInfo {
        bytes32 feedId;
        address initiator;
        uint256 startTime;
        uint256 endTime;
        bool isLong;
        uint256 totalDepositsSL;
        uint256 totalDepositsTP;
        int192 takeProfitPrice;
        int192 stopLossPrice;
        int192 startringPrice;
        int192 finalPrice;
        address[] teamSL;
        address[] teamTP;
        Status gameStatus;
    }

    mapping(bytes32 => GameInfo) public games;
    mapping(bytes32 => mapping(address => uint256)) public depositAmounts;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;
    address public treasury;

    constructor(address newTreasury) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        treasury = newTreasury;
    }

    function createSetup(
        bool isLong,
        uint256 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
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
        bytes32 gameId = keccak256(
            abi.encodePacked(
                block.timestamp,
                endTime,
                takeProfitPrice,
                stopLossPrice
            )
        );
        GameInfo memory newGame = games[gameId];
        (newGame.startringPrice, newGame.startTime) = IMockUpkeep(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, feedId);
        if (isLong) {
            require(
                newGame.startringPrice > stopLossPrice ||
                    newGame.startringPrice < takeProfitPrice,
                "Wrong tp or sl price"
            );
        } else {
            require(
                newGame.startringPrice < stopLossPrice ||
                    newGame.startringPrice > takeProfitPrice,
                "Wrong tp or sl price"
            );
        }
        newGame.isLong = isLong;
        newGame.initiator = msg.sender;
        newGame.endTime = endTime;
        newGame.stopLossPrice = stopLossPrice;
        newGame.takeProfitPrice = takeProfitPrice;
        newGame.gameStatus = Status.Created;
        newGame.feedId = feedId;
        games[gameId] = newGame;
        emit SetupCreated(
            gameId,
            feedId,
            newGame.startTime,
            endTime,
            newGame.startringPrice,
            takeProfitPrice,
            stopLossPrice,
            isLong,
            msg.sender
        );
    }

    function play(bool isLong, uint256 depositAmount, bytes32 gameId) public {
        require(games[gameId].gameStatus == Status.Created, "Wrong status!");
        require(
            games[gameId].startTime +
                (games[gameId].endTime - games[gameId].startTime) /
                3 >
                block.timestamp,
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
            games[gameId].totalDepositsTP += depositAmount;
        } else {
            games[gameId].teamSL.push(msg.sender);
            games[gameId].totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    }

    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        bytes32 gameId,
        ITreasury.PermitData calldata permitData
    ) public {
        require(games[gameId].gameStatus == Status.Created, "Wrong status!");
        require(
            games[gameId].startTime +
                (games[gameId].endTime - games[gameId].startTime) /
                3 >
                block.timestamp,
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
            games[gameId].totalDepositsTP += depositAmount;
        } else {
            games[gameId].teamSL.push(msg.sender);
            games[gameId].totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    }

    function closeGame(bytes32 gameId) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            ((games[gameId].startTime +
                (games[gameId].endTime - games[gameId].startTime) /
                3 <
                block.timestamp &&
                (games[gameId].teamSL.length == 0 ||
                    games[gameId].teamTP.length == 0)) ||
                block.timestamp > games[gameId].endTime),
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

        games[gameId].gameStatus = Status.Cancelled;
        emit SetupCancelled(gameId, games[gameId].initiator);
    }

    function finalizeGame(
        bytes memory unverifiedReport,
        bytes32 gameId
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(games[gameId].gameStatus == Status.Created, "Wrong status!");
        (int192 finalPrice, uint256 endTime) = IMockUpkeep(
            ITreasury(treasury).upkeep()
        ).verifyReportWithTimestamp(unverifiedReport, games[gameId].feedId);

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
            games[gameId].gameStatus = Status.Cancelled;
            games[gameId].finalPrice = finalPrice;
            emit SetupCancelled(gameId, games[gameId].initiator);
            return;
        }

        bool takeProfitWon;
        uint256 initiatorFee;
        uint256 finalRate;
        if (games[gameId].isLong) {
            require(
                finalPrice <= games[gameId].stopLossPrice ||
                    finalPrice >= games[gameId].takeProfitPrice,
                "Can't end"
            );
            if (finalPrice >= games[gameId].takeProfitPrice) {
                // tp team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsSL,
                        games[gameId].totalDepositsTP,
                        games[gameId].initiator
                    );
                for (uint i; i < games[gameId].teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamTP[i],
                        depositAmounts[gameId][games[gameId].teamTP[i]]
                    );
                }
                takeProfitWon = true;
            } else if (finalPrice <= games[gameId].stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsTP,
                        games[gameId].totalDepositsSL,
                        games[gameId].initiator
                    );
                for (uint i; i < games[gameId].teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamSL[i],
                        depositAmounts[gameId][games[gameId].teamSL[i]]
                    );
                }
            }
        } else {
            require(
                finalPrice >= games[gameId].stopLossPrice ||
                    finalPrice <= games[gameId].takeProfitPrice,
                "Can't end"
            );
            if (finalPrice >= games[gameId].stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsTP,
                        games[gameId].totalDepositsSL,
                        games[gameId].initiator
                    );

                for (uint i; i < games[gameId].teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamSL[i],
                        depositAmounts[gameId][games[gameId].teamSL[i]]
                    );
                }
            } else if (finalPrice <= games[gameId].takeProfitPrice) {
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
                        games[gameId].totalDepositsSL,
                        games[gameId].totalDepositsTP,
                        games[gameId].initiator
                    );
                for (uint i; i < games[gameId].teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        games[gameId].teamTP[i],
                        depositAmounts[gameId][games[gameId].teamTP[i]]
                    );
                }
                takeProfitWon = true;
            }
        }
        games[gameId].endTime = endTime;
        games[gameId].finalPrice = finalPrice;
        games[gameId].gameStatus = Status.Finished;
        emit SetupFinalized(
            gameId,
            takeProfitWon,
            finalPrice,
            endTime,
            initiatorFee
        );
    }

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
