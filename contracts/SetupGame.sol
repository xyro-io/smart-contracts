// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20.sol";

contract SetupGame is Ownable {
    event SetupNewPlayer(bool isStopLoss, uint256 depositAmount, address player);
    event SetupCancelled(
        address gameAdress,
        address initiator,
        Status gameStatus
    );
    event SetupEnd(
        bool takeProfitWon,
        uint256 totalDepositsTP,
        uint256 totalDepositsSL,
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

    struct GameInfo {
        bytes32 feedId;
        address initiator;
        uint48 startTime;
        uint48 endTime;
        bool isStopLoss;
        uint256 totalDepositsSL;
        uint256 totalDepositsTP;
        int192 takeProfitPrice;
        int192 stopLossPrice;
        int192 startingAssetPrice;
        int192 finalAssetPrice;
        Status gameStatus;
    }

    address[] public teamSL;
    address[] public teamTP;
    mapping(address => uint256) public depositAmounts;

    GameInfo public game;
    address public treasury;

    /**
     * @param isStopLoss if stop loss = true, take profit = false
     * @param startTime when the game will start
     * @param endTime when the game will end
     * @param takeProfitPrice take profit price
     * @param stopLossPrice stop loss price
     * @param initiator game creator
     * @param initiator's deposit depositAmount
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
        uint256 depositAmount,
        bytes memory unverifiedReport,
        bytes32 feedId,
        address newTreasury
    ) Ownable(msg.sender) {
        game.isStopLoss = isStopLoss;
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.stopLossPrice = stopLossPrice;
        game.takeProfitPrice = takeProfitPrice;
        game.gameStatus = Status.Created;
        game.feedId = feedId;
        treasury = newTreasury;
        address upkeep = ITreasury(newTreasury).upkeep();
        game.startingAssetPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            feedId
        );
        if (depositAmount != 0) {
            depositAmounts[msg.sender] = depositAmount;
            if (isStopLoss) {
                teamSL.push(msg.sender);
                game.totalDepositsSL = depositAmount;
            } else {
                teamTP.push(msg.sender);
                game.totalDepositsTP = depositAmount;
            }
        }
    }

    /**
     * Take participation in setup game
     * @param isStopLoss if stop loss = true, take profit = false
     * @param depositAmount sender's deposit amount
     */
    function play(bool isStopLoss, uint256 depositAmount) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(depositAmounts[msg.sender] == 0, "You are already in the game");
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        depositAmounts[msg.sender] = depositAmount;
        if (isStopLoss) {
            teamSL.push(msg.sender);
            game.totalDepositsSL += depositAmount;
        } else {
            teamTP.push(msg.sender);
            game.totalDepositsTP += depositAmount;
        }
        emit SetupNewPlayer(isStopLoss, depositAmount, msg.sender);
    }

    /**
     * Take participation in setup game
     * @param isStopLoss if stop loss = true, take profit = false
     * @param depositAmount sender's deposit amount
     */
    function playWithPermit(
        bool isStopLoss,
        uint256 depositAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(depositAmounts[msg.sender] == 0, "You are already in the game");
        ITreasury(treasury).depositWithPermit(depositAmount, msg.sender, deadline, v, r, s);
        depositAmounts[msg.sender] = depositAmount;
        if (isStopLoss) {
            teamSL.push(msg.sender);
            game.totalDepositsSL += depositAmount;
        } else {
            teamTP.push(msg.sender);
            game.totalDepositsTP += depositAmount;
        }
        emit SetupNewPlayer(isStopLoss, depositAmount, msg.sender);
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
            ITreasury(treasury).refund(depositAmounts[teamSL[i]], teamSL[i]);
        }
        for (uint i; i < teamTP.length; i++) {
            ITreasury(treasury).refund(depositAmounts[teamTP[i]], teamTP[i]);
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
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
        require(
            block.timestamp >= game.endTime ||
                game.stopLossPrice == finalPrice ||
                game.takeProfitPrice == finalPrice,
            "Too early to finish"
        );
        bool takeProfitWon;
        if (game.isStopLoss) {
            if (finalPrice <= game.stopLossPrice) {
                // sl team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalDepositsTP,
                    game.totalDepositsSL,
                    game.initiator
                );

                for (uint i; i < teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamSL[i],
                        depositAmounts[teamSL[i]]
                    );
                }
            } else {
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalDepositsSL,
                    game.totalDepositsTP,
                    game.initiator
                );
                for (uint i; i < teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamTP[i],
                        depositAmounts[teamTP[i]]
                    );
                }
                takeProfitWon = true;
            }
        } else {
            if (finalPrice >= game.takeProfitPrice) {
                // tp team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalDepositsSL,
                    game.totalDepositsTP,
                    game.initiator
                );
                for (uint i; i < teamTP.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamTP[i],
                        depositAmounts[teamTP[i]]
                    );
                }
                takeProfitWon = true;
            } else {
                // sl team wins
                uint256 finalRate = ITreasury(treasury).calculateSetupRate(
                    game.totalDepositsTP,
                    game.totalDepositsSL,
                    game.initiator
                );
                for (uint i; i < teamSL.length; i++) {
                    ITreasury(treasury).distributeWithoutFee(
                        finalRate,
                        teamSL[i],
                        depositAmounts[teamSL[i]]
                    );
                }
            }
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
        emit SetupEnd(
            takeProfitWon,
            game.totalDepositsTP,
            game.totalDepositsSL,
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
