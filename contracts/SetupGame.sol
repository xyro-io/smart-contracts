// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract SetupGame is Ownable {
    event SetupBet(bool isStopLoss, uint256 amount, address player);
    event SetupCancelled(
        address gameAdress,
        address initiator,
        Status gameStatus
    );
    event SetupEnd(
        bool takeProfitWon,
        uint256 totalBetsTP,
        uint256 totalBetsSL,
        bool isStopLoss,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        uint48 startTime,
        uint48 endTime,
        int192 startingAssetPrice,
        int192 finalAssetPrice,
        Status gameStatus
    );
    event SetupStartingPriceSet(
        address gameAdress,
        uint48 startTime,
        uint48 endTime,
        int192 assetPrice,
        Status gameStatus
    );

    enum Status {
        Created,
        Cancelled,
        Finished
    }

    struct BetInfo {
        address initiator;
        uint48 startTime;
        uint48 endTime;
        bool isStopLoss;
        uint256 totalBetsSL;
        uint256 totalBetsTP;
        int192 takeProfitPrice;
        int192 stopLossPrice;
        int192 startingAssetPrice;
        int192 finalAssetPrice;
        Status gameStatus;
    }

    address[] public teamSL;
    address[] public teamTP;
    mapping(address => uint256) public betAmounts;

    BetInfo public game;
    address public treasury;

    /**
    * @param isStopLoss if stop loss = true, take profit = false
    * @param startTime when the game will start
    * @param endTime when the game will end
    * @param takeProfitPrice take profit price
    * @param stopLossPrice stop loss price
    * @param initiator game creator
    * @param initiator's bet amount
    * @param unverifiedReport Chainlink DataStreams report
    * @param newTreasury new treasury address
    */
    constructor(
        bool isStopLoss,
        uint48 startTime,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        address initiator,
        uint256 amount,
        bytes memory unverifiedReport,
        address newTreasury
    ) Ownable(msg.sender) {
        game.isStopLoss = isStopLoss;
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.stopLossPrice = stopLossPrice;
        game.takeProfitPrice = takeProfitPrice;
        game.gameStatus = Status.Created;
        treasury = newTreasury;
        address upkeep = ITreasury(newTreasury).upkeep();
        game.startingAssetPrice = IMockUpkeep(upkeep).verify(unverifiedReport);
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

    /**
    * Take participation in setup game
    * @param isStopLoss if stop loss = true, take profit = false
    * @param sender's bet amount
    */
    function bet(bool isStopLoss, uint256 amount) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Game is closed for bets"
        );
        require(betAmounts[msg.sender] == 0, "Bet already exists");
        ITreasury(treasury).deposit(amount, msg.sender);
        betAmounts[msg.sender] = amount;
        if (isStopLoss) {
            teamSL.push(msg.sender);
            game.totalBetsSL += amount;
        } else {
            teamTP.push(msg.sender);
            game.totalBetsTP += amount;
        }
        emit SetupBet(isStopLoss, amount, msg.sender);
    }

    /**
    * Closes setup game
    */
    function closeGame() public {
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

        game.gameStatus = Status.Cancelled;
        emit SetupCancelled(address(this), game.initiator, Status.Cancelled);
    }

    /**
    * Finalizes setup game
    * @param unverifiedReport Chainlink DataStreams report
    */
    function finalizeGame(bytes memory unverifiedReport) public onlyOwner {
        require(game.gameStatus == Status.Created, "Wrong status!");
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verify(unverifiedReport);
        require(
            block.timestamp >= game.endTime ||
                game.stopLossPrice == finalPrice ||
                game.takeProfitPrice == finalPrice,
            "Too early to finish"
        );
        bool takeProfitWon;
        if (game.isStopLoss) {
            if (finalPrice <= game.stopLossPrice) {
                * sl team wins
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
                takeProfitWon = true;
            }
        } else {
            if (finalPrice >= game.takeProfitPrice) {
                * tp team wins
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
                takeProfitWon = true;
            } else {
                * sl team wins
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
        emit SetupEnd(
            takeProfitWon,
            game.totalBetsTP,
            game.totalBetsSL,
            game.isStopLoss,
            game.takeProfitPrice,
            game.stopLossPrice,
            game.startTime,
            game.endTime,
            game.startingAssetPrice,
            finalPrice,
            Status.Finished
        );
    }

    /**
    * Change treasury address
    * @param newTreasury new treasury address
    */
    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
