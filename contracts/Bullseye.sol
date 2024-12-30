//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Bullseye is AccessControl {
    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    uint256 constant DENOMINATOR = 10000;
    uint256 public exactRange = 50000;
    uint256 public fee = 1000;
    uint256 public maxPlayers = 100;
    uint256[3][5] public rates = [
        [10000, 0, 0],
        [7500, 2500, 0],
        [9000, 1000, 0],
        [5000, 3500, 1500],
        [7500, 1500, 1000]
    ];
    event NewBullseyeRates(uint256[3] rate, uint256 playersCount, bool isExact);
    event NewMaxPlayers(uint256 newMax);
    event NewTreasury(address newTreasury);
    event NewFee(uint256 newFee);
    event NewExactRange(uint256 newExactRange);
    event BullseyeStart(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 endTime,
        uint256 depositAmount,
        uint8 feedNumber,
        address token,
        bytes32 gameId
    );
    event BullseyeNewPlayer(
        address player,
        uint256 assetPrice,
        uint256 depositAmount,
        bytes32 gameId,
        uint256 index,
        uint256 rakeback
    );
    event BullseyeFinalized(
        address[3] players,
        uint256[3] topIndexes,
        int192 finalPrice,
        bool isExact,
        bytes32 gameId
    );
    event BullseyeCancelled(bytes32 gameId);

    struct GameInfo {
        uint8 feedNumber;
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
    }

    struct GuessStruct {
        address player;
        uint256 assetPrice;
        uint256 timestamp;
        uint256 rakeback;
    }

    GuessStruct[] public playerGuessData;
    uint256 packedData;
    uint256 constant timeGap = 30 seconds;
    uint256 public depositAmount;
    uint256 public totalRakeback;
    bytes32 public currentGameId;
    address public treasury;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Starts bullseye game
     * @param endTime when the game iteration will end
     * @param stopPredictAt time when players can't enter the game
     * @param newDepositAmount amount to enter the game
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     * @param token token for game deposits
     */
    function startGame(
        uint32 endTime,
        uint32 stopPredictAt,
        uint256 newDepositAmount,
        uint8 feedNumber,
        address token
    ) public onlyRole(GAME_MASTER_ROLE) {
        require(packedData == 0, "Finish previous game first");
        require(endTime - block.timestamp > timeGap, "Wrong ending time");
        require(
            endTime - stopPredictAt >= timeGap,
            "Timeframe gap must be higher"
        );
        require(
            newDepositAmount >= ITreasury(treasury).minDepositAmount(token),
            "Wrong min deposit amount"
        );
        require(
            IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                feedNumber
            ) != bytes32(0),
            "Wrong feed number"
        );
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(endTime) << 64) |
            (uint256(feedNumber) << 96));
        currentGameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, address(this))
        );
        depositAmount = newDepositAmount;
        ITreasury(treasury).setGameToken(currentGameId, token);
        emit BullseyeStart(
            block.timestamp,
            stopPredictAt,
            endTime,
            newDepositAmount,
            feedNumber,
            token,
            currentGameId
        );
    }

    /**
     * Participate in bullseye game and deposit funds
     * @param assetPrice player's picked asset price
     */
    function play(uint256 assetPrice) public {
        GameInfo memory game = decodeData();
        require(
            playerGuessData.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        uint256 rakeback = ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );
        playerGuessData.push(
            GuessStruct({
                player: msg.sender,
                assetPrice: assetPrice,
                timestamp: block.timestamp,
                rakeback: rakeback
            })
        );
        totalRakeback += rakeback;
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            depositAmount,
            currentGameId,
            playerGuessData.length - 1,
            rakeback
        );
    }

    /**
     * Participate in bullseye game with deposited funds
     * @param assetPrice player's picked asset price
     */
    function playWithDeposit(uint256 assetPrice) public {
        GameInfo memory game = decodeData();
        require(
            playerGuessData.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        uint256 rakeback = ITreasury(treasury).lock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );
        playerGuessData.push(
            GuessStruct({
                player: msg.sender,
                assetPrice: assetPrice,
                timestamp: block.timestamp,
                rakeback: rakeback
            })
        );
        totalRakeback += rakeback;
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            depositAmount,
            currentGameId,
            playerGuessData.length - 1,
            rakeback
        );
    }

    /**
     * Participate in bullseye game and deposit funds with permit
     * @param assetPrice player's picked asset price
     */
    function playWithPermit(
        uint256 assetPrice,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory game = decodeData();
        require(
            playerGuessData.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        uint256 rakeback = totalRakeback += ITreasury(treasury)
            .depositAndLockWithPermit(
                depositAmount,
                msg.sender,
                currentGameId,
                true,
                permitData.deadline,
                permitData.v,
                permitData.r,
                permitData.s
            );
        playerGuessData.push(
            GuessStruct({
                player: msg.sender,
                assetPrice: assetPrice,
                timestamp: block.timestamp,
                rakeback: rakeback
            })
        );
        totalRakeback += rakeback;
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            depositAmount,
            currentGameId,
            playerGuessData.length - 1,
            rakeback
        );
    }

    /**
     * Finalizes bullseye game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes memory unverifiedReport
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData();
        require(currentGameId != bytes32(0), "Start the game first");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (playerGuessData.length < 2) {
            emit BullseyeCancelled(currentGameId);
            if (playerGuessData.length == 1) {
                GuessStruct memory currentGuessData = playerGuessData[0];
                ITreasury(treasury).refund(
                    depositAmount,
                    currentGuessData.player,
                    currentGameId
                );
                delete playerGuessData;
            }
            totalRakeback = 0;
            packedData = 0;
            currentGameId = bytes32(0);
            return;
        }

        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        require(
            priceTimestamp - game.endTime <= 1 minutes,
            "Old chainlink report"
        );
        uint256[3] memory topIndexes;
        address[3] memory topPlayers;
        uint256[3] memory topTimestamps;
        uint256[3] memory topRakeback;
        uint256[3] memory closestDiff = [
            type(uint256).max,
            type(uint256).max,
            type(uint256).max
        ];
        for (uint256 j = 0; j < playerGuessData.length; j++) {
            GuessStruct memory currentGuessData = playerGuessData[j];
            uint256 currentDiff = currentGuessData.assetPrice >
                uint192(finalPrice)
                ? currentGuessData.assetPrice - uint192(finalPrice)
                : uint192(finalPrice) - currentGuessData.assetPrice;
            for (uint256 i = 0; i < 3; i++) {
                if (currentDiff < closestDiff[i]) {
                    for (uint256 k = 2; k > i; k--) {
                        closestDiff[k] = closestDiff[k - 1];
                        topPlayers[k] = topPlayers[k - 1];
                        topIndexes[k] = topIndexes[k - 1];
                        topRakeback[k] = topRakeback[k - 1];
                    }
                    closestDiff[i] = currentDiff;
                    topPlayers[i] = currentGuessData.player;
                    topTimestamps[i] = currentGuessData.timestamp;
                    topIndexes[i] = j;
                    topRakeback[i] = currentGuessData.rakeback;
                    break;
                } else if (
                    //write top timestamps
                    currentDiff == closestDiff[i] &&
                    currentGuessData.timestamp < topTimestamps[i]
                ) {
                    for (uint256 k = 2; k > i; k--) {
                        closestDiff[k] = closestDiff[k - 1];
                        topPlayers[k] = topPlayers[k - 1];
                        topIndexes[k] = topIndexes[k - 1];
                        topRakeback[k] = topRakeback[k - 1];
                    }
                    topIndexes[i] = j;
                    topPlayers[i] = currentGuessData.player;
                    topRakeback[i] = currentGuessData.rakeback;
                    topTimestamps[i] = currentGuessData.timestamp;
                    break;
                }
            }
        }
        uint256 totalDeposited = depositAmount * playerGuessData.length;
        uint256[3] memory currentRates;
        if (playerGuessData.length <= 5) {
            ITreasury(treasury).withdrawGameFee(
                totalDeposited - depositAmount,
                fee,
                currentGameId
            );
            currentRates = rates[0];
        } else if (playerGuessData.length <= 10) {
            ITreasury(treasury).withdrawGameFee(
                totalDeposited - 2 * depositAmount,
                fee,
                currentGameId
            );
            currentRates = closestDiff[0] <= exactRange ? rates[2] : rates[1];
        } else {
            ITreasury(treasury).withdrawGameFee(
                totalDeposited - 3 * depositAmount,
                fee,
                currentGameId
            );
            currentRates = closestDiff[0] <= exactRange ? rates[4] : rates[3];
        }

        uint256 winnersRakeback;
        for (uint i = 0; i < 3; i++) {
            if (currentRates[i] != 0) {
                winnersRakeback += ITreasury(treasury).lockedRakeback(
                    currentGameId,
                    topPlayers[i]
                );
            }
        }

        for (uint256 i = 0; i < 3; i++) {
            if (topPlayers[i] != address(0)) {
                if (currentRates[i] != 0) {
                    ITreasury(treasury).distributeBullseye(
                        currentRates[i],
                        totalRakeback - winnersRakeback,
                        topPlayers[i],
                        currentGameId,
                        topRakeback[i]
                    );
                }
            }
        }
        ITreasury(treasury).bullseyeResetLockedAmount(currentGameId);
        emit BullseyeFinalized(
            topPlayers,
            topIndexes,
            finalPrice,
            closestDiff[0] <= exactRange,
            currentGameId
        );
        packedData = 0;
        totalRakeback = 0;
        ITreasury(treasury).setGameFinished(currentGameId);
        currentGameId = bytes32(0);
        delete playerGuessData;
    }

    /**
     * Closes game and makes refund
     */
    function closeGame() public onlyRole(GAME_MASTER_ROLE) {
        require(packedData != 0, "Game not started");
        uint256 deposit = depositAmount;
        for (uint i; i < playerGuessData.length; i++) {
            GuessStruct memory currentGuessData = playerGuessData[i];
            ITreasury(treasury).refund(
                deposit,
                currentGuessData.player,
                currentGameId
            );
        }
        emit BullseyeCancelled(currentGameId);
        totalRakeback = 0;
        packedData = 0;
        currentGameId = bytes32(0);
        delete playerGuessData;
    }

    /**
     * Returns decoded game data
     */
    function decodeData() public view returns (GameInfo memory data) {
        data.startTime = uint256(uint32(packedData));
        data.stopPredictAt = uint256(uint32(packedData >> 32));
        data.endTime = uint256(uint32(packedData >> 64));
        data.feedNumber = uint8(packedData >> 96);
    }

    function getTotalPlayers() public view returns (uint256) {
        return playerGuessData.length;
    }

    /**
     * Change maximum players number
     * @param newMax new maximum number
     */
    function setMaxPlayers(uint256 newMax) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPlayers = newMax;
        emit NewMaxPlayers(newMax);
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
     * Change exact range
     * @param newRange new exact range
     */
    function setExactRange(
        uint256 newRange
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        exactRange = newRange;
        emit NewExactRange(newRange);
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

    function getRateIndex(
        uint256 playersCount,
        bool isExact
    ) public pure returns (uint256 index) {
        if (playersCount <= 5) {
            index = isExact ? 1 : 0;
        } else if (playersCount <= 10) {
            index = isExact ? 3 : 2;
        } else {
            index = isExact ? 5 : 4;
        }
    }

    function setRate(
        uint256[3] memory rate,
        uint256 playersCount,
        bool isExact
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        rates[getRateIndex(playersCount, isExact)] = rate;
        emit NewBullseyeRates(rate, playersCount, isExact);
    }
}

interface IERC20 {
    function decimals() external view returns (uint256);
}
