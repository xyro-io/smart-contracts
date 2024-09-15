// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ITreasury} from "./interfaces/ITreasury.sol";
import {IDataStreamsVerifier} from "./interfaces/IDataStreamsVerifier.sol";

contract UpDown is AccessControl {
    event NewTreasury(address newTreasury);
    event UpDownCreated(
        uint256 startTime,
        uint24 stopPredictAt,
        uint32 endTime,
        uint8 feedNumber,
        bytes32 gameId
    );
    event UpDownNewPlayer(
        address player,
        bool isLong,
        uint256 depositAmount,
        bytes32 gameId
    );
    event UpDownStarted(int192 startingPrice, bytes32 gameId);
    event UpDownFinalized(int192 finalPrice, bool isLong, bytes32 gameId);
    event UpDownCancelled(bytes32 gameId);

    struct GameInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        uint256 startingPrice;
        uint256 totalDepositsUp;
        uint256 totalDepositsDown;
        uint256 totalRakebackDown;
        uint256 totalRakebackUp;
        uint8 feedNumber;
    }

    uint256 packedData;

    address[] public UpPlayers;
    address[] public DownPlayers;
    mapping(address => uint256) public depositAmounts;
    bytes32 public currentGameId;
    address public treasury;
    uint256 public maxPlayers = 100;
    uint256 public fee = 1500;
    uint256 public minDepositAmount = 5000;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * Creates up/down game
     * @param endTime when the game will end
     */
    function startGame(
        uint32 endTime,
        uint24 stopPredictAt,
        uint8 feedNumber
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(packedData == 0, "Finish previous game first");
        require(
            endTime > block.timestamp + stopPredictAt,
            "Ending time must be higher"
        );
        packedData = (block.timestamp |
            (uint256(stopPredictAt) << 32) |
            (uint256(endTime) << 56) |
            (uint256(feedNumber) << 88));
        currentGameId = keccak256(
            abi.encodePacked(endTime, block.timestamp, address(this))
        );
        emit UpDownCreated(
            block.timestamp,
            stopPredictAt,
            endTime,
            feedNumber,
            currentGameId
        );
    }

    /**
     * Take a participation in up/down game and deposit funds
     * @param isLong up = true, down = false
     * @param depositAmount amount to deposit in game
     */
    function play(bool isLong, uint256 depositAmount) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(depositAmounts[msg.sender] == 0, "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt + game.startTime > block.timestamp,
            "Game is closed for new players"
        );
        uint256 rakeback = ITreasury(treasury).depositAndLock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );
        depositAmount -= rakeback;
        if (isLong) {
            require(
                depositAmount + game.totalDepositsUp <= type(uint32).max,
                "Up is closed for new players"
            );
            //rewrites totalDepositsUp
            packedData =
                ((packedData & ~(uint256(0xFFFFFFFF) << 160)) &
                    (packedData & ~(uint256(0xFFFFFFFF) << 224))) |
                (((depositAmount + game.totalDepositsUp) << 160) |
                    ((rakeback + game.totalRakebackUp) << 224));
            UpPlayers.push(msg.sender);
        } else {
            require(
                depositAmount + game.totalDepositsDown <= type(uint32).max,
                "Down is closed for new players"
            );
            //rewrites totalDepositsDown
            packedData =
                ((packedData & ~(uint256(0xFFFFFFFF) << 128)) &
                    (packedData & ~(uint256(0xFFFFFFFF) << 192))) |
                (((depositAmount + game.totalDepositsDown) << 128) |
                    ((rakeback + game.totalRakebackDown) << 192));
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, currentGameId);
    }

    /**
     * Take a participation in up/down game using deposited funds
     * @param isLong up = true, down = false
     * @param depositAmount amount to deposit in game
     */
    function playWithDeposit(bool isLong, uint256 depositAmount) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(depositAmounts[msg.sender] == 0, "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt + game.startTime > block.timestamp,
            "Game is closed for new players"
        );
        uint256 rakeback = ITreasury(treasury).lock(
            depositAmount,
            msg.sender,
            currentGameId,
            true
        );
        depositAmount -= rakeback;
        if (isLong) {
            require(
                depositAmount + game.totalDepositsUp <= type(uint32).max,
                "Up is closed for new players"
            );
            //rewrites totalDepositsUp
            packedData =
                ((packedData & ~(uint256(0xFFFFFFFF) << 160)) &
                    (packedData & ~(uint256(0xFFFFFFFF) << 224))) |
                (((depositAmount + game.totalDepositsUp) << 160) |
                    ((rakeback + game.totalRakebackUp) << 224));
            UpPlayers.push(msg.sender);
        } else {
            require(
                depositAmount + game.totalDepositsDown <= type(uint32).max,
                "Down is closed for new players"
            );
            //rewrites totalDepositsDown
            packedData =
                ((packedData & ~(uint256(0xFFFFFFFF) << 128)) &
                    (packedData & ~(uint256(0xFFFFFFFF) << 192))) |
                (((depositAmount + game.totalDepositsDown) << 128) |
                    ((rakeback + game.totalRakebackDown) << 192));
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, currentGameId);
    }

    /**
     * Take a participation in up/down game and deposit funds
     * @param isLong up = true, down = false
     */
    function playWithPermit(
        bool isLong,
        uint256 depositAmount,
        ITreasury.PermitData calldata permitData
    ) public {
        require(depositAmount >= minDepositAmount, "Wrong deposit amount");
        require(depositAmounts[msg.sender] == 0, "Already participating");
        require(
            DownPlayers.length + UpPlayers.length + 1 <= maxPlayers,
            "Max player amount reached"
        );
        GameInfo memory game = decodeData();
        require(
            game.stopPredictAt + game.startTime > block.timestamp,
            "Game is closed for new players"
        );
        uint256 rakeback = ITreasury(treasury).depositAndLockWithPermit(
            depositAmount,
            msg.sender,
            currentGameId,
            true,
            permitData.deadline,
            permitData.v,
            permitData.r,
            permitData.s
        );
        depositAmount -= rakeback;
        if (isLong) {
            require(
                depositAmount + game.totalDepositsUp <= type(uint32).max,
                "Up is closed for new players"
            );
            //rewrites totalDepositsUp
            packedData =
                ((packedData & ~(uint256(0xFFFFFFFF) << 160)) &
                    (packedData & ~(uint256(0xFFFFFFFF) << 224))) |
                (((depositAmount + game.totalDepositsUp) << 160) |
                    ((rakeback + game.totalRakebackUp) << 224));
            UpPlayers.push(msg.sender);
        } else {
            require(
                depositAmount + game.totalDepositsDown <= type(uint32).max,
                "Down is closed for new players"
            );
            //rewrites totalDepositsDown
            packedData =
                ((packedData & ~(uint256(0xFFFFFFFF) << 128)) &
                    (packedData & ~(uint256(0xFFFFFFFF) << 192))) |
                (((depositAmount + game.totalDepositsDown) << 128) |
                    ((rakeback + game.totalRakebackDown) << 192));
            DownPlayers.push(msg.sender);
        }
        depositAmounts[msg.sender] = depositAmount;
        emit UpDownNewPlayer(msg.sender, isLong, depositAmount, currentGameId);
    }

    function setStartingPrice(
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory game = decodeData();
        require(
            block.timestamp >= game.stopPredictAt + game.startTime,
            "Too early"
        );
        require(
            UpPlayers.length != 0 || DownPlayers.length != 0,
            "Not enough players"
        );
        address upkeep = ITreasury(treasury).upkeep();
        (int192 startingPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        require(
            block.timestamp - priceTimestamp <= 1 minutes,
            "Old chainlink report"
        );
        packedData |= uint192(startingPrice / 1e14) << 96;
        emit UpDownStarted(startingPrice, currentGameId);
    }

    /**
     * Finalizes up/down game and distributes rewards to players
     * @param unverifiedReport Chainlink DataStreams report
     */
    function finalizeGame(
        bytes memory unverifiedReport
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        GameInfo memory game = decodeData();
        require(packedData != 0, "Start the game first");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (UpPlayers.length == 0 || DownPlayers.length == 0) {
            if (UpPlayers.length > 0) {
                for (uint i; i < UpPlayers.length; i++) {
                    ITreasury(treasury).refund(
                        depositAmounts[UpPlayers[i]],
                        UpPlayers[i],
                        currentGameId
                    );
                    depositAmounts[UpPlayers[i]] = 0;
                }
                delete UpPlayers;
            } else if (DownPlayers.length > 0) {
                for (uint i; i < DownPlayers.length; i++) {
                    ITreasury(treasury).refund(
                        depositAmounts[DownPlayers[i]],
                        DownPlayers[i],
                        currentGameId
                    );
                    depositAmounts[DownPlayers[i]] = 0;
                }
                delete DownPlayers;
            }
            emit UpDownCancelled(currentGameId);
            packedData = 0;
            currentGameId = bytes32(0);
            return;
        }
        require(game.startingPrice != 0, "Starting price must be set");
        address upkeep = ITreasury(treasury).upkeep();
        (int192 finalPrice, uint32 priceTimestamp) = IDataStreamsVerifier(
            upkeep
        ).verifyReportWithTimestamp(unverifiedReport, game.feedNumber);
        //block.timestamp must be > priceTimestamp
        require(
            priceTimestamp - game.endTime <= 1 minutes ||
                block.timestamp - priceTimestamp <= 1 minutes,
            "Old chainlink report"
        );
        GameInfo memory _game = game;
        if (uint192(finalPrice / 1e14) > _game.startingPrice) {
            uint256 finalRate = ITreasury(treasury).calculateUpDownRate(
                _game.totalDepositsDown,
                _game.totalDepositsUp + _game.totalRakebackUp,
                fee,
                currentGameId
            );
            for (uint i = 0; i < UpPlayers.length; i++) {
                ITreasury(treasury).distributeWithoutFee(
                    finalRate,
                    UpPlayers[i],
                    fee,
                    depositAmounts[UpPlayers[i]],
                    currentGameId
                );
            }
            emit UpDownFinalized(finalPrice, true, currentGameId);
        } else if (uint192(finalPrice / 1e14) < _game.startingPrice) {
            uint256 finalRate = ITreasury(treasury).calculateUpDownRate(
                _game.totalDepositsUp,
                _game.totalDepositsDown + _game.totalRakebackDown,
                fee,
                currentGameId
            );
            for (uint i = 0; i < DownPlayers.length; i++) {
                ITreasury(treasury).distributeWithoutFee(
                    finalRate,
                    DownPlayers[i],
                    fee,
                    depositAmounts[DownPlayers[i]],
                    currentGameId
                );
            }
            emit UpDownFinalized(finalPrice, false, currentGameId);
        } else if (uint192(finalPrice / 1e14) == _game.startingPrice) {
            for (uint i; i < UpPlayers.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[UpPlayers[i]],
                    UpPlayers[i],
                    currentGameId
                );
                depositAmounts[UpPlayers[i]] = 0;
            }
            delete UpPlayers;
            for (uint i; i < DownPlayers.length; i++) {
                ITreasury(treasury).refund(
                    depositAmounts[DownPlayers[i]],
                    DownPlayers[i],
                    currentGameId
                );
                depositAmounts[DownPlayers[i]] = 0;
            }
            delete DownPlayers;
            emit UpDownCancelled(currentGameId);
            packedData = 0;
            currentGameId = bytes32(0);
            return;
        }

        for (uint i = 0; i < UpPlayers.length; i++) {
            depositAmounts[UpPlayers[i]] = 0;
        }
        for (uint i = 0; i < DownPlayers.length; i++) {
            depositAmounts[DownPlayers[i]] = 0;
        }
        ITreasury(treasury).setGameFinished(currentGameId);
        delete DownPlayers;
        delete UpPlayers;
        currentGameId = bytes32(0);
        packedData = 0;
    }

    function closeGame() public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(currentGameId != bytes32(0), "Game not started");
        for (uint i; i < UpPlayers.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[UpPlayers[i]],
                UpPlayers[i],
                currentGameId
            );
            depositAmounts[UpPlayers[i]] = 0;
        }
        delete UpPlayers;
        for (uint i; i < DownPlayers.length; i++) {
            ITreasury(treasury).refund(
                depositAmounts[DownPlayers[i]],
                DownPlayers[i],
                currentGameId
            );
            depositAmounts[DownPlayers[i]] = 0;
        }
        delete DownPlayers;
        emit UpDownCancelled(currentGameId);
        currentGameId = bytes32(0);
        packedData = 0;
    }

    /**
     * Returns decoded game data
     */
    function decodeData() public view returns (GameInfo memory data) {
        data.startTime = uint256(uint32(packedData));
        data.stopPredictAt = uint256(uint24(packedData >> 32));
        data.endTime = uint256(uint32(packedData >> 56));
        data.feedNumber = uint8(packedData >> 88);
        data.startingPrice = uint256(uint32(packedData >> 96));
        data.totalDepositsDown = uint256(uint32(packedData >> 128));
        data.totalDepositsUp = uint256(uint32(packedData >> 160));
        data.totalRakebackDown = uint256(uint32(packedData >> 192));
        data.totalRakebackUp = uint256(uint32(packedData >> 224));
    }

    /**
     * Returns total amount of participants
     */
    function getTotalPlayers() public view returns (uint256, uint256) {
        return (UpPlayers.length, DownPlayers.length);
    }

    /**
     * Change maximum players number
     * @param newMax new maximum number
     */
    function setMaxPlayers(uint256 newMax) public onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPlayers = newMax;
    }

    /**
     * Change treasury address
     * @param newTreasury new treasury address
     */
    function setTreasury(
        address newTreasury
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Zero address");
        treasury = newTreasury;
        emit NewTreasury(newTreasury);
    }

    /**
     * Change allowed minimal deposit amount
     * @param newMinAmount new minimal deposit amount
     */
    function changeMinDepositAmount(
        uint256 newMinAmount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minDepositAmount = newMinAmount;
    }

    /**
     * Change fee
     * @param newFee new fee in bp
     */
    function setFee(uint256 newFee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        fee = newFee;
    }
}
