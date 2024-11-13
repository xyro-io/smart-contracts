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
    uint256[3][6] public rates = [
        [9000, 1000, 0],
        [10000, 0, 0],
        [7500, 2500, 0],
        [9000, 1000, 0],
        [5000, 3500, 1500],
        [7500, 1500, 1000]
    ];
    event NewTreasury(address newTreasury);
    event NewFee(uint256 newFee);
    event NewExactRange(uint256 newExactRange);
    event BullseyeStart(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 endTime,
        uint256 depositAmount,
        uint8 feedNumber,
        address gameToken,
        bytes32 gameId
    );
    event BullseyeNewPlayer(
        address player,
        uint32 assetPrice,
        uint256 depositAmount,
        bytes32 gameId,
        uint256 index
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
    }

    uint256[] packedGuessData;
    uint256 packedData;

    uint256 public depositAmount;
    bytes32 public currentGameId;
    address public treasury;
    address public gameToken;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Starts bullseye game
     * @param endTime when the game iteration will end
     * @param depositAmount_ amount to enter the game
     */
    function startGame(
        uint32 endTime,
        uint32 stopPredictAt,
        uint256 depositAmount_,
        uint8 feedNumber,
        address token
    ) public onlyRole(GAME_MASTER_ROLE) {
        require(packedData == 0, "Finish previous game first");
        require(endTime > block.timestamp, "Wrong ending time");
        require(token != address(0), "Token must be set");
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(endTime) << 64) |
            (uint256(feedNumber) << 96));
        currentGameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, address(this))
        );
        depositAmount = depositAmount_;
        gameToken = token;
        emit BullseyeStart(
            block.timestamp,
            stopPredictAt,
            endTime,
            depositAmount_,
            feedNumber,
            token,
            currentGameId
        );
    }

    /**
     * Participate in bullseye game and deposit funds
     * @param assetPrice player's picked asset price
     */
    function play(uint32 assetPrice) public {
        GameInfo memory game = decodeData();
        require(
            packedGuessData.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        uint256 packedGuess = uint256(uint160(msg.sender)) |
            (block.timestamp << 160) |
            (uint256(assetPrice) << 192);
        packedGuessData.push(packedGuess);
        ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            gameToken
        );
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            depositAmount,
            currentGameId,
            packedGuessData.length - 1
        );
    }

    /**
     * Participate in bullseye game with deposited funds
     * @param assetPrice player's picked asset price
     */
    function playWithDeposit(uint32 assetPrice) public {
        GameInfo memory game = decodeData();
        require(
            packedGuessData.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        uint256 packedGuess = uint256(uint160(msg.sender)) |
            (block.timestamp << 160) |
            (uint256(assetPrice) << 192);
        packedGuessData.push(packedGuess);
        ITreasury(treasury).lock(depositAmount, msg.sender, gameToken);
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            depositAmount,
            currentGameId,
            packedGuessData.length - 1
        );
    }

    /**
     * Participate in bullseye game and deposit funds with permit
     * @param assetPrice player's picked asset price
     */
    function playWithPermit(
        uint32 assetPrice,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory game = decodeData();
        require(
            packedGuessData.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        uint256 packedGuess = uint256(uint160(msg.sender)) |
            (block.timestamp << 160) |
            (uint256(assetPrice) << 192);
        packedGuessData.push(packedGuess);
        ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            gameToken,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            depositAmount,
            currentGameId,
            packedGuessData.length - 1
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
        if (packedGuessData.length < 2) {
            if (packedGuessData.length == 1) {
                GuessStruct memory playerGuessData = decodeGuess(0);
                emit BullseyeCancelled(currentGameId);
                ITreasury(treasury).refund(
                    depositAmount,
                    playerGuessData.player,
                    gameToken
                );
                delete packedGuessData;
            }
            packedData = 0;
            currentGameId = bytes32(0);
            return;
        }

        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        finalPrice /= 1e14;
        require(
            priceTimestamp - game.endTime <= 1 minutes,
            "Old chainlink report"
        );
        if (packedGuessData.length == 2) {
            GuessStruct memory playerOneGuessData = decodeGuess(0);

            GuessStruct memory playerTwoGuessData = decodeGuess(1);
            uint256 playerOneDiff = playerOneGuessData.assetPrice >
                uint192(finalPrice)
                ? playerOneGuessData.assetPrice - uint192(finalPrice)
                : uint192(finalPrice) - playerOneGuessData.assetPrice;
            uint256 playerTwoDiff = playerTwoGuessData.assetPrice >
                uint192(finalPrice)
                ? playerTwoGuessData.assetPrice - uint192(finalPrice)
                : uint192(finalPrice) - playerTwoGuessData.assetPrice;
            if (playerOneDiff < playerTwoDiff) {
                // player 1 closer
                if (playerOneDiff > exactRange) {
                    uint256 wonAmountFirst = (2 * depositAmount * rates[0][0]) /
                        DENOMINATOR;
                    ITreasury(treasury).distributeBullseye(
                        wonAmountFirst,
                        playerOneGuessData.player,
                        gameToken,
                        fee
                    );
                    uint256 wonAmountSecond = 2 *
                        depositAmount -
                        wonAmountFirst;
                    ITreasury(treasury).distributeBullseye(
                        wonAmountSecond,
                        playerTwoGuessData.player,
                        gameToken,
                        fee
                    );
                } else {
                    ITreasury(treasury).distributeBullseye(
                        2 * depositAmount,
                        playerOneGuessData.player,
                        gameToken,
                        fee
                    );
                }
                emit BullseyeFinalized(
                    [
                        playerOneGuessData.player,
                        playerTwoGuessData.player,
                        address(0)
                    ],
                    [uint256(0), uint256(1), uint256(0)],
                    finalPrice,
                    playerOneDiff <= exactRange,
                    currentGameId
                );
            } else {
                // player 2 closer
                if (playerTwoDiff > exactRange) {
                    uint256 wonAmountFirst = (2 * depositAmount * rates[0][0]) /
                        DENOMINATOR;
                    ITreasury(treasury).distributeBullseye(
                        wonAmountFirst,
                        playerTwoGuessData.player,
                        gameToken,
                        fee
                    );
                    uint256 wonAmountSecond = 2 *
                        depositAmount -
                        wonAmountFirst;
                    ITreasury(treasury).distributeBullseye(
                        wonAmountSecond,
                        playerOneGuessData.player,
                        gameToken,
                        fee
                    );
                } else {
                    ITreasury(treasury).distributeBullseye(
                        2 * depositAmount,
                        playerTwoGuessData.player,
                        gameToken,
                        fee
                    );
                }
                emit BullseyeFinalized(
                    [
                        playerTwoGuessData.player,
                        playerOneGuessData.player,
                        address(0)
                    ],
                    [uint256(1), uint256(0), uint256(0)],
                    finalPrice,
                    playerTwoDiff <= exactRange,
                    currentGameId
                );
            }
        } else {
            uint256[3] memory topIndexes;
            address[3] memory topPlayers;
            uint256[3] memory topTimestamps;
            uint256[3] memory closestDiff = [
                type(uint256).max,
                type(uint256).max,
                type(uint256).max
            ];
            for (uint256 j = 0; j < packedGuessData.length; j++) {
                GuessStruct memory playerGuessData = decodeGuess(j);
                uint256 currentDiff = playerGuessData.assetPrice >
                    uint192(finalPrice)
                    ? playerGuessData.assetPrice - uint192(finalPrice)
                    : uint192(finalPrice) - playerGuessData.assetPrice;
                for (uint256 i = 0; i < 3; i++) {
                    if (currentDiff < closestDiff[i]) {
                        for (uint256 k = 2; k > i; k--) {
                            closestDiff[k] = closestDiff[k - 1];
                            topPlayers[k] = topPlayers[k - 1];
                            topIndexes[k] = topIndexes[k - 1];
                        }
                        closestDiff[i] = currentDiff;
                        topPlayers[i] = playerGuessData.player;
                        topTimestamps[i] = playerGuessData.timestamp;
                        topIndexes[i] = j;
                        break;
                    } else if (
                        //write top timestamps
                        currentDiff == closestDiff[i] &&
                        playerGuessData.timestamp < topTimestamps[i]
                    ) {
                        for (uint256 k = 2; k > i; k--) {
                            closestDiff[k] = closestDiff[k - 1];
                            topPlayers[k] = topPlayers[k - 1];
                            topIndexes[k] = topIndexes[k - 1];
                        }
                        topIndexes[i] = j;
                        topPlayers[i] = playerGuessData.player;
                        break;
                    }
                }
            }
            uint256 totalDeposited = depositAmount * packedGuessData.length;
            uint256[3] memory wonAmount;
            if (closestDiff[0] <= exactRange) {
                if (packedGuessData.length <= 5) {
                    wonAmount = rates[1];
                } else if (packedGuessData.length <= 10) {
                    wonAmount = rates[3];
                } else {
                    wonAmount = rates[5];
                }
            } else {
                if (packedGuessData.length <= 5) {
                    wonAmount = rates[0];
                } else if (packedGuessData.length <= 10) {
                    wonAmount = rates[2];
                } else {
                    wonAmount = rates[4];
                }
            }
            for (uint256 i = 0; i < 3; i++) {
                if (topPlayers[i] != address(0)) {
                    if (wonAmount[i] != 0) {
                        if (i != 3) {
                            ITreasury(treasury).distributeBullseye(
                                (totalDeposited * wonAmount[i]) / DENOMINATOR,
                                topPlayers[i],
                                gameToken,
                                fee
                            );
                        } else {
                            ITreasury(treasury).distributeBullseye(
                                totalDeposited -
                                    ((totalDeposited * wonAmount[0]) /
                                        DENOMINATOR +
                                        (totalDeposited * wonAmount[1]) /
                                        DENOMINATOR),
                                topPlayers[i],
                                gameToken,
                                fee
                            );
                        }
                    }
                }
            }
            emit BullseyeFinalized(
                topPlayers,
                topIndexes,
                finalPrice,
                closestDiff[0] <= exactRange,
                currentGameId
            );
        }
        packedData = 0;
        currentGameId = bytes32(0);
        delete packedGuessData;
    }

    /**
     * Closes game and makes refund
     */
    function closeGame() public onlyRole(GAME_MASTER_ROLE) {
        require(packedData != 0, "Game not started");
        uint256 deposit = depositAmount;
        for (uint i; i < packedGuessData.length; i++) {
            GuessStruct memory playerGuessData = decodeGuess(i);
            ITreasury(treasury).refund(
                deposit,
                playerGuessData.player,
                gameToken
            );
        }
        emit BullseyeCancelled(currentGameId);
        packedData = 0;
        currentGameId = bytes32(0);
        delete packedGuessData;
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

    /**
     * Returns decoded guess packed data
     */
    function decodeGuess(
        uint256 index
    ) public view returns (GuessStruct memory data) {
        uint256 guessData = packedGuessData[index];
        data.player = address(uint160(guessData));
        data.timestamp = uint256(uint32(guessData >> 160));
        data.assetPrice = uint256(uint32(guessData >> 192));
    }

    function getTotalPlayers() public view returns (uint256) {
        return packedGuessData.length;
    }

    /**
     * Change maximum players number
     * @param newMax new maximum number
     */
    function setMaxPlayers(uint256 newMax) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPlayers = newMax;
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
    }
}

interface IERC20 {
    function decimals() external view returns (uint256);
}
