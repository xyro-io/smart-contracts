// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import { Bullseye } from "./Bullseye.sol";
import { UpDown } from "./UpDown.sol";

contract FrontHelper {

    enum UpDownStatus {
        Long,
        Short,
        NotPlaying
    }

    struct UpDownInfo {
        uint256 startTime;
        uint48 endTime;
        uint48 stopPredictAt;
        int192 startingPrice;
        bytes32 feedId;
        bytes32 gameId;
        uint256 totalDepositsUp;
        uint256 totalDepositsDown;
    }

    struct BullseyeGuesses {
        address player;
        int192 guessPrice;
    }

    struct BullseyeInfo {
        bytes32 feedId;
        bytes32 gameId;
        uint256 startTime;
        uint48 stopPredictAt;
        uint48 endTime;
        uint256 depositAmount;
    }

    function getBullseyeData(address game) public view returns (BullseyeInfo memory data, address[] memory, int192[] memory, uint256[] memory) {
        Bullseye bullseye = Bullseye(game);
        (bytes32 feedId, bytes32 gameId, uint256 startTime, uint48 endTime, uint48 stopPredictAt, uint256 depositAmount) = bullseye.game();
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
        data.gameId = gameId;
        data.startTime = startTime;
        data.stopPredictAt = stopPredictAt;
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

    function getUpDownPlayerInfo(address player, address game) public view returns (UpDownStatus) {
        UpDown updown = UpDown(game);
        (uint256 totalUpPlayers, uint256 totalDownPlayers) = updown.getTotalPlayers();

        for(uint i; i <totalUpPlayers;i++) {
            if(player == updown.UpPlayers(i)) {
                return UpDownStatus.Long;
            }
        }

        for(uint i; i <totalDownPlayers;i++) {
            if(player == updown.DownPlayers(i)) {
                return UpDownStatus.Short;
            }
        }

        return UpDownStatus.NotPlaying;
    }


    function getUpDownData(address game) public view returns (address[] memory, address[] memory, UpDownInfo memory data) {
        UpDown updown = UpDown(game);
        (uint256 totalUpPlayers, uint256 totalDownPlayers) = updown.getTotalPlayers();
        address[] memory upPlayers = new address[](totalUpPlayers);
        address[] memory downPlayers = new address[](totalDownPlayers);
        for(uint i; i <totalUpPlayers;i++) {
            upPlayers[i] = updown.UpPlayers(i);
        }

        for(uint i; i <totalDownPlayers;i++) {
            downPlayers[i] = updown.DownPlayers(i);
        }

        (uint256 startTime, uint48 endTime, uint48 stopPredictAt, int192 startingPrice, bytes32 feedId, bytes32 gameId, uint256 totalDepositsUp, uint256 totalDepositsDown) = updown.game();
        data.startTime = startTime; 
        data.endTime = endTime;
        data.stopPredictAt = stopPredictAt;
        data.startingPrice = startingPrice;
        data.feedId = feedId;
        data.gameId = gameId;
        data.totalDepositsUp = totalDepositsUp;
        data.totalDepositsDown = totalDepositsDown;
        return ( upPlayers, downPlayers, data);
    }

    function getUpDownPlayers(address game) public view returns (address[] memory, address[] memory) {
        UpDown updown = UpDown(game);
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

}
