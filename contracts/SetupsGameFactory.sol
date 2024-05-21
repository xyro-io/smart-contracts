// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Setups.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;

    function transferOwnership(address newOwner) external;
}

contract SetupsGameFactory is Ownable {
    event SetupCreated(
        uint48 startTime,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        bool isStopLoss,
        address creator
    );

    address public treasury;
    uint256 gameId;
    uint256 public minDuration = 30 minutes;
    uint256 public maxDuration = 24 weeks;
    mapping(uint256 => address) public games;

    /**
     * @param newTreasury new treasury address
     */
    constructor(address newTreasury) Ownable(msg.sender) {
        treasury = newTreasury;
    }

    /**
     * Creates setup game
     * @param startTime when the game will start
     * @param endTime when the game will end
     * @param takeProfitPrice take profit price
     * @param stopLossPrice stop loss price
     * @param isStopLoss if stop loss = true, take profit = false
     */
    function createSetups(
        uint48 startTime,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        bool isStopLoss,
        bytes32 feedId
    ) public returns (address newGame) {
        require(
            endTime - startTime >= minDuration,
            "Min game duration must be higher"
        );
        require(
            endTime - startTime <= maxDuration,
            "Max game duration must be lower"
        );
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, takeProfitPrice)),
            abi.encodePacked(
                type(Setups).creationCode,
                abi.encode(
                    isStopLoss,
                    startTime,
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
            startTime,
            endTime,
            takeProfitPrice,
            stopLossPrice,
            isStopLoss,
            msg.sender
        );
        IGame(newGame).transferOwnership(owner());
        games[gameId++] = newGame;
    }

    /**
     * Returns all games status
     */
    function getStatus()
        public
        view
        returns (Setups.Status[] memory status)
    {
        Setups setup;
        status = new Setups.Status[](gameId);

        for (uint256 i; i < gameId; i++) {
            setup = Setups(games[i]);
            (, , , , , , , , , , , Setups.Status current) = setup.game();
            status[i] = current;
        }
    }

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
    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}