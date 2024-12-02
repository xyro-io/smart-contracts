// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IOldTreasury} from "./IOldTreasury.sol";
import {IDataStreamsVerifier} from "../interfaces/IDataStreamsVerifier.sol";

contract OldUpDown is AccessControl {
    event NewFee(uint256 newFee);
    event NewTreasury(address newTreasury);
    event UpDownCreated(
        uint256 startTime,
        uint32 stopPredictAt,
        uint32 endTime,
        uint8 feedNumber,
        bytes32 gameId
    );
    event UpDownNewPlayer(
        address player,
        bool isLong,
        uint256 depositAmount,
        bytes32 gameId
    );
    event UpDownStarted(int192 startingPrice, bytes32 gameId);
    event UpDownFinalized(int192 finalPrice, bool isLong, bytes32 gameId);
    event UpDownCancelled(bytes32 gameId);

    struct GameInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        uint256 startingPrice;
        uint256 totalDepositsUp;
        uint256 totalDepositsDown;
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
    uint256 public maxPlayers = 100;
    uint256 public fee = 1500;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates up/down game
     * @param endTime when the game will end
     */
    function startGame(
        uint32 endTime,
        uint32 stopPredictAt,
        uint256 depositAmount,
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
        minDepositAmount = depositAmount;
        emit UpDownCreated(
            block.timestamp,
            stopPredictAt,
            endTime,
            feedNumber,
            currentGameId
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
            game.stopPredictAt > block.timestamp &&
                (game.totalDepositsDown + depositAmount <= type(uint32).max ||
                    game.totalDepositsUp + depositAmount <= type(uint32).max),
            "Game is closed for new players"
        );
        if (isLong) {
            //rewrites totalDepositsUp
            packedData =
                (packedData & ~(uint256(0xFFFFFFFF) << 168)) |
                ((depositAmount + game.totalDepositsUp) << 168);
            UpPlayers.push(msg.sender);
        } else {
            //rewrites totalDepositsDown
            packedData =
                (packedData & ~(uint256(0xFFFFFFFF) << 136)) |
                ((depositAmount + game.totalDepositsDown) << 136);
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        isParticipating[msg.sender] = true;
        IOldTreasury(treasury).depositAndLock(depositAmount, msg.sender);
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, currentGameId);
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
            game.stopPredictAt > block.timestamp &&
                (game.totalDepositsDown + depositAmount <= type(uint32).max ||
                    game.totalDepositsUp + depositAmount <= type(uint32).max),
            "Game is closed for new players"
        );
        if (isLong) {
            //rewrites totalDepositsUp
            packedData =
                (packedData & ~(uint256(0xFFFFFFFF) << 168)) |
                ((depositAmount + game.totalDepositsUp) << 168);
            UpPlayers.push(msg.sender);
        } else {
            //rewrites totalDepositsDown
            packedData =
                (packedData & ~(uint256(0xFFFFFFFF) << 136)) |
                ((depositAmount + game.totalDepositsDown) << 136);
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        IOldTreasury(treasury).lock(depositAmount, msg.sender);
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, currentGameId);
    }

    /**
     * Take a participation in up/down game and deposit funds
     * @param isLong up = true, down = false
     */
    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        IOldTreasury.PermitData calldata permitData
    ) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(!isParticipating[msg.sender], "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt > block.timestamp &&
                (game.totalDepositsDown + depositAmount <= type(uint32).max ||
                    game.totalDepositsUp + depositAmount <= type(uint32).max),
            "Game is closed for new players"
        );
        if (isLong) {
            //rewrites totalDepositsUp
            packedData =
                (packedData & ~(uint256(0xFFFFFFFF) << 168)) |
                ((depositAmount + game.totalDepositsUp) << 168);
            UpPlayers.push(msg.sender);
        } else {
            //rewrites totalDepositsDown
            packedData =
                (packedData & ~(uint256(0xFFFFFFFF) << 136)) |
                ((depositAmount + game.totalDepositsDown) << 136);
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        IOldTreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        isParticipating[msg.sender] = true;
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, currentGameId);
    }

    function setStartingPrice(
        bytes memory unverifiedReport
    ) public onlyRole(GAME_MASTER_ROLE) {
        GameInfo memory game = decodeData();
        require(block.timestamp >= game.stopPredictAt, "Too early");
        require(
            UpPlayers.length != 0 || DownPlayers.length != 0,
            "Not enough players"
        );
        address upkeep = IOldTreasury(treasury).upkeep();
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
                    IOldTreasury(treasury).refund(
                        depositAmounts[UpPlayers[i]],
                        UpPlayers[i]
                    );
                    isParticipating[UpPlayers[i]] = false;
                    depositAmounts[UpPlayers[i]] = 0;
                }
                delete UpPlayers;
            } else if (DownPlayers.length > 0) {
                for (uint i; i < DownPlayers.length; i++) {
                    IOldTreasury(treasury).refund(
                        depositAmounts[DownPlayers[i]],
                        DownPlayers[i]
                    );
                    isParticipating[DownPlayers[i]] = false;
                    depositAmounts[DownPlayers[i]] = 0;
                }
                delete DownPlayers;
            }
            emit UpDownCancelled(currentGameId);
            packedData = 0;
            currentGameId = bytes32(0);
            return;
        }
        require(game.startingPrice != 0, "Starting price must be set");
        address upkeep = IOldTreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        //block.timestamp must be > priceTimestamp
        require(
            priceTimestamp - game.endTime <= 1 minutes ||
                block.timestamp - priceTimestamp <= 1 minutes,
            "Old chainlink report"
        );
        GameInfo memory _game = game;
        if (uint192(finalPrice / 1e14) > _game.startingPrice) {
            uint256 finalRate = IOldTreasury(treasury).calculateUpDownRate(
                _game.totalDepositsDown,
                _game.totalDepositsUp,
                fee
            );
            for (uint i = 0; i < UpPlayers.length; i++) {
                IOldTreasury(treasury).distributeWithoutFee(
                    finalRate,
                    UpPlayers[i],
                    fee,
                    depositAmounts[UpPlayers[i]]
                );
            }
            emit UpDownFinalized(finalPrice, true, currentGameId);
        } else if (uint192(finalPrice / 1e14) < _game.startingPrice) {
            uint256 finalRate = IOldTreasury(treasury).calculateUpDownRate(
                _game.totalDepositsUp,
                _game.totalDepositsDown,
                fee
            );
            for (uint i = 0; i < DownPlayers.length; i++) {
                IOldTreasury(treasury).distributeWithoutFee(
                    finalRate,
                    DownPlayers[i],
                    fee,
                    depositAmounts[DownPlayers[i]]
                );
            }
            emit UpDownFinalized(finalPrice, false, currentGameId);
        } else if (uint192(finalPrice / 1e14) == _game.startingPrice) {
            for (uint i; i < UpPlayers.length; i++) {
                IOldTreasury(treasury).refund(
                    depositAmounts[UpPlayers[i]],
                    UpPlayers[i]
                );
                isParticipating[UpPlayers[i]] = false;
            }
            delete UpPlayers;
            for (uint i; i < DownPlayers.length; i++) {
                IOldTreasury(treasury).refund(
                    depositAmounts[DownPlayers[i]],
                    DownPlayers[i]
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
        currentGameId = bytes32(0);
        packedData = 0;
    }

    function closeGame() public onlyRole(GAME_MASTER_ROLE) {
        require(currentGameId != bytes32(0), "Game not started");
        for (uint i; i < UpPlayers.length; i++) {
            IOldTreasury(treasury).refund(
                depositAmounts[UpPlayers[i]],
                UpPlayers[i]
            );
            isParticipating[UpPlayers[i]] = false;
            depositAmounts[UpPlayers[i]] = 0;
        }
        delete UpPlayers;
        for (uint i; i < DownPlayers.length; i++) {
            IOldTreasury(treasury).refund(
                depositAmounts[DownPlayers[i]],
                DownPlayers[i]
            );
            isParticipating[DownPlayers[i]] = false;
            depositAmounts[DownPlayers[i]] = 0;
        }
        delete DownPlayers;
        emit UpDownCancelled(currentGameId);
        currentGameId = bytes32(0);
        packedData = 0;
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
        data.totalDepositsDown = uint256(uint32(packedData >> 136));
        data.totalDepositsUp = uint256(uint32(packedData >> 168));
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
