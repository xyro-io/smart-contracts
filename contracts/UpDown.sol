// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract UpDown is AccessControl {
    event UpDownCreated(
        uint256 startTime,
        uint48 stopPredictAt,
        uint48 endTime,
        bytes32 feedId,
        bytes32 indexed gameId
    );
    event UpDownNewPlayer(
        address player,
        bool isLong,
        uint256 depositAmount,
        bytes32 indexed gameId
    );
    event UpDownStarted(int192 startingPrice, bytes32 indexed gameId);
    event UpDownFinalized(
        int192 finalPrice,
        bool isLong,
        bytes32 indexed gameId
    );
    event UpDownCancelled(bytes32 indexed gameId);

    struct GameInfo {
        uint256 startTime;
        uint48 endTime;
        uint48 stopPredictAt;
        int192 startingPrice;
        bytes32 feedId;
        bytes32 gameId;
        uint256 totalDepositsUp;
        uint256 totalDepositsDown;
    }

    address[] public UpPlayers;
    address[] public DownPlayers;
    mapping(address => uint256) public depositAmounts;
    GameInfo public game;
    address public treasury;
    uint256 public fee = 100;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates up/down game
     * @param endTime when the game will end
     */
    function startGame(
        uint48 endTime,
        uint48 stopPredictAt,
        bytes32 feedId
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(game.startTime == 0, "Finish previous game first");
        game.feedId = feedId;
        game.startTime = block.timestamp;
        game.stopPredictAt = stopPredictAt;
        game.endTime = endTime;
        game.gameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, address(this))
        );
        emit UpDownCreated(
            block.timestamp,
            stopPredictAt,
            endTime,
            feedId,
            game.gameId
        );
    }

    /**
     * Take a participation in up/down game
     * @param isLong up = true, down = false
     * @param depositAmount amount to deposit in game
     */
    function play(
        bool isLong,
        uint256 depositAmount
    ) public isParticipating(msg.sender) {
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        if (isLong) {
            game.totalDepositsUp += depositAmount;
            UpPlayers.push(msg.sender);
        } else {
            game.totalDepositsDown += depositAmount;
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, game.gameId);
    }

    /**
     * Take a participation in up/down game
     * @param isLong up = true, down = false
     */
    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        ITreasury.PermitData calldata permitData
    ) public isParticipating(msg.sender) {
        require(
            game.stopPredictAt >= block.timestamp,
            "Game is closed for new players"
        );
        if (isLong) {
            game.totalDepositsUp += depositAmount;
            UpPlayers.push(msg.sender);
        } else {
            game.totalDepositsDown += depositAmount;
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        ITreasury(treasury).depositWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, game.gameId);
    }

    function setStartingPrice(
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp >= game.stopPredictAt, "Too early");
        require(
            UpPlayers.length != 0 || DownPlayers.length != 0,
            "Not enough players"
        );
        address upkeep = ITreasury(treasury).upkeep();
        (int192 startingPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedId);
        require(
            block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        game.startingPrice = startingPrice;
        emit UpDownStarted(game.startingPrice, game.gameId);
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(game.gameId != bytes32(0), "Start the game first");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (UpPlayers.length == 0 || DownPlayers.length == 0) {
            if (UpPlayers.length > 0) {
                for (uint i; i < UpPlayers.length; i++) {
                    ITreasury(treasury).refund(
                        depositAmounts[UpPlayers[i]],
                        UpPlayers[i]
                    );
                }
                delete UpPlayers;
            } else if (DownPlayers.length > 0) {
                for (uint i; i < DownPlayers.length; i++) {
                    ITreasury(treasury).refund(
                        depositAmounts[DownPlayers[i]],
                        DownPlayers[i]
                    );
                }
                delete DownPlayers;
            }
            emit UpDownCancelled(game.gameId);
            delete game;
            return;
        }
        require(game.startingPrice != 0, "Starting price must be set");
        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedId);
        //block.timestamp must be > priceTimestamp
        require(
            block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        GameInfo memory _game = game;
        if (finalPrice > _game.startingPrice) {
            uint256 finalRate = ITreasury(treasury).calculateUpDownRate(
                _game.totalDepositsDown,
                _game.totalDepositsUp,
                fee
            );
            for (uint i = 0; i < UpPlayers.length; i++) {
                ITreasury(treasury).distributeWithoutFee(
                    finalRate,
                    UpPlayers[i],
                    depositAmounts[UpPlayers[i]]
                );
            }
            emit UpDownFinalized(finalPrice, true, game.gameId);
        } else {
            uint256 finalRate = ITreasury(treasury).calculateUpDownRate(
                _game.totalDepositsUp,
                _game.totalDepositsDown,
                fee
            );
            for (uint i = 0; i < DownPlayers.length; i++) {
                ITreasury(treasury).distributeWithoutFee(
                    finalRate,
                    DownPlayers[i],
                    depositAmounts[DownPlayers[i]]
                );
            }
            emit UpDownFinalized(finalPrice, false, game.gameId);
        }

        //Do we need to erase mapping
        for (uint i = 0; i < UpPlayers.length; i++) {
            depositAmounts[UpPlayers[i]] = 0;
        }
        for (uint i = 0; i < DownPlayers.length; i++) {
            depositAmounts[DownPlayers[i]] = 0;
        }

        delete DownPlayers;
        delete UpPlayers;
        delete game;
    }

    function closeGame() public onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint i; i < UpPlayers.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[UpPlayers[i]],
                UpPlayers[i]
            );
        }
        delete UpPlayers;
        for (uint i; i < DownPlayers.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[DownPlayers[i]],
                DownPlayers[i]
            );
        }
        delete DownPlayers;
        emit UpDownCancelled(game.gameId);
        delete game;
    }

    function getTotalPlayers() public view returns (uint256, uint256) {
        return (UpPlayers.length, DownPlayers.length);
    }

    /**
     * Checks if player is participating in the game
     * @param player player address
     */
    modifier isParticipating(address player) {
        for (uint i = 0; i < UpPlayers.length; i++) {
            require(UpPlayers[i] != player, "Already participating");
        }
        for (uint i = 0; i < DownPlayers.length; i++) {
            require(DownPlayers[i] != player, "Already participating");
        }
        _;
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
