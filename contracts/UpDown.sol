// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "./interfaces/ITreasury.sol";
import "./interfaces/IMockUpkeep.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UpDownGame is Ownable {
    event UpDownStart(
        uint48 startTime,
        uint48 endTime,
        uint256 depositAmount,
        int192 startingPrice,
        bytes32 indexed gameId
    );
    event UpDownNewPlayer(address player, bool isLong, uint256 depositAmount, bytes32 indexed gameId);
    event UpDownFinalized(int192 finalPrice, uint256 wonAmount, bytes32 indexed gameId);
    event UpDownCancelled(uint48 startTime, uint48 endTime, bytes32 indexed gameId);

    struct GameInfo {
        uint48 startTime;
        uint48 endTime;
        int192 startingPrice;
        uint256 depositAmount;
        bytes32 feedId;
        bytes32 gameId;
    }

    address[] public UpPlayers;
    address[] public DownPlayers;
    GameInfo public game;
    address public treasury;
    uint256 public fee = 100;

    constructor() Ownable(msg.sender) {}

    /**
     * Creates up/down game
     * @param startTime when the game will start
     * @param endTime when the game will end
     * @param depositAmount amount to enter the game
     * @param unverifiedReport Chainlink DataStreams report
     */
    function startGame(
        uint48 startTime,
        uint48 endTime,
        uint256 depositAmount,
        bytes memory unverifiedReport,
        bytes32 feedId
    ) public onlyOwner {
        require(game.startTime == 0, "Finish previous game first");
        address upkeep = ITreasury(treasury).upkeep();
        game.startingPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            feedId
        );
        game.feedId = feedId;
        game.startTime = startTime;
        game.endTime = endTime;
        game.depositAmount = depositAmount;
        game.gameId = keccak256(abi.encodePacked(startTime, block.timestamp, address(this)));
        emit UpDownStart(startTime, endTime, depositAmount, game.startingPrice, game.gameId);
    }

    /**
     * Take a participation in up/down game
     * @param isLong up = true, down = false
     */
    function play(bool isLong) isParticipating(msg.sender) public {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        if (isLong) {
            UpPlayers.push(msg.sender);
        } else {
            DownPlayers.push(msg.sender);
        }
        ITreasury(treasury).deposit(game.depositAmount, msg.sender);
        emit UpDownNewPlayer(msg.sender, isLong, game.depositAmount, game.gameId);
    }

    /**
     * Take a participation in up/down game
     * @param isLong up = true, down = false
     */
    function playWithPermit(
        bool isLong,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public isParticipating(msg.sender) {
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Game is closed for new players"
        );
        if (isLong) {
            UpPlayers.push(msg.sender);
        } else {
            DownPlayers.push(msg.sender);
        }
        ITreasury(treasury).depositWithPermit(game.depositAmount, msg.sender, deadline, v, r, s);
        emit UpDownNewPlayer(msg.sender, isLong, game.depositAmount, game.gameId);
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(bytes memory unverifiedReport) public onlyOwner {
        require(block.timestamp >= game.endTime, "Too early to finish");
        if(UpPlayers.length + DownPlayers.length < 2) {
            if(UpPlayers.length == 1) {
                ITreasury(treasury).refund(game.depositAmount, UpPlayers[0]);
                delete UpPlayers;
            } else if (DownPlayers.length == 1) {
                ITreasury(treasury).refund(game.depositAmount, UpPlayers[0]);
                delete DownPlayers;
            }
            emit UpDownCancelled(game.startTime, game.endTime, game.gameId);
            delete game;
            return;
        }
        address upkeep = ITreasury(treasury).upkeep();
        int192 finalPrice = IMockUpkeep(upkeep).verifyReport(
            unverifiedReport,
            game.feedId
        );
        GameInfo memory _game = game;
        if (finalPrice > _game.startingPrice) {
            uint256 wonAmount = _game.depositAmount +
                ((_game.depositAmount * DownPlayers.length) /
                    UpPlayers.length);
            for (uint i = 0; i < UpPlayers.length; i++) {
                ITreasury(treasury).distribute(
                    wonAmount,
                    UpPlayers[i],
                    _game.depositAmount,
                    fee
                );
            }
            emit UpDownFinalized(finalPrice, wonAmount, game.gameId);
        } else {
            uint256 wonAmount = _game.depositAmount +
                ((_game.depositAmount * UpPlayers.length) /
                    DownPlayers.length);
            for (uint i = 0; i < DownPlayers.length; i++) {
                ITreasury(treasury).distribute(
                    wonAmount,
                    DownPlayers[i],
                    _game.depositAmount,
                    fee
                );
            }
            emit UpDownFinalized(finalPrice, wonAmount, game.gameId);
        }

        delete DownPlayers;
        delete UpPlayers;
        delete game;
    }

    function getTotalPlayers() public view returns(uint256, uint256) {
        return (UpPlayers.length, DownPlayers.length);
    }

    /**
     * Checks if player is participating in the game
     * @param player player address
     */
    modifier isParticipating(address player) {
        for (uint i = 0; i < UpPlayers.length; i++) {
            require(UpPlayers[i] != player, "Already participating");
        }
        for (uint i = 0; i < DownPlayers.length; i++) {
            require(DownPlayers[i] != player, "Already participating");
        }
        _;
    }

    /**
     * onlyDAO
     * Do we need this?
     */
    function changeDepositAmount(uint256 newDepositAmount) public {
        game.depositAmount = newDepositAmount;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}
