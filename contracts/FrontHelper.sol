// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import { Bullseye } from "./Bullseye.sol";
import { UpDownGame } from "./UpDown.sol";
import { OneVsOneExactPrice } from "./OneVsOneExactPrice.sol";
import { OneVsOneUpDown } from "./OneVsOneUpDown.sol";

contract FrontHelper {

    enum UpDownGameStatus {
        TakeProfit,
        StopLoss,
        NotPlaying
    }

    struct UpDownInfo {
        uint48 startTime;
        uint48 enteranceClosedAt;
        uint48 endTime;
        int192 startingPrice;
        uint256 depositAmount;
        bytes32 feedId;
    }

    struct OneVsOneExactPriceInfo {
        bytes32 feedId;
        address initiator;
        uint48 startTime;
        uint48 enteranceClosedAt;
        uint48 endTime;
        address opponent;
        uint256 depositAmount;
        int192 initiatorPrice;
        int192 opponentPrice;
        int192 finalAssetPrice;
        OneVsOneExactPrice.Status gameStatus;
    }

    struct OneVsOneUpDownInfo {
        bytes32 feedId;
        address initiator;
        uint48 startTime;
        uint48 enteranceClosedAt;
        uint48 endTime;
        address opponent;
        bool isLong;
        uint256 depositAmount;
        int192 startingAssetPrice;
        int192 finalAssetPrice;
        OneVsOneUpDown.Status gameStatus;
    }

    struct BullseyeGuesses {
        address player;
        int192 guessPrice;
    }

    struct BullseyeInfo {
        bytes32 feedId;
        uint48 startTime;
        uint48 enteranceClosedAt;
        uint48 endTime;
        uint256 depositAmount;
    }

    function getBullseyeData(address game) public view returns (BullseyeInfo memory data, address[] memory, int192[] memory, uint256[] memory) {
        Bullseye bullseye = Bullseye(game);
        (bytes32 feedId, ,uint48 startTime,uint48 endTime, uint256 depositAmount) = bullseye.game();
        uint256 totalPlayers = bullseye.getTotalPlayers();
        address[] memory players = new address[](totalPlayers);
        int192[] memory assetPrices = new int192[](totalPlayers);
        uint256[] memory timestamps = new uint256[](totalPlayers);
        for(uint i; i < bullseye.getTotalPlayers(); i++) {
            players[i] = bullseye.players(i);
            assetPrices[i] = bullseye.assetPrices(players[i]);
            timestamps[i] = bullseye.playerTimestamp(players[i]);
        }
        data.feedId = feedId;
        data.startTime = startTime;
        data.enteranceClosedAt = startTime + (endTime - startTime) / 3;
        data.endTime = endTime;
        data.depositAmount = depositAmount;
        return (data, players, assetPrices, timestamps);
    }

    function getBullseyeGuesses(address game) public view returns (BullseyeGuesses[] memory) {
        Bullseye bullseye = Bullseye(game);
        uint256 totalPlayers = bullseye.getTotalPlayers();
        BullseyeGuesses[] memory data = new BullseyeGuesses[](totalPlayers);
        address[] memory players = new address[](totalPlayers);
        for(uint i; i < bullseye.getTotalPlayers(); i++) {
            data[i].player = bullseye.players(i);
            data[i].guessPrice = bullseye.assetPrices(players[i]);
        }
        return data;
    }

    function getBullseyePlayerInfo(address player, address game) public view returns (int192) {
        return Bullseye(game).assetPrices(player);
    }

    function getUpDownPlayerInfo(address player, address game) public view returns (UpDownGameStatus) {
        UpDownGame updown = UpDownGame(game);
        (uint256 totalUpPlayers, uint256 totalDownPlayers) = updown.getTotalPlayers();

        for(uint i; i <totalUpPlayers;i++) {
            if(player == updown.UpPlayers(i)) {
                return UpDownGameStatus.TakeProfit;
            }
        }

        for(uint i; i <totalDownPlayers;i++) {
            if(player == updown.DownPlayers(i)) {
                return UpDownGameStatus.StopLoss;
            }
        }

        return UpDownGameStatus.NotPlaying;
    }


    function getUpDownData(address game) public view returns (address[] memory, address[] memory, UpDownInfo memory data) {
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

        (uint48 startTime,uint48 endTime,int192 startingPrice,uint256 depositAmount,bytes32 feedId,) = updown.game();
        data.startTime = startTime; 
        data.enteranceClosedAt = startTime + (endTime - startTime) / 3;
        data.endTime = endTime;
        data.startingPrice = startingPrice;
        data.depositAmount = depositAmount;
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

    function getExactPriceData(address game) public view returns(OneVsOneExactPriceInfo[] memory) {
        OneVsOneExactPrice exactPrice = OneVsOneExactPrice(game);
        uint256 totalGames = exactPrice.totalGames();
        OneVsOneExactPriceInfo[] memory allGames = new OneVsOneExactPriceInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (   bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 depositAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            OneVsOneExactPrice.Status gameStatus) = exactPrice.games(i);
            allGames[i].feedId = feedId;
            allGames[i].initiator = initiator;
            allGames[i].startTime = startTime;
            allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
            allGames[i].endTime = endTime;
            allGames[i].opponent = opponent;
            allGames[i].depositAmount = depositAmount;
            allGames[i].initiatorPrice = initiatorPrice;
            allGames[i].opponentPrice = opponentPrice;
            allGames[i].finalAssetPrice = finalAssetPrice;
            allGames[i].gameStatus = gameStatus;
        }
        return allGames;
    }

    function getExactPriceOpenedPublicGames(address game) public view returns(OneVsOneExactPriceInfo[] memory) {
        OneVsOneExactPrice exactPrice = OneVsOneExactPrice(game);
        uint256 totalGames = exactPrice.totalGames();
        OneVsOneExactPriceInfo[] memory allGames = new OneVsOneExactPriceInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 depositAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            OneVsOneExactPrice.Status gameStatus) = exactPrice.games(i);
            if(gameStatus == OneVsOneExactPrice.Status.Created && opponent == address(0)) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].depositAmount = depositAmount;
                allGames[i].initiatorPrice = initiatorPrice;
                allGames[i].opponentPrice = opponentPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getExactPriceMyOpenedGames(address game, address player) public view returns(OneVsOneExactPriceInfo[] memory) {
        OneVsOneExactPrice exactPrice = OneVsOneExactPrice(game);
        uint256 totalGames = exactPrice.totalGames();
        OneVsOneExactPriceInfo[] memory allGames = new OneVsOneExactPriceInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (
            bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 depositAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            OneVsOneExactPrice.Status gameStatus) = exactPrice.games(i);
            if(gameStatus == OneVsOneExactPrice.Status.Created && opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].depositAmount = depositAmount;
                allGames[i].initiatorPrice = initiatorPrice;
                allGames[i].opponentPrice = opponentPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getExactPriceAllMyGames(address game, address player) public view returns(OneVsOneExactPriceInfo[] memory) {
        OneVsOneExactPrice exactPrice = OneVsOneExactPrice(game);
        uint256 totalGames = exactPrice.totalGames();
        OneVsOneExactPriceInfo[] memory allGames = new OneVsOneExactPriceInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
        (
            bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            uint256 depositAmount,
            int192 initiatorPrice,
            int192 opponentPrice,
            int192 finalAssetPrice,
            OneVsOneExactPrice.Status gameStatus) = exactPrice.games(i);
            if(opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].depositAmount = depositAmount;
                allGames[i].initiatorPrice = initiatorPrice;
                allGames[i].opponentPrice = opponentPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    // function getGamesExactPrice(address game) public view returns(uint256[] memory, uint256[] memory) {
    //     OneVsOneExactPrice exactPrice = OneVsOneExactPrice(game);
    //     uint256 totalGames = exactPrice.totalGames();
    //     uint256 totalFinished;
    //     uint256 totalCreated;
    //     for(uint i; i< totalGames; i++) {
    //         (,,,,,,,,,OneVsOneExactPrice.Status currentStatus) = exactPrice.games(i);
    //         if(currentStatus == OneVsOneExactPrice.Status.Created) {
    //             totalCreated++;
    //         } else if (currentStatus == OneVsOneExactPrice.Status.Finished) {
    //             totalFinished++;
    //         }
    //     }
    //     uint256[] memory finishedIds = new uint256[](totalFinished);
    //     uint256[] memory createdIds = new uint256[](totalCreated);
    //     totalCreated = 0;
    //     totalCreated = 0;
    //     for(uint i; i< totalGames; i++) {
    //         (,,,,,,,,,OneVsOneExactPrice.Status currentStatus) = exactPrice.games(i);
    //         if(currentStatus == OneVsOneExactPrice.Status.Created) {
    //             createdIds[totalCreated++] = i;
    //         } else if (currentStatus == OneVsOneExactPrice.Status.Finished) {
    //             finishedIds[totalFinished++] = i;
    //         }
    //     }
    //     return (createdIds, finishedIds);
    // }

    function getOneVsOneUpDownData(address game) public view returns(OneVsOneUpDownInfo[] memory) {
        OneVsOneUpDown updown = OneVsOneUpDown(game);
        uint256 totalGames = updown.totalGames();
        OneVsOneUpDownInfo[] memory allGames = new OneVsOneUpDownInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool isLong,
            uint256 depositAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            OneVsOneUpDown.Status gameStatus) = updown.games(i);
            allGames[i].feedId = feedId;
            allGames[i].initiator = initiator;
            allGames[i].startTime = startTime;
            allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
            allGames[i].endTime = endTime;
            allGames[i].opponent = opponent;
            allGames[i].isLong = isLong;
            allGames[i].depositAmount = depositAmount;
            allGames[i].startingAssetPrice = startingAssetPrice;
            allGames[i].finalAssetPrice = finalAssetPrice;
            allGames[i].gameStatus = gameStatus;
        }
        return allGames;
    }

    function getOneVsOneUpDownOpenedPublicGames(address game) public view returns(OneVsOneUpDownInfo[] memory) {
        OneVsOneUpDown updown = OneVsOneUpDown(game);
        uint256 totalGames = updown.totalGames();
        OneVsOneUpDownInfo[] memory allGames = new OneVsOneUpDownInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool isLong,
            uint256 depositAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            OneVsOneUpDown.Status gameStatus) = updown.games(i);
            if(gameStatus == OneVsOneUpDown.Status.Created && opponent == address(0)) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].isLong = isLong;
                allGames[i].depositAmount = depositAmount;
                allGames[i].startingAssetPrice = startingAssetPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getOneVsOneUpDownMyOpenedGames(address game, address player) public view returns(OneVsOneUpDownInfo[] memory) {
        OneVsOneUpDown updown = OneVsOneUpDown(game);
        uint256 totalGames = updown.totalGames();
        OneVsOneUpDownInfo[] memory allGames = new OneVsOneUpDownInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool isLong,
            uint256 depositAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            OneVsOneUpDown.Status gameStatus) = updown.games(i);
            if(gameStatus == OneVsOneUpDown.Status.Created && opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].isLong = isLong;
                allGames[i].depositAmount = depositAmount;
                allGames[i].startingAssetPrice = startingAssetPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }

    function getOneVsOneUpDownAllMyGames(address game, address player) public view returns(OneVsOneUpDownInfo[] memory) {
        OneVsOneUpDown updown = OneVsOneUpDown(game);
        uint256 totalGames = updown.totalGames();
        OneVsOneUpDownInfo[] memory allGames = new OneVsOneUpDownInfo[](totalGames);
        for(uint i; i< totalGames; i++) {
            (bytes32 feedId,
            address initiator,
            uint48 startTime,
            uint48 endTime,
            address opponent,
            bool isLong,
            uint256 depositAmount,
            int192 startingAssetPrice,
            int192 finalAssetPrice,
            OneVsOneUpDown.Status gameStatus) = updown.games(i);
            if(opponent == player) {
                allGames[i].feedId = feedId;
                allGames[i].initiator = initiator;
                allGames[i].startTime = startTime;
                allGames[i].enteranceClosedAt = startTime + (endTime - startTime) / 3;
                allGames[i].endTime = endTime;
                allGames[i].opponent = opponent;
                allGames[i].isLong = isLong;
                allGames[i].depositAmount = depositAmount;
                allGames[i].startingAssetPrice = startingAssetPrice;
                allGames[i].finalAssetPrice = finalAssetPrice;
                allGames[i].gameStatus = gameStatus;
            }
        }
        return allGames;
    }
}
