// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";
import "hardhat/console.sol";

contract SetupGame is Ownable {
    enum Status {
        Created,
        Closed,
        Started,
        Finished
    }

    struct BetInfo {
        address initiator;
        uint48 startTime;
        uint48 endTime;
        bool isStopLoss;
        uint256 totalBetsSL;
        uint256 totalBetsTP;
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
        uint256 startingAssetPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    address[] public teamSL;
    address[] public teamTP;
    mapping(address => uint256) public betAmounts;

    BetInfo public game;
    address public treasury;

    constructor(
        bool isStopLoss,
        uint48 startTime,
        uint48 endTime,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        address initiator,
        uint256 amount
    ) Ownable(msg.sender) {
        game.isStopLoss = isStopLoss;
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.stopLossPrice = stopLossPrice;
        game.takeProfitPrice = takeProfitPrice;
        game.gameStatus = Status.Created;
        if (amount != 0) {
            betAmounts[msg.sender] = amount;
            if (isStopLoss) {
                teamSL.push(msg.sender);
                game.totalBetsSL = amount;
            } else {
                teamTP.push(msg.sender);
                game.totalBetsTP = amount;
            }
        }
    }

    function setStartingPrice(uint256 assetPrice) public onlyOwner {
        require(game.gameStatus == Status.Created, "Wrong status!");
        game.gameStatus = Status.Started;
        game.startingAssetPrice = assetPrice;
    }

    function bet(bool isStopLoss, uint256 amount) public {
        //reentrancy
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Too late!"
        );
        require(betAmounts[msg.sender] == 0, "bet already exists");
        ITreasury(treasury).deposit(amount, msg.sender);
        betAmounts[msg.sender] = amount;
        if (isStopLoss) {
            teamSL.push(msg.sender);
            game.totalBetsSL += amount;
        } else {
            teamTP.push(msg.sender);
            game.totalBetsTP += amount;
        }
    }

    function closeBet() public {
        require(game.initiator == msg.sender, "Wrong sender");
        require(
            (game.startTime + (game.endTime - game.startTime) / 3 <
                block.timestamp &&
                game.gameStatus == Status.Created),
            "Wrong status!"
        );
        for (uint i; i < teamSL.length; i++) {
            ITreasury(treasury).refund(betAmounts[teamSL[i]], teamSL[i]);
        }
        for (uint i; i < teamTP.length; i++) {
            ITreasury(treasury).refund(betAmounts[teamTP[i]], teamTP[i]);
        }

        game.gameStatus = Status.Closed;
    }

    //only owner
    function endGame(uint256 finalPrice) public onlyOwner {
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (game.isStopLoss) {
            if (finalPrice <= game.stopLossPrice) {
                //sl team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsTP,
                    game.totalBetsSL,
                    game.initiator
                );

                for (uint i; i < teamSL.length; i++) {
                    //Не читать с стораджа
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamSL[i],
                        betAmounts[teamSL[i]]
                    );
                }
            } else {
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsSL,
                    game.totalBetsTP,
                    game.initiator
                );
                for (uint i; i < teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamTP[i],
                        betAmounts[teamTP[i]]
                    );
                }
            }
        } else {
            if (finalPrice >= game.takeProfitPrice) {
                //tp team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsSL,
                    game.totalBetsTP,
                    game.initiator
                );
                for (uint i; i < teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamTP[i],
                        betAmounts[teamTP[i]]
                    );
                }
            } else {
                //sl team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalBetsTP,
                    game.totalBetsSL,
                    game.initiator
                );
                for (uint i; i < teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamSL[i],
                        betAmounts[teamSL[i]]
                    );
                }
            }
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
