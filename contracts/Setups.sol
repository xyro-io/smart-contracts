// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract Setups is AccessControl {
    event SetupNewPlayer(bool isLong, uint256 depositAmount, address player);
    event SetupCancelled(address gameAdress, address initiator);
    event SetupFinalized(
        bool takeProfitWon,
        int192 finalPrice,
        uint256 initiatorFee
    );

    enum Status {
        Created,
        Cancelled,
        Finished
    }

    struct GameInfo {
        bytes32 feedId;
        address initiator;
        uint256 startTime;
        uint48 endTime;
        bool isLong;
        uint256 totalDepositsSL;
        uint256 totalDepositsTP;
        int192 takeProfitPrice;
        int192 stopLossPrice;
        int192 finalPrice;
        Status gameStatus;
    }

    address[] public teamSL;
    address[] public teamTP;
    mapping(address => uint256) public depositAmounts;

    GameInfo public game;
    address public treasury;

    /**
     * @param isLong if stop loss = false, take profit = true
     * @param endTime when the game will end
     * @param takeProfitPrice take profit price
     * @param stopLossPrice stop loss price
     * @param initiator game creator
     * @param newTreasury new treasury address
     */
    constructor(
        bool isLong,
        uint48 endTime,
        int192 takeProfitPrice,
        int192 stopLossPrice,
        address initiator,
        bytes32 feedId,
        address newTreasury
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        game.isLong = isLong;
        game.initiator = initiator;
        game.startTime = block.timestamp;
        game.endTime = endTime;
        game.stopLossPrice = stopLossPrice;
        game.takeProfitPrice = takeProfitPrice;
        game.gameStatus = Status.Created;
        game.feedId = feedId;
        treasury = newTreasury;
    }

    /**
     * Take participation in setup game
     * @param isLong if stop loss = false, take profit = true
     * @param depositAmount sender's deposit amount
     */
    function play(bool isLong, uint256 depositAmount) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(depositAmounts[msg.sender] == 0, "You are already in the game");
        ITreasury(treasury).deposit(depositAmount, msg.sender);
        depositAmounts[msg.sender] = depositAmount;
        if (isLong) {
            teamTP.push(msg.sender);
            game.totalDepositsTP += depositAmount;
        } else {
            teamSL.push(msg.sender);
            game.totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(isLong, depositAmount, msg.sender);
    }

    /**
     * Take participation in setup game
     * @param isLong if stop loss = false, take profit = true
     * @param depositAmount sender's deposit amount
     */
    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        ITreasury.PermitData calldata permitData
    ) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >
                block.timestamp,
            "Game is closed for new players"
        );
        require(depositAmounts[msg.sender] == 0, "You are already in the game");
        ITreasury(treasury).depositWithPermit(
            depositAmount,
            msg.sender,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        depositAmounts[msg.sender] = depositAmount;
        if (isLong) {
            teamTP.push(msg.sender);
            game.totalDepositsTP += depositAmount;
        } else {
            teamSL.push(msg.sender);
            game.totalDepositsSL += depositAmount;
        }
        emit SetupNewPlayer(isLong, depositAmount, msg.sender);
    }

    /**
     * Closes setup game
     */
    function closeGame() public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            ((game.startTime + (game.endTime - game.startTime) / 3 <
                block.timestamp &&
                teamTP.length + teamSL.length == 0) ||
                block.timestamp > game.endTime),
            "Wrong status!"
        );
        for (uint i; i < teamSL.length; i++) {
            ITreasury(treasury).refund(depositAmounts[teamSL[i]], teamSL[i]);
        }
        for (uint i; i < teamTP.length; i++) {
            ITreasury(treasury).refund(depositAmounts[teamTP[i]], teamTP[i]);
        }

        game.gameStatus = Status.Cancelled;
        emit SetupCancelled(address(this), game.initiator);
    }

    /**
     * Finalizes setup game
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(game.gameStatus == Status.Created, "Wrong status!");
        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedId);
        //block.timestamp must be > priceTimestamp
        require(
            block.timestamp - priceTimestamp <= 10 minutes,
            "Old chainlink report"
        );
        require(
            finalPrice <= game.stopLossPrice ||
                finalPrice >= game.takeProfitPrice,
            "Can't end"
        );
        if (teamSL.length == 0 || teamTP.length == 0) {
            for (uint i; i < teamSL.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[teamSL[i]],
                    teamSL[i]
                );
            }
            for (uint i; i < teamTP.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[teamTP[i]],
                    teamTP[i]
                );
            }
            game.gameStatus = Status.Cancelled;
            game.finalPrice = finalPrice;
            emit SetupCancelled(address(this), game.initiator);
            return;
        }
        bool takeProfitWon;
        uint256 initiatorFee;
        uint256 finalRate;
        if (game.isLong) {
            if (finalPrice >= game.takeProfitPrice) {
                // tp team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
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
            } else if (finalPrice <= game.stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
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
        } else {
            if (finalPrice >= game.stopLossPrice) {
                // sl team wins
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
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
            } else if (finalPrice <= game.takeProfitPrice) {
                (finalRate, initiatorFee) = ITreasury(treasury)
                    .calculateSetupRate(
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
        }
        game.finalPrice = finalPrice;
        game.gameStatus = Status.Finished;
        emit SetupFinalized(takeProfitWon, finalPrice, initiatorFee);
    }

    function getPlayersAmount() public view returns (uint256, uint256) {
        return (teamSL.length, teamTP.length);
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
