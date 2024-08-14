//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Bullseye is AccessControl {
    uint256 constant DENOMINATOR = 100;
    uint256 public exactRange = 100;
    uint256 public fee = 100;
    uint256[3] public rate = [50, 35, 15];
    uint256[3] public exactRate = [75, 15, 10];
    uint256[2] public twoPlayersRate = [75, 25];
    uint256[2] public twoPlayersExactRate = [80, 20];
    event BullseyeStart(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 endTime,
        uint32 depositAmount,
        uint8 feedNumber,
        bytes32 gameId
    );
    event BullseyeNewPlayer(
        address player,
        uint32 assetPrice,
        uint256 depositAmount,
        bytes32 gameId
    );
    event BullseyeFinalized(
        address[3] players,
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
        uint256 depositAmount;
    }

    address[] public players;
    mapping(address => uint32) public assetPrices;
    mapping(address => uint256) public playerTimestamp;

    uint256 packedData;
    bytes32 public currentGameId;
    address public treasury;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Starts bullseye game
     * @param endTime when the game iteration will end
     * @param depositAmount amount to enter the game
     */
    function startGame(
        uint32 endTime,
        uint32 stopPredictAt,
        uint32 depositAmount,
        uint8 feedNumber
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(packedData == 0, "Finish previous game first");
        require(depositAmount >= 10, "Wrong deposit amount");
        require(endTime > block.timestamp, "Wrong ending time");
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(endTime) << 64) |
            (uint256(feedNumber) << 96) |
            (uint256(depositAmount) << 104));
        currentGameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, address(this))
        );
        emit BullseyeStart(
            block.timestamp,
            stopPredictAt,
            endTime,
            depositAmount,
            feedNumber,
            currentGameId
        );
    }

    /**
     * Participate in bullseye game
     * @param assetPrice player's picked asset price
     */
    function play(uint32 assetPrice) public {
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        require(assetPrices[msg.sender] == 0, "You are already in the game");
        playerTimestamp[msg.sender] = block.timestamp;
        players.push(msg.sender);
        assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).deposit(game.depositAmount, msg.sender);
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            game.depositAmount,
            currentGameId
        );
    }

    /**
     * Participate in bullseye game with permit
     * @param assetPrice player's picked asset price
     */
    function playWithPermit(
        uint32 assetPrice,
        ITreasury.PermitData calldata permitData
    ) public {
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        require(assetPrices[msg.sender] == 0, "You are already in the game");
        playerTimestamp[msg.sender] = block.timestamp;
        players.push(msg.sender);
        assetPrices[msg.sender] = assetPrice;
        ITreasury(treasury).depositWithPermit(
            game.depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        emit BullseyeNewPlayer(
            msg.sender,
            assetPrice,
            game.depositAmount,
            currentGameId
        );
    }

    /**
     * Finalizes bullseye game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory game = decodeData();
        require(currentGameId != bytes32(0), "Start the game first");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (players.length < 2) {
            address player;
            if (players.length == 1) {
                player = players[0];
                ITreasury(treasury).refund(game.depositAmount, player);
                assetPrices[player] = 0;
                playerTimestamp[player] = 0;
                delete players;
            }
            emit BullseyeCancelled(currentGameId);
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
            priceTimestamp - game.endTime <= 10 minutes ||
                block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        if (players.length == 2) {
            address playerOne = players[0];
            address playerTwo = players[1];
            uint256 playerOneDiff = assetPrices[playerOne] > uint192(finalPrice)
                ? assetPrices[playerOne] - uint192(finalPrice)
                : uint192(finalPrice) - assetPrices[playerOne];
            uint256 playerTwoDiff = assetPrices[playerTwo] > uint192(finalPrice)
                ? assetPrices[playerTwo] - uint192(finalPrice)
                : uint192(finalPrice) - assetPrices[playerTwo];
            if (playerOneDiff < playerTwoDiff) {
                // player 1 closer
                uint256 wonAmountFirst = (2 *
                    game.depositAmount *
                    (
                        playerOneDiff <= exactRange
                            ? twoPlayersExactRate[0]
                            : twoPlayersRate[0]
                    )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountFirst,
                    playerOne,
                    game.depositAmount,
                    fee
                );
                uint256 wonAmountSecond = (2 *
                    game.depositAmount *
                    (
                        playerOneDiff <= exactRange
                            ? twoPlayersExactRate[1]
                            : twoPlayersRate[1]
                    )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountSecond,
                    playerTwo,
                    game.depositAmount,
                    fee
                );
                emit BullseyeFinalized(
                    [playerOne, playerTwo, address(0)],
                    finalPrice,
                    playerOneDiff <= exactRange,
                    currentGameId
                );
            } else {
                // player 2 closer
                uint256 wonAmountFirst = (2 *
                    game.depositAmount *
                    (
                        playerTwoDiff <= exactRange
                            ? twoPlayersExactRate[0]
                            : twoPlayersRate[0]
                    )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountFirst,
                    playerTwo,
                    game.depositAmount,
                    fee
                );
                uint256 wonAmountSecond = (2 *
                    game.depositAmount *
                    (
                        playerTwoDiff <= exactRange
                            ? twoPlayersExactRate[1]
                            : twoPlayersRate[1]
                    )) / DENOMINATOR;
                ITreasury(treasury).distribute(
                    wonAmountSecond,
                    playerOne,
                    game.depositAmount,
                    fee
                );
                emit BullseyeFinalized(
                    [playerTwo, playerOne, address(0)],
                    finalPrice,
                    playerTwoDiff <= exactRange,
                    currentGameId
                );
            }
        } else {
            address[3] memory topPlayers;
            uint256[3] memory closestDiff = [
                type(uint256).max,
                type(uint256).max,
                type(uint256).max
            ];
            for (uint256 j = 0; j < players.length; j++) {
                address currentAddress = players[j];
                uint256 currentGuess = assetPrices[currentAddress];
                uint256 currentDiff = currentGuess > uint192(finalPrice)
                    ? currentGuess - uint192(finalPrice)
                    : uint192(finalPrice) - currentGuess;
                uint256 currentTimestamp = playerTimestamp[currentAddress];
                for (uint256 i = 0; i < 3; i++) {
                    if (currentDiff < closestDiff[i]) {
                        for (uint256 k = 2; k > i; k--) {
                            closestDiff[k] = closestDiff[k - 1];
                            topPlayers[k] = topPlayers[k - 1];
                        }
                        closestDiff[i] = currentDiff;
                        topPlayers[i] = currentAddress;
                        break;
                    } else if (
                        currentDiff == closestDiff[i] &&
                        currentTimestamp < playerTimestamp[topPlayers[i]]
                    ) {
                        for (uint256 k = 2; k > i; k--) {
                            closestDiff[k] = closestDiff[k - 1];
                            topPlayers[k] = topPlayers[k - 1];
                        }
                        topPlayers[i] = currentAddress;
                        break;
                    }
                }
            }
            uint256 totalDeposited = game.depositAmount * players.length;
            uint256[3] memory wonAmount;
            if (closestDiff[0] <= exactRange) {
                wonAmount = exactRate;
            } else {
                wonAmount = rate;
            }
            for (uint256 i = 0; i < 3; i++) {
                if (topPlayers[i] != address(0)) {
                    ITreasury(treasury).distribute(
                        (totalDeposited * wonAmount[i]) / DENOMINATOR,
                        topPlayers[i],
                        game.depositAmount,
                        fee
                    );
                }
            }
            emit BullseyeFinalized(
                topPlayers,
                finalPrice,
                closestDiff[0] <= exactRange,
                currentGameId
            );
        }
        for (uint256 i = 0; i < players.length; i++) {
            assetPrices[players[i]] = 0;
            playerTimestamp[players[i]] = 0;
        }
        packedData = 0;
        currentGameId = bytes32(0);
        delete players;
    }

    /**
     * Closes game and makes refund
     */
    function closeGame() public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory game = decodeData();
        uint256 deposit = game.depositAmount;
        for (uint i; i < players.length; i++) {
            ITreasury(treasury).refund(deposit, players[i]);
            assetPrices[players[i]] = 0;
            playerTimestamp[players[i]] = 0;
        }
        emit BullseyeCancelled(currentGameId);
        packedData = 0;
        currentGameId = bytes32(0);
        delete players;
    }

    /**
     * Returns decoded game data
     */
    function decodeData() public view returns (GameInfo memory data) {
        data.startTime = uint256(uint32(packedData));
        data.stopPredictAt = uint256(uint32(packedData >> 32));
        data.endTime = uint256(uint32(packedData >> 64));
        data.feedNumber = uint8(packedData >> 96);
        data.depositAmount = uint256(uint32(packedData >> 104));
    }

    function getTotalPlayers() public view returns (uint256) {
        return players.length;
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
    }

    /**
     * Change exact range
     * @param newRange new exact range
     */
    function setExactRange(
        uint256 newRange
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        exactRange = newRange;
    }
}
