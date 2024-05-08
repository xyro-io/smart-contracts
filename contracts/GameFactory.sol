// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SetupGame.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;

    function transferOwnership(address newOwner) external;
}

contract GameFactory is Ownable {
    event SetupCreated(
        uint48 startTime,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        uint256 betAmount,
        bool isStopLoss,
        address creator
    );

    address public treasury;
    uint256 betId;
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
     * @param betAmount amount to enter the game
     * @param isStopLoss if stop loss = true, take profit = false
     * @param unverifiedReport Chainlink DataStreams report
     */
    function createSetupGame(
        uint48 startTime,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        uint256 betAmount,
        bool isStopLoss,
        bytes memory unverifiedReport
    ) public returns (address newGame) {
        require(
            endTime - startTime >= minDuration,
            "Min bet duration must be higher"
        );
        require(
            endTime - startTime <= maxDuration,
            "Max bet duration must be lower"
        );
        if (betAmount != 0) {
            ITreasury(treasury).deposit(betAmount, msg.sender);
        }
        newGame = Create2.deploy(
            0,
            keccak256(abi.encodePacked(startTime, takeProfitPrice)),
            abi.encodePacked(
                type(SetupGame).creationCode,
                abi.encode(
                    isStopLoss,
                    startTime,
                    endTime,
                    takeProfitPrice,
                    stopLossPrice,
                    msg.sender,
                    betAmount,
                    unverifiedReport,
                    treasury
                )
            )
        );
        emit SetupCreated(
            startTime,
            endTime,
            takeProfitPrice,
            stopLossPrice,
            betAmount,
            isStopLoss,
            msg.sender
        );
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
    }

    /**
     * Returns all games status
     */
    function getStatus()
        public
        view
        returns (SetupGame.Status[] memory status)
    {
        SetupGame setup;
        status = new SetupGame.Status[](betId);

        for (uint256 i; i < betId; i++) {
            setup = SetupGame(games[i]);
            (, , , , , , , , , , , SetupGame.Status current) = setup.game();
            status[i] = current;
        }
    }

    /**
     * onlyDao
     * Changes min and max game limits
     * @param newMaxDuration new max game duration
     * @param newMinDuration new min game duration
     */
    function changeBetDuration(
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
