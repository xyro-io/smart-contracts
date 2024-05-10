// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import { BullseyeGame } from "./BullseyeGame.sol";
import { UpDownGame } from "./UpDown.sol";
import { ExactPriceStandalone } from "./ExactPriceStandalone.sol";
import { UpDownStandalone } from "./UpDownStandalone.sol";

contract FrontHelper {

    enum UpDownBetStatus {
        TakeProfit,
        StopLoss,
        NoBet
    }

    function getBullseyeData(address game) public view returns (bytes32, uint48, uint48, uint256, address[] memory, int192[] memory, uint256[] memory) {
        BullseyeGame bullseye = BullseyeGame(game);
        (bytes32 feedId, uint48 startTime, uint48 endTime, uint256 betAmout) = bullseye.game();
        uint256 totalPlayers = bullseye.getTotalPlayers();
        address[] memory players = new address[](totalPlayers);
        int192[] memory assetPrices = new int192[](totalPlayers);
        uint256[] memory timestamps = new uint256[](totalPlayers);
        for(uint i; i < bullseye.getTotalPlayers(); i++) {
            players[i] = bullseye.players(i);
            assetPrices[i] = bullseye.assetPrices(players[i]);
            timestamps[i] = bullseye.betTimestamp(players[i]);
            
        }
        return (feedId, startTime, endTime, betAmout, players, assetPrices, timestamps);
    }

    function getBullseyeBet(address player, address game) public view returns (int192) {
        return BullseyeGame(game).assetPrices(player);
    }

    function getUpDownBet(address player, address game) public view returns (UpDownBetStatus) {
        UpDownGame updown = UpDownGame(game);
        (uint256 totalUpPlayers, uint256 totalDownPlayers) = updown.getTotalPlayers();

        for(uint i; i <totalUpPlayers;i++) {
            if(player == updown.UpPlayers(i)) {
                return UpDownBetStatus.TakeProfit;
            }
        }

        for(uint i; i <totalDownPlayers;i++) {
            if(player == updown.DownPlayers(i)) {
                return UpDownBetStatus.StopLoss;
            }
        }

        return UpDownBetStatus.NoBet;
    }


    function getUpDownData(address game) public view returns (address[] memory, address[] memory, UpDownGame.BetInfo memory data) {
        UpDownGame updown = UpDownGame(game);
        (uint256 totalUpPlayers, uint256 totalDownPlayers) = updown.getTotalPlayers();
        address[] memory upPlayers = new address[](totalUpPlayers);
        address[] memory downPlayers = new address[](totalDownPlayers);
        for(uint i; i <totalUpPlayers;i++) {
            upPlayers[i] = updown.UpPlayers(i);
        }

        for(uint i; i <totalDownPlayers;i++) {
            downPlayers[i] = updown.DownPlayers(i);
        }

        (uint48 startTime,uint48 endTime,int192 startingPrice,uint256 betAmount,bytes32 feedId) = updown.game();
        data.startTime = startTime; 
        data.endTime = endTime;
        data.startingPrice = startingPrice;
        data.betAmount = betAmount;
        data.feedId = feedId;
        return ( upPlayers, downPlayers, data);
    }

    function getUpDownPlayers(address game) public view returns (address[] memory, address[] memory) {
        UpDownGame updown = UpDownGame(game);
        (uint256 totalUpPlayers, uint256 totalDownPlayers) = updown.getTotalPlayers();
        address[] memory upPlayers = new address[](totalUpPlayers);
        address[] memory downPlayers = new address[](totalDownPlayers);
        
        for(uint i; i <totalUpPlayers;i++) {
            upPlayers[i] = updown.UpPlayers(i);
        }

        for(uint i; i <totalDownPlayers;i++) {
            downPlayers[i] = updown.DownPlayers(i);
        }

        return (upPlayers, downPlayers);
    }

    function getExactPriceData(address game) public view returns(ExactPriceStandalone.BetInfo[] memory) {
        ExactPriceStandalone exactPrice = ExactPriceStandalone(game);
        uint256 totalGames = exactPrice.totalBets();
        ExactPriceStandalone.BetInfo[] memory allGames = new ExactPriceStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 betAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            ExactPriceStandalone.Status gameStatus) = exactPrice.games(i);
            allGames[i].feedId = feedId;
            allGames[i].initiator = initiator;
            allGames[i].startTime = startTime;
            allGames[i].endTime = endTime;
            allGames[i].opponent = opponent;
            allGames[i].betAmount = betAmount;
            allGames[i].initiatorPrice = initiatorPrice;
            allGames[i].opponentPrice = opponentPrice;
            allGames[i].finalAssetPrice = finalAssetPrice;
            allGames[i].gameStatus = gameStatus;
        }
        return allGames;
    }

    function getExactPriceOpenedPublicGames(address game) public view returns(ExactPriceStandalone.BetInfo[] memory) {
        ExactPriceStandalone exactPrice = ExactPriceStandalone(game);
        uint256 totalGames = exactPrice.totalBets();
        ExactPriceStandalone.BetInfo[] memory allGames = new ExactPriceStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 betAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            ExactPriceStandalone.Status gameStatus) = exactPrice.games(i);
            if(gameStatus == ExactPriceStandalone.Status.Created && opponent == address(0)) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].betAmount = betAmount;
                allGames[i].initiatorPrice = initiatorPrice;
                allGames[i].opponentPrice = opponentPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getExactPriceMyOpenedGames(address game, address player) public view returns(ExactPriceStandalone.BetInfo[] memory) {
        ExactPriceStandalone exactPrice = ExactPriceStandalone(game);
        uint256 totalGames = exactPrice.totalBets();
        ExactPriceStandalone.BetInfo[] memory allGames = new ExactPriceStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (
            bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 betAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            ExactPriceStandalone.Status gameStatus) = exactPrice.games(i);
            if(gameStatus == ExactPriceStandalone.Status.Created && opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].betAmount = betAmount;
                allGames[i].initiatorPrice = initiatorPrice;
                allGames[i].opponentPrice = opponentPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getExactPriceAllMyGames(address game, address player) public view returns(ExactPriceStandalone.BetInfo[] memory) {
        ExactPriceStandalone exactPrice = ExactPriceStandalone(game);
        uint256 totalGames = exactPrice.totalBets();
        ExactPriceStandalone.BetInfo[] memory allGames = new ExactPriceStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (
            bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 betAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            ExactPriceStandalone.Status gameStatus) = exactPrice.games(i);
            if(opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].betAmount = betAmount;
                allGames[i].initiatorPrice = initiatorPrice;
                allGames[i].opponentPrice = opponentPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }
    // function getMyOpenedGamesExactPrice() public view  returns (ExactPriceStandalone.BetInfo[] memory) {

    // }

    // function getGamesExactPrice(address game) public view returns(uint256[] memory, uint256[] memory) {
    //     ExactPriceStandalone exactPrice = ExactPriceStandalone(game);
    //     uint256 totalGames = exactPrice.totalBets();
    //     uint256 totalFinished;
    //     uint256 totalCreated;
    //     for(uint i; i< totalGames; i++) {
    //         (,,,,,,,,,ExactPriceStandalone.Status currentStatus) = exactPrice.games(i);
    //         if(currentStatus == ExactPriceStandalone.Status.Created) {
    //             totalCreated++;
    //         } else if (currentStatus == ExactPriceStandalone.Status.Finished) {
    //             totalFinished++;
    //         }
    //     }
    //     uint256[] memory finishedIds = new uint256[](totalFinished);
    //     uint256[] memory createdIds = new uint256[](totalCreated);
    //     totalCreated = 0;
    //     totalCreated = 0;
    //     for(uint i; i< totalGames; i++) {
    //         (,,,,,,,,,ExactPriceStandalone.Status currentStatus) = exactPrice.games(i);
    //         if(currentStatus == ExactPriceStandalone.Status.Created) {
    //             createdIds[totalCreated++] = i;
    //         } else if (currentStatus == ExactPriceStandalone.Status.Finished) {
    //             finishedIds[totalFinished++] = i;
    //         }
    //     }
    //     return (createdIds, finishedIds);
    // }

    function getOneVsOneUpDownData(address game) public view returns(UpDownStandalone.BetInfo[] memory) {
        UpDownStandalone updown = UpDownStandalone(game);
        uint256 totalGames = updown.totalBets();
        UpDownStandalone.BetInfo[] memory allGames = new UpDownStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool willGoUp,
            uint256 betAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            UpDownStandalone.Status gameStatus) = updown.games(i);
            allGames[i].feedId = feedId;
            allGames[i].initiator = initiator;
            allGames[i].startTime = startTime;
            allGames[i].endTime = endTime;
            allGames[i].opponent = opponent;
            allGames[i].willGoUp = willGoUp;
            allGames[i].betAmount = betAmount;
            allGames[i].startingAssetPrice = startingAssetPrice;
            allGames[i].finalAssetPrice = finalAssetPrice;
            allGames[i].gameStatus = gameStatus;
        }
        return allGames;
    }

    function getOneVsOneUpDownOpenedPublicGames(address game) public view returns(UpDownStandalone.BetInfo[] memory) {
        UpDownStandalone updown = UpDownStandalone(game);
        uint256 totalGames = updown.totalBets();
        UpDownStandalone.BetInfo[] memory allGames = new UpDownStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool willGoUp,
            uint256 betAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            UpDownStandalone.Status gameStatus) = updown.games(i);
            if(gameStatus == UpDownStandalone.Status.Created && opponent == address(0)) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].willGoUp = willGoUp;
                allGames[i].betAmount = betAmount;
                allGames[i].startingAssetPrice = startingAssetPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getOneVsOneUpDownMyOpenedGames(address game, address player) public view returns(UpDownStandalone.BetInfo[] memory) {
        UpDownStandalone updown = UpDownStandalone(game);
        uint256 totalGames = updown.totalBets();
        UpDownStandalone.BetInfo[] memory allGames = new UpDownStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool willGoUp,
            uint256 betAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            UpDownStandalone.Status gameStatus) = updown.games(i);
            if(gameStatus == UpDownStandalone.Status.Created && opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].willGoUp = willGoUp;
                allGames[i].betAmount = betAmount;
                allGames[i].startingAssetPrice = startingAssetPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getOneVsOneUpDownAllMyGames(address game, address player) public view returns(UpDownStandalone.BetInfo[] memory) {
        UpDownStandalone updown = UpDownStandalone(game);
        uint256 totalGames = updown.totalBets();
        UpDownStandalone.BetInfo[] memory allGames = new UpDownStandalone.BetInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool willGoUp,
            uint256 betAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            UpDownStandalone.Status gameStatus) = updown.games(i);
            if(opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].willGoUp = willGoUp;
                allGames[i].betAmount = betAmount;
                allGames[i].startingAssetPrice = startingAssetPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }
}
