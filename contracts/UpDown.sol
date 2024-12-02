// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract UpDown is AccessControl {
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event UpDownCreated(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 endTime,
        uint8 feedNumber,
        bytes32 gameId,
        address token
    );
    event UpDownNewPlayer(
        address player,
        bool isLong,
        uint256 depositAmount,
        bytes32 gameId,
        uint256 rakeback
    );
    event UpDownStarted(int192 startingPrice, bytes32 gameId);
    event UpDownFinalized(int192 finalPrice, bool isLong, bytes32 gameId);
    event UpDownCancelled(bytes32 gameId);

    struct GameInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        uint256 startingPrice;
        uint8 feedNumber;
    }

    uint256 packedData;
    bytes32 public constant GAME_MASTER_ROLE = keccak256("GAME_MASTER_ROLE");
    address[] public UpPlayers;
    address[] public DownPlayers;
    mapping(address => bool) public isParticipating;
    mapping(address => uint256) public depositAmounts;
    bytes32 public currentGameId;
    address public treasury;
    uint256 public minDepositAmount;
    uint256 public totalDepositsUp;
    uint256 public totalDepositsDown;
    uint256 public totalRakebackUp;
    uint256 public totalRakebackDown;
    uint256 public maxPlayers = 100;
    uint256 public fee = 1500;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates up/down game
     * @param endTime when the game will end
     * @param stopPredictAt time when players can't enter the game
     * @param depositAmount amount to enter the game
     * @param token token for game deposits
     * @param feedNumber token position in array of Chainlink DataStreams feed IDs
     */
    function startGame(
        uint32 endTime,
        uint32 stopPredictAt,
        uint256 depositAmount,
        address token,
        uint8 feedNumber
    ) public onlyRole(GAME_MASTER_ROLE) {
        require(packedData == 0, "Finish previous game first");
        require(endTime > stopPredictAt, "Ending time must be higher");
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(endTime) << 64) |
            (uint256(feedNumber) << 96));
        currentGameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, address(this))
        );
        ITreasury(treasury).setGameToken(currentGameId, token);
        minDepositAmount = depositAmount;
        emit UpDownCreated(
            block.timestamp,
            stopPredictAt,
            endTime,
            feedNumber,
            currentGameId,
            token
        );
    }

    /**
     * Take a participation in up/down game and deposit funds
     * @param isLong up = true, down = false
     * @param depositAmount amount to deposit in game
     */
    function play(bool isLong, uint256 depositAmount) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(!isParticipating[msg.sender], "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );

        depositAmounts[msg.sender] = depositAmount;
        isParticipating[msg.sender] = true;
        uint256 rakeback = ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );
        if (isLong) {
            totalRakebackUp += rakeback;
            totalDepositsUp += depositAmount;
            UpPlayers.push(msg.sender);
        } else {
            totalRakebackDown += rakeback;
            totalDepositsDown += depositAmount;
            DownPlayers.push(msg.sender);
        }
        emit UpDownNewPlayer(
            msg.sender,
            isLong,
            depositAmount,
            currentGameId,
            rakeback
        );
    }

    /**
     * Take a participation in up/down game using deposited funds
     * @param isLong up = true, down = false
     * @param depositAmount amount to deposit in game
     */
    function playWithDeposit(bool isLong, uint256 depositAmount) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(!isParticipating[msg.sender], "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );
        depositAmounts[msg.sender] = depositAmount;
        uint256 rakeback = ITreasury(treasury).lock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );
        if (isLong) {
            totalRakebackUp += rakeback;
            totalDepositsUp += depositAmount;
            UpPlayers.push(msg.sender);
        } else {
            totalRakebackDown += rakeback;
            totalDepositsDown += depositAmount;
            DownPlayers.push(msg.sender);
        }
        emit UpDownNewPlayer(
            msg.sender,
            isLong,
            depositAmount,
            currentGameId,
            rakeback
        );
    }

    /**
     * Take a participation in up/down game and deposit funds
     * @param isLong up = true, down = false
     */
    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        ITreasury.PermitData calldata permitData
    ) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(!isParticipating[msg.sender], "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt > block.timestamp,
            "Game is closed for new players"
        );
        depositAmounts[msg.sender] = depositAmount;
        isParticipating[msg.sender] = true;
        uint256 rakeback = ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            currentGameId,
            true,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        if (isLong) {
            totalRakebackUp += rakeback;
            totalDepositsUp += depositAmount;
            UpPlayers.push(msg.sender);
        } else {
            totalRakebackDown += rakeback;
            totalDepositsDown += depositAmount;
            DownPlayers.push(msg.sender);
        }
        emit UpDownNewPlayer(
            msg.sender,
            isLong,
            depositAmount,
            currentGameId,
            rakeback
        );
    }

    /**
     * Sets starting price wich will be used to compare with final price
     * @param unverifiedReport Chainlink DataStreams report
     */
    function setStartingPrice(
        bytes memory unverifiedReport
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData();
        require(block.timestamp >= game.stopPredictAt, "Too early");
        require(
            UpPlayers.length != 0 || DownPlayers.length != 0,
            "Not enough players"
        );
        address upkeep = ITreasury(treasury).upkeep();
        (int192 startingPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        require(
            block.timestamp - priceTimestamp <= 1 minutes,
            "Old chainlink report"
        );
        packedData |= uint192(startingPrice / 1e14) << 104;
        emit UpDownStarted(startingPrice, currentGameId);
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes memory unverifiedReport
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData();
        require(packedData != 0, "Start the game first");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (UpPlayers.length == 0 || DownPlayers.length == 0) {
            if (UpPlayers.length > 0) {
                for (uint i; i < UpPlayers.length; i++) {
                    ITreasury(treasury).refund(
                        depositAmounts[UpPlayers[i]],
                        UpPlayers[i],
                        currentGameId
                    );
                    isParticipating[UpPlayers[i]] = false;
                    depositAmounts[UpPlayers[i]] = 0;
                }
                delete UpPlayers;
            } else if (DownPlayers.length > 0) {
                for (uint i; i < DownPlayers.length; i++) {
                    ITreasury(treasury).refund(
                        depositAmounts[DownPlayers[i]],
                        DownPlayers[i],
                        currentGameId
                    );
                    isParticipating[DownPlayers[i]] = false;
                    depositAmounts[DownPlayers[i]] = 0;
                }
                delete DownPlayers;
            }
            emit UpDownCancelled(currentGameId);
            packedData = 0;
            totalDepositsUp = 0;
            totalDepositsDown = 0;
            currentGameId = bytes32(0);
            return;
        }
        require(game.startingPrice != 0, "Starting price must be set");
        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        require(
            priceTimestamp - game.endTime <= 1 minutes,
            "Old chainlink report"
        );
        GameInfo memory _game = game;
        //убрать деление финальной цены
        if (uint192(finalPrice / 1e14) > _game.startingPrice) {
            // -= OR =-
            ITreasury(treasury).withdrawGameFee(
                totalDepositsDown,
                fee,
                currentGameId
            );
            uint256 finalRate = ITreasury(treasury).calculateRate(
                totalDepositsUp,
                totalRakebackDown,
                currentGameId
            );
            for (uint i = 0; i < UpPlayers.length; i++) {
                ITreasury(treasury).universalDistribute(
                    UpPlayers[i],
                    depositAmounts[UpPlayers[i]],
                    currentGameId,
                    finalRate
                );
            }
            emit UpDownFinalized(finalPrice, true, currentGameId);
        } else if (uint192(finalPrice / 1e14) < _game.startingPrice) {
            ITreasury(treasury).withdrawGameFee(
                totalDepositsUp,
                fee,
                currentGameId
            );
            uint256 finalRate = ITreasury(treasury).calculateRate(
                totalDepositsDown,
                totalRakebackUp,
                currentGameId
            );
            for (uint i = 0; i < DownPlayers.length; i++) {
                ITreasury(treasury).universalDistribute(
                    DownPlayers[i],
                    depositAmounts[DownPlayers[i]],
                    currentGameId,
                    finalRate
                );
            }
            emit UpDownFinalized(finalPrice, false, currentGameId);
        } else if (uint192(finalPrice / 1e14) == _game.startingPrice) {
            for (uint i; i < UpPlayers.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[UpPlayers[i]],
                    UpPlayers[i],
                    currentGameId
                );
                isParticipating[UpPlayers[i]] = false;
            }
            delete UpPlayers;
            for (uint i; i < DownPlayers.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[DownPlayers[i]],
                    DownPlayers[i],
                    currentGameId
                );
                isParticipating[DownPlayers[i]] = false;
            }
            delete DownPlayers;
            emit UpDownCancelled(currentGameId);
            packedData = 0;
            currentGameId = bytes32(0);
            return;
        }

        for (uint i = 0; i < UpPlayers.length; i++) {
            depositAmounts[UpPlayers[i]] = 0;
            isParticipating[UpPlayers[i]] = false;
        }
        for (uint i = 0; i < DownPlayers.length; i++) {
            depositAmounts[DownPlayers[i]] = 0;
            isParticipating[DownPlayers[i]] = false;
        }

        delete DownPlayers;
        delete UpPlayers;
        ITreasury(treasury).setGameFinished(currentGameId);
        currentGameId = bytes32(0);
        packedData = 0;
        totalDepositsUp = 0;
        totalDepositsDown = 0;
    }

    /**
     * Closes game and refunds tokens
     */
    function closeGame() public onlyRole(GAME_MASTER_ROLE) {
        require(currentGameId != bytes32(0), "Game not started");
        for (uint i; i < UpPlayers.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[UpPlayers[i]],
                UpPlayers[i],
                currentGameId
            );
            isParticipating[UpPlayers[i]] = false;
            depositAmounts[UpPlayers[i]] = 0;
        }
        delete UpPlayers;
        for (uint i; i < DownPlayers.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[DownPlayers[i]],
                DownPlayers[i],
                currentGameId
            );
            isParticipating[DownPlayers[i]] = false;
            depositAmounts[DownPlayers[i]] = 0;
        }
        delete DownPlayers;
        emit UpDownCancelled(currentGameId);
        currentGameId = bytes32(0);
        packedData = 0;
        totalDepositsUp = 0;
        totalDepositsDown = 0;
        totalRakebackUp = 0;
        totalRakebackDown = 0;
    }

    /**
     * Returns decoded game data
     */
    function decodeData() public view returns (GameInfo memory data) {
        data.startTime = uint256(uint32(packedData));
        data.stopPredictAt = uint256(uint32(packedData >> 32));
        data.endTime = uint256(uint32(packedData >> 64));
        data.feedNumber = uint8(packedData >> 96);
        data.startingPrice = uint256(uint32(packedData >> 104));
    }

    /**
     * Returns total amount of participants
     */
    function getTotalPlayers() public view returns (uint256, uint256) {
        return (UpPlayers.length, DownPlayers.length);
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
     * Change fee
     * @param newFee new fee in bp
     */
    function setFee(uint256 newFee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        fee = newFee;
        emit NewFee(newFee);
    }
}
