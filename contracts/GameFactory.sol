// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SetupGame.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

interface IGame {
    function setTreasury(address newTreasury) external;

    function transferOwnership(address newOwner) external;
}

contract GameFactory is Ownable {
    address public treasury;
    uint256 betId;
    mapping(uint256 => address) public games;

    constructor(address newTreasury) Ownable(msg.sender) {
        treasury = newTreasury;
    }

    function createSetupGame(
        uint48 startTime,
        uint48 endTime,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        uint256 amount,
        bool isStopLoss
    ) public returns (address newGame) {
        require(
            endTime - startTime >= 15 minutes,
            "Min game duration must be 15 minutes"
        );
        require(
            endTime - startTime <= 24 hours,
            "Max game duration must be 24 hours"
        );
        if(amount != 0) {
            ITreasury(treasury).deposit(amount, msg.sender);
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
                    amount
                )
            )
        );
        IGame(newGame).setTreasury(treasury);
        IGame(newGame).transferOwnership(owner());
        games[betId++] = newGame;
    }
}
