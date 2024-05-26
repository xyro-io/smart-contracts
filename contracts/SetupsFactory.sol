// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from  "./interfaces/ITreasury.sol";
import {IMockUpkeep} from  "./interfaces/IMockUpkeep.sol";
import {Setups} from "./Setups.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

interface ISetups {
    function setTreasury(address newTreasury) external;
    function grantRole(bytes32 role, address account) external;
    function transferOwnership(address newOwner) external;
}

contract SetupsFactory is AccessControl {
    event SetupCreated(
        uint256 startTime,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        bool isLong,
        address game,
        address creator
    );

    address public treasury;
    address public gameMaster;
    uint256 gameId;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;
    mapping(uint256 => address) public games;

    /**
     * @param newTreasury new treasury address
     */
    constructor(address newTreasury) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        gameMaster = msg.sender;
        treasury = newTreasury;
    }

    /**
     * Creates setup game
     * @param endTime when the game will end
     * @param takeProfitPrice take profit price
     * @param stopLossPrice stop loss price
     * @param isLong if stop loss = true, take profit = false
     */
    function createSetups(
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        bool isLong,
        bytes32 feedId
    ) public returns (address newGame) {
        require(
            endTime - block.timestamp >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - block.timestamp <= maxDuration,
            "Max game duration must be lower"
        );
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(block.timestamp, takeProfitPrice)),
            abi.encodePacked(
                type(Setups).creationCode,
                abi.encode(
                    isLong,
                    endTime,
                    takeProfitPrice,
                    stopLossPrice,
                    msg.sender,
                    feedId,
                    treasury
                )
            )
        );
        emit SetupCreated(
            block.timestamp,
            endTime,
            takeProfitPrice,
            stopLossPrice,
            isLong,
            newGame,
            msg.sender
        );
        ISetups(newGame).grantRole(DEFAULT_ADMIN_ROLE, gameMaster);
        games[gameId++] = newGame;
    }

    /**
     * Returns all games status
     */
    // function getStatus()
    //     public
    //     view
    //     returns (Setups.Status[] memory status)
    // {
    //     Setups setup;
    //     status = new Setups.Status[](gameId);

    //     for (uint256 i; i < gameId; i++) {
    //         setup = Setups(games[i]);
    //         (, , , , , , , , , , , Setups.Status current) = setup.game();
    //         status[i] = current;
    //     }
    // }

    /**
     * onlyDao
     * Changes min and max game limits
     * @param newMaxDuration new max game duration
     * @param newMinDuration new min game duration
     */
    function changeGameDuration(
        uint256 newMaxDuration,
        uint256 newMinDuration
    ) public {
        minDuration = newMinDuration;
        maxDuration = newMaxDuration;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(address newTreasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = newTreasury;
    }
}
