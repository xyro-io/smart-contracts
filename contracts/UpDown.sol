// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from  "./interfaces/ITreasury.sol";
import {IMockUpkeep} from  "./interfaces/IMockUpkeep.sol";

contract UpDown is AccessControl {
    event UpDownStart(
        uint256 startTime,
        uint48 stopPredictAt,
        uint48 endTime,
        int192 startingPrice,
        bytes32 feedId,
        bytes32 indexed gameId
    );
    event UpDownNewPlayer(address player, bool isLong, uint256 depositAmount, bytes32 indexed gameId);
    event UpDownFinalized(int192 finalPrice, bool isLong, bytes32 indexed gameId);
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
        game.gameId = keccak256(abi.encodePacked(endTime, block.timestamp, address(this)));
        emit UpDownStart(block.timestamp, stopPredictAt, endTime, game.startingPrice, feedId, game.gameId);
    }

    /**
     * Take a participation in up/down game
     * @param isLong up = true, down = false
     * @param depositAmount amount to deposit in game
     */
    function play(bool isLong, uint256 depositAmount) isParticipating(msg.sender) public {
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
            UpPlayers.push(msg.sender);
        } else {
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        ITreasury(treasury).depositWithPermit(depositAmount, msg.sender, permitData.deadline, permitData.v, permitData.r, permitData.s);
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, game.gameId);
    }

    function setStartingPrice(bytes memory unverifiedReport) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > game.stopPredictAt, "Too early");
        address upkeep = ITreasury(treasury).upkeep();
        game.startingPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(bytes memory unverifiedReport) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp >= game.endTime, "Too early to finish");
        if(UpPlayers.length + DownPlayers.length < 2) {
            if(UpPlayers.length == 1) {
                ITreasury(treasury).refund(depositAmounts[UpPlayers[0]], UpPlayers[0]);
                delete UpPlayers;
            } else if (DownPlayers.length == 1) {
                ITreasury(treasury).refund(depositAmounts[DownPlayers[0]], DownPlayers[0]);
                delete DownPlayers;
            }
            emit UpDownCancelled(game.gameId);
            delete game;
            return;
        }
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
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

    function getTotalPlayers() public view returns(uint256, uint256) {
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
    function setTreasury(address newTreasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = newTreasury;
    }
}
