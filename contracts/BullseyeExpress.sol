// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract BullseyeExpress is AccessControl {
    event NewMaxPlayersAmount(uint256 newMax);
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event BullseyeExpressCreated(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 priceTimeGap,
        uint8 feedNumber,
        uint8 numberOfGuesses,
        bytes32 gameId,
        address token
    );
    event BullseyeExpressNewPlayer(
        address player,
        uint256[] isLong,
        uint256 depositAmount,
        bytes32 gameId,
        uint256 rakeback
    );
    event BullseyeExpressStarted(int192 startingPrice, bytes32 gameId);
    //нужно ли сюда собирать финальные результаты по типу [up,down,down,up];
    event BullseyeExpressFinalized(int192[] finalPrices, bytes32 gameId);
    event BullseyeExpressCancelled(bytes32 gameId);

    struct GameInfo {
        uint256 startTime;
        uint256 priceTimeGap;
        uint256 stopPredictAt;
        uint8 feedNumber;
        uint8 numberOfGuesses;
    }

    uint256 constant timeGap = 60 seconds;
    uint256 packedData;
    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    address[] public players;
    mapping(address => bool) public isParticipating;
    mapping(address => uint256) public depositAmounts;
    mapping(address => uint256[]) public playerPredictions;
    uint256 public totalDeposited;
    bytes32 public currentGameId;
    uint256 public currentPriceRange;
    uint256 public depositAmount;
    address public treasury;
    uint256 public minDepositAmount;
    uint256 public startingPrice;
    uint256 public maxPlayers = 100;
    uint256 public fee = 1500;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates up/down game
     * @param priceTimeGap when the game will end
     * @param stopPredictAt time when players can't enter the game
     * @param token token for game deposits
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     */
    function startGame(
        uint32 priceTimeGap,
        uint32 stopPredictAt,
        uint256 newDepositAmount,
        uint256 priceRange,
        address token,
        uint8 feedNumber,
        uint8 numberOfGuesses
    ) public onlyRole(GAME_MASTER_ROLE) {
        require(packedData == 0, "Finish previous game first");
        require(stopPredictAt - block.timestamp >= timeGap, "Wrong stop time");
        require(priceTimeGap >= timeGap, "Timeframe gap must be higher");
        require(
            newDepositAmount >= ITreasury(treasury).minDepositAmount(token),
            "Wrong min deposit amount"
        );
        require(numberOfGuesses > 1, "Must have multiple guesses");
        require(
            IDataStreamsVerifier(ITreasury(treasury).upkeep()).assetId(
                feedNumber
            ) != bytes32(0),
            "Wrong feed number"
        );
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(priceTimeGap) << 64) |
            (uint256(feedNumber) << 96) |
            (uint256(numberOfGuesses) << 104));
        depositAmount = newDepositAmount;
        currentPriceRange = priceRange;
        currentGameId = keccak256(
            abi.encodePacked(stopPredictAt, block.timestamp, address(this))
        );
        ITreasury(treasury).setGameToken(currentGameId, token);
        minDepositAmount = depositAmount;
        emit BullseyeExpressCreated(
            block.timestamp,
            stopPredictAt,
            priceTimeGap,
            feedNumber,
            numberOfGuesses,
            currentGameId,
            token
        );
    }

    /**
     * Take a participation in up/down game and deposit funds
     * @param predictions up = true, down = false
     */
    function play(uint256[] memory predictions) public {
        require(!isParticipating[msg.sender], "Already participating");
        require(players.length + 1 <= maxPlayers, "Max player amount reached");
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );

        depositAmounts[msg.sender] = depositAmount;
        isParticipating[msg.sender] = true;
        playerPredictions[msg.sender] = predictions;
        uint256 rakeback = ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );

        players.push(msg.sender);
        totalDeposited += depositAmount;

        emit BullseyeExpressNewPlayer(
            msg.sender,
            predictions,
            depositAmount,
            currentGameId,
            rakeback
        );
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
        require(
            block.timestamp >=
                game.stopPredictAt + game.priceTimeGap * game.numberOfGuesses,
            "Too early to finish"
        );
        if (players.length < 2) {
            ITreasury(treasury).refund(
                depositAmounts[players[0]],
                players[0],
                currentGameId
            );
            isParticipating[players[0]] = false;
            depositAmounts[players[0]] = 0;
            delete players;
            emit BullseyeExpressCancelled(currentGameId);
            packedData = 0;
            startingPrice = 0;
            currentGameId = bytes32(0);
            return;
        }
        require(startingPrice != 0, "Starting price must be set");
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
        //Check for max correct guesses amongst players
        uint256 maxCorrect = 0;
        uint256 winnerCount = 0;
        uint256 looserCount = 0;
        uint256[] memory correctGuesses = new uint256[](players.length);
        for (uint i = 0; i < players.length; i++) {
            uint256 correct = 0;
            for (uint j = 0; j < unverifiedReports.length; j++) {
                uint256 diff = uint192(finalPrices[j]) <
                    playerPredictions[players[i]][j]
                    ? playerPredictions[players[i]][j] - uint192(finalPrices[j])
                    : uint192(finalPrices[j]) -
                        playerPredictions[players[i]][j];
                if (diff <= currentPriceRange) {
                    correct++;
                }
            }
            correctGuesses[i] = correct;
            if (correct > maxCorrect) {
                maxCorrect = correct;
                looserCount += winnerCount;
                winnerCount = 1;
            } else if (correct == maxCorrect) {
                winnerCount++;
            } else {
                looserCount++;
            }
        }

        address[] memory winners = new address[](winnerCount);
        address[] memory loosers = new address[](looserCount);
        uint wIndex = 0;
        uint lIndex = 0;

        for (uint i = 0; i < players.length; i++) {
            if (correctGuesses[i] == maxCorrect) {
                winners[wIndex++] = players[i];
            } else {
                loosers[lIndex++] = players[i];
            }
        }

        uint256 totalLostRakeBack;
        uint256 totalLostDeposits;
        for (uint j = 0; j < loosers.length; j++) {
            totalLostDeposits += depositAmounts[loosers[j]];
            totalLostRakeBack += ITreasury(treasury).lockedRakeback(
                currentGameId,
                loosers[j],
                0
            );
        }

        ITreasury(treasury).withdrawGameFee(
            totalDeposited - totalLostDeposits,
            fee,
            currentGameId
        );
        uint256 finalRate = ITreasury(treasury).calculateRate(
            totalDeposited - totalLostDeposits,
            totalLostRakeBack,
            currentGameId
        );

        for (uint i = 0; i < winners.length; i++) {
            ITreasury(treasury).universalDistribute(
                winners[i],
                depositAmounts[winners[i]],
                currentGameId,
                finalRate
            );
        }

        emit BullseyeExpressFinalized(finalPrices, currentGameId);

        for (uint i = 0; i < players.length; i++) {
            depositAmounts[players[i]] = 0;
            isParticipating[players[i]] = false;
        }

        delete players;
        ITreasury(treasury).setGameFinished(currentGameId);
        currentGameId = bytes32(0);
        packedData = 0;
        startingPrice = 0;
    }

    /**
     * Closes game and refunds tokens
     */
    function closeGame() public onlyRole(GAME_MASTER_ROLE) {
        require(currentGameId != bytes32(0), "Game not started");
        for (uint i; i < players.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[players[i]],
                players[i],
                currentGameId
            );
            isParticipating[players[i]] = false;
            depositAmounts[players[i]] = 0;
        }
        delete players;
        emit BullseyeExpressCancelled(currentGameId);
        currentGameId = bytes32(0);
        packedData = 0;
        totalDeposited = 0;
        startingPrice = 0;
    }

    /**
     * Returns decoded game data
     */
    function decodeData() public view returns (GameInfo memory data) {
        data.startTime = uint256(uint32(packedData));
        data.stopPredictAt = uint256(uint32(packedData >> 32));
        data.priceTimeGap = uint256(uint32(packedData >> 64));
        data.feedNumber = uint8(packedData >> 96);
        data.numberOfGuesses = uint8(packedData >> 104);
    }

    /**
     * Change maximum players number
     * @param newMax new maximum number
     */
    function setMaxPlayers(uint256 newMax) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPlayers = newMax;
        emit NewMaxPlayersAmount(newMax);
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
}
