// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract OneVsOneGameExactPrice is Ownable {
    enum Status {
        Created,
        Closed,
        Started,
        Finished,
        Refused
    }
    struct BetInfo {
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        uint256 betAmount;
        uint256 initiatorPrice;
        uint256 opponentPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo public game;
    address public treasury;

    constructor(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        uint256 initiatorPrice,
        uint256 betAmount,
        address initiator
    ) Ownable(msg.sender) {
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.initiatorPrice = initiatorPrice;
        game.betAmount = betAmount;
        game.opponent = opponent;
        game.gameStatus = Status.Created;
    }

    function acceptBet(uint256 opponentPrice) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        require(game.initiatorPrice != opponentPrice, "Same asset prices");
        //Если не приватная игра, то адрес будет 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
            if (opponentPrice == 0) {
                game.gameStatus = Status.Refused;
                return;
            }
        } else {
            game.opponent == msg.sender;
        }
        game.opponentPrice = opponentPrice;
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        game.gameStatus = Status.Started;
    }

    function closeBet() public {
        require(game.initiator == msg.sender, "Wrong sender");
        require(
            game.gameStatus == Status.Refused ||
                (game.startTime + (game.endTime - game.startTime) / 3 <
                    block.timestamp &&
                    game.gameStatus == Status.Created),
            "Wrong status!"
        );
        ITreasury(treasury).refund(game.betAmount, game.initiator);
        game.gameStatus = Status.Closed;
    }

    //only owner
    function endGame(uint256 finalPrice) public onlyOwner {
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        uint256 diff1 = game.initiatorPrice > finalPrice
            ? game.initiatorPrice - finalPrice
            : finalPrice - game.initiatorPrice;
        uint256 diff2 = game.opponentPrice > finalPrice
            ? game.opponentPrice - finalPrice
            : finalPrice - game.opponentPrice;

        if (diff1 < diff2) {
            ITreasury(treasury).distribute(game.betAmount, game.initiator);
        } else {
            ITreasury(treasury).distribute(game.betAmount, game.opponent);
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
