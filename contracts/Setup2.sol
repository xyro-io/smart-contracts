// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifierOptimized} from "./interfaces/IDataStreamsVerifierOptimized.sol";

contract Setup2 is AccessControl {
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
        uint8 feedId;
        uint32 startTime;
        uint32 endTime;
        uint24 startingPrice;
        uint24 takeProfitPrice;
        uint24 stopLossPrice;
        bool isLong;
        address creator;
    }

    struct GameInfo {
        address initiator;
        uint8 feedId;
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

    function createSetup(
        bool isLong,
        uint32 endTime,
        uint24 takeProfitPrice,
        uint24 stopLossPrice,
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
        bytes32 gameId = keccak256(
            abi.encodePacked(
                block.timestamp,
                endTime,
                takeProfitPrice,
                stopLossPrice
            )
        );
        (
            int192 startingPrice,
            uint32 startTime
        ) = IDataStreamsVerifierOptimized(ITreasury(treasury).upkeep())
                .verifyReportWithTimestamp(unverifiedReport, feedId);
        if (isLong) {
            require(
                uint192(startingPrice) > stopLossPrice ||
                    uint192(startingPrice) < takeProfitPrice,
                "Wrong tp or sl price"
            );
        } else {
            require(
                uint192(startingPrice) < stopLossPrice ||
                    uint192(startingPrice) > takeProfitPrice,
                "Wrong tp or sl price"
            );
        }

        GameInfoPacked memory data;
        data.packedData = uint256(uint160(msg.sender));
        data.packedData |= uint256(startTime) << 160;
        data.packedData |= uint256(endTime) << 192;
        data.packedData |=
            uint256(uint32(uint192(startingPrice / 1e18))) <<
            224;
        data.packedData2 = uint256(takeProfitPrice);
        data.packedData2 |= uint256(stopLossPrice) << 24;
        data.packedData2 |= uint256(feedId) << 48;
        data.packedData2 |= uint256(uint8(Status.Created)) << 56;
        data.packedData2 |= isLong ? uint256(1) << 64 : uint256(0) << 64;
        games[gameId] = data;
        emit SetupCreated(
            CreateSetup(
                gameId,
                feedId,
                startTime,
                endTime,
                uint24(uint192(startingPrice)),
                takeProfitPrice,
                stopLossPrice,
                isLong,
                msg.sender
            )
        );
    }

    function decodeData(
        bytes32 gameId
    ) public view returns (GameInfo memory gameData) {
        uint256 packedData = games[gameId].packedData;
        uint256 packedData2 = games[gameId].packedData2;
        gameData.initiator = address(uint160(packedData));
        gameData.startTime = uint256(uint32(packedData >> 160));
        gameData.endTime = uint256(uint32(packedData >> 192));
        gameData.startringPrice = uint256(uint32(packedData >> 224));

        gameData.takeProfitPrice = uint256(uint24(packedData2));
        gameData.stopLossPrice = uint256(uint32(packedData2 >> 24));
        gameData.feedId = uint8(packedData2 >> 48);
        gameData.gameStatus = Status(uint8(packedData2 >> 56));
        gameData.isLong = packedData2 >> 64 == 1;
        gameData.totalDepositsSL = uint256(uint32(packedData2 >> 65));
        gameData.totalDepositsTP = uint256(uint32(packedData2 >> 97));
    }

    function play(bool isLong, uint32 depositAmount, bytes32 gameId) public {
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
        ITreasury(treasury).deposit(uint256(depositAmount) * 1e18, msg.sender);
        depositAmounts[gameId][msg.sender] = depositAmount;
        if (isLong) {
            games[gameId].teamTP.push(msg.sender);
            games[gameId].packedData2 |=
                (depositAmount + data.totalDepositsTP) <<
                97;
        } else {
            games[gameId].teamSL.push(msg.sender);
            games[gameId].packedData2 |=
                (depositAmount + data.totalDepositsSL) <<
                65;
        }
        emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    }

    // function playWithPermit(
    //     bool isLong,
    //     uint256 depositAmount,
    //     bytes32 gameId,
    //     ITreasury.PermitData calldata permitData
    // ) public {
    //     require(games[gameId].gameStatus == Status.Created, "Wrong status!");
    //     require(
    //         games[gameId].startTime +
    //             (games[gameId].endTime - games[gameId].startTime) /
    //             3 >
    //             block.timestamp,
    //         "Game is closed for new players"
    //     );
    //     require(
    //         depositAmounts[gameId][msg.sender] == 0,
    //         "You are already in the game"
    //     );
    //     ITreasury(treasury).depositWithPermit(
    //         depositAmount,
    //         msg.sender,
    //         permitData.deadline,
    //         permitData.v,
    //         permitData.r,
    //         permitData.s
    //     );
    //     depositAmounts[gameId][msg.sender] = depositAmount;
    //     if (isLong) {
    //         games[gameId].teamTP.push(msg.sender);
    //         games[gameId].totalDepositsTP += depositAmount;
    //     } else {
    //         games[gameId].teamSL.push(msg.sender);
    //         games[gameId].totalDepositsSL += depositAmount;
    //     }
    //     emit SetupNewPlayer(gameId, isLong, depositAmount, msg.sender);
    // }

    // function closeGame(bytes32 gameId) public onlyRole(DEFAULT_ADMIN_ROLE) {
    //     require(games[gameId].startTime != 0, "Game doesn't exist");
    //     require(
    //         ((games[gameId].startTime +
    //             (games[gameId].endTime - games[gameId].startTime) /
    //             3 <
    //             block.timestamp &&
    //             (games[gameId].teamSL.length == 0 ||
    //                 games[gameId].teamTP.length == 0)) ||
    //             block.timestamp > games[gameId].endTime),
    //         "Wrong status!"
    //     );
    //     for (uint i; i < games[gameId].teamSL.length; i++) {
    //         ITreasury(treasury).refund(
    //             depositAmounts[gameId][games[gameId].teamSL[i]],
    //             games[gameId].teamSL[i]
    //         );
    //     }
    //     for (uint i; i < games[gameId].teamTP.length; i++) {
    //         ITreasury(treasury).refund(
    //             depositAmounts[gameId][games[gameId].teamTP[i]],
    //             games[gameId].teamTP[i]
    //         );
    //     }

    //     games[gameId].gameStatus = Status.Cancelled;
    //     emit SetupCancelled(gameId, games[gameId].initiator);
    // }

    // function finalizeGame(
    //     bytes memory unverifiedReport,
    //     bytes32 gameId
    // ) public onlyRole(DEFAULT_ADMIN_ROLE) {
    //     require(games[gameId].gameStatus == Status.Created, "Wrong status!");
    //     (int192 finalPrice, uint256 endTime) = IDataStreamsVerifier(
    //         ITreasury(treasury).upkeep()
    //     ).verifyReportWithTimestamp(unverifiedReport, games[gameId].feedId);

    //     if (
    //         games[gameId].teamSL.length == 0 || games[gameId].teamTP.length == 0
    //     ) {
    //         for (uint i; i < games[gameId].teamSL.length; i++) {
    //             ITreasury(treasury).refund(
    //                 depositAmounts[gameId][games[gameId].teamSL[i]],
    //                 games[gameId].teamSL[i]
    //             );
    //         }
    //         for (uint i; i < games[gameId].teamTP.length; i++) {
    //             ITreasury(treasury).refund(
    //                 depositAmounts[gameId][games[gameId].teamTP[i]],
    //                 games[gameId].teamTP[i]
    //             );
    //         }
    //         games[gameId].gameStatus = Status.Cancelled;
    //         games[gameId].finalPrice = finalPrice;
    //         emit SetupCancelled(gameId, games[gameId].initiator);
    //         return;
    //     }

    //     bool takeProfitWon;
    //     uint256 initiatorFee;
    //     uint256 finalRate;
    //     if (games[gameId].isLong) {
    //         require(
    //             finalPrice <= games[gameId].stopLossPrice ||
    //                 finalPrice >= games[gameId].takeProfitPrice,
    //             "Can't end"
    //         );
    //         if (finalPrice >= games[gameId].takeProfitPrice) {
    //             // tp team wins
    //             (finalRate, initiatorFee) = ITreasury(treasury)
    //                 .calculateSetupRate(
    //                     games[gameId].totalDepositsSL,
    //                     games[gameId].totalDepositsTP,
    //                     games[gameId].initiator
    //                 );
    //             for (uint i; i < games[gameId].teamTP.length; i++) {
    //                 ITreasury(treasury).distributeWithoutFee(
    //                     finalRate,
    //                     games[gameId].teamTP[i],
    //                     depositAmounts[gameId][games[gameId].teamTP[i]]
    //                 );
    //             }
    //             takeProfitWon = true;
    //         } else if (finalPrice <= games[gameId].stopLossPrice) {
    //             // sl team wins
    //             (finalRate, initiatorFee) = ITreasury(treasury)
    //                 .calculateSetupRate(
    //                     games[gameId].totalDepositsTP,
    //                     games[gameId].totalDepositsSL,
    //                     games[gameId].initiator
    //                 );
    //             for (uint i; i < games[gameId].teamSL.length; i++) {
    //                 ITreasury(treasury).distributeWithoutFee(
    //                     finalRate,
    //                     games[gameId].teamSL[i],
    //                     depositAmounts[gameId][games[gameId].teamSL[i]]
    //                 );
    //             }
    //         }
    //     } else {
    //         require(
    //             finalPrice >= games[gameId].stopLossPrice ||
    //                 finalPrice <= games[gameId].takeProfitPrice,
    //             "Can't end"
    //         );
    //         if (finalPrice >= games[gameId].stopLossPrice) {
    //             // sl team wins
    //             (finalRate, initiatorFee) = ITreasury(treasury)
    //                 .calculateSetupRate(
    //                     games[gameId].totalDepositsTP,
    //                     games[gameId].totalDepositsSL,
    //                     games[gameId].initiator
    //                 );

    //             for (uint i; i < games[gameId].teamSL.length; i++) {
    //                 ITreasury(treasury).distributeWithoutFee(
    //                     finalRate,
    //                     games[gameId].teamSL[i],
    //                     depositAmounts[gameId][games[gameId].teamSL[i]]
    //                 );
    //             }
    //         } else if (finalPrice <= games[gameId].takeProfitPrice) {
    //             (finalRate, initiatorFee) = ITreasury(treasury)
    //                 .calculateSetupRate(
    //                     games[gameId].totalDepositsSL,
    //                     games[gameId].totalDepositsTP,
    //                     games[gameId].initiator
    //                 );
    //             for (uint i; i < games[gameId].teamTP.length; i++) {
    //                 ITreasury(treasury).distributeWithoutFee(
    //                     finalRate,
    //                     games[gameId].teamTP[i],
    //                     depositAmounts[gameId][games[gameId].teamTP[i]]
    //                 );
    //             }
    //             takeProfitWon = true;
    //         }
    //     }
    //     games[gameId].endTime = endTime;
    //     games[gameId].finalPrice = finalPrice;
    //     games[gameId].gameStatus = Status.Finished;
    //     emit SetupFinalized(
    //         gameId,
    //         takeProfitWon,
    //         finalPrice,
    //         endTime,
    //         initiatorFee
    //     );
    // }

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
