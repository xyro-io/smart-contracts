//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITreasury {
    function deposits(
        address token,
        address target
    ) external view returns (uint256);

    function xyroToken() external view returns (address);
}

interface IOldTreasury {
    function deposits(address target) external view returns (uint256);
}

interface IGame {
    function fee() external view returns (uint256);
    function initiatorFee() external view returns (uint256);
}

interface IUpDown {
    struct UpDownDecodedInfo {
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        uint8 feedNumber;
    }
    function currentGameId() external view returns (bytes32);
    function startingPrice() external view returns (uint256);
    function totalDepositsUp() external view returns (uint256);
    function totalDepositsDown() external view returns (uint256);
    function decodeData() external view returns (UpDownDecodedInfo memory data);
}

interface IBullseye {
    struct BullseyeDecodedInfo {
        uint8 feedNumber;
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        bool isMultiParticipationOn;
    }
    function currentGameId() external view returns (bytes32);
    function depositAmount() external view returns (uint256);
    function getTotalPlayers() external view returns (uint256);
    function decodeData()
        external
        view
        returns (BullseyeDecodedInfo memory data);
}

contract FrontHelper {
    struct UpDownData {
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        uint8 feedNumber;
        bytes32 currentGameId;
        uint256 startingPrice;
        uint256 totalDepositsUp;
        uint256 totalDepositsDown;
    }

    struct BullseyeData {
        uint8 feedNumber;
        uint256 startTime;
        uint256 endTime;
        uint256 stopPredictAt;
        bool isMultiParticipationOn;
        bytes32 currentGameId;
        uint256 depositAmount;
        uint256 totalPlayers;
    }

    struct Data {
        uint256 balance;
        uint256 deposited;
        uint256 allowance;
        uint256 etherBalance;
    }

    struct DataV2 {
        uint256 balance;
        uint256 depositedOld;
        uint256 deposited;
        uint256 allowance;
        uint256 etherBalance;
        uint256 xyroBalance;
        uint256 xyroAllowance;
        uint256 xyroDeposited;
    }

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function getBalanceData(
        address treasury,
        address token,
        address[] calldata targets
    ) public view returns (Data[] memory) {
        Data[] memory data = new Data[](targets.length);
        for (uint i; i < targets.length; i++) {
            data[i] = Data({
                balance: IERC20(token).balanceOf(targets[i]),
                deposited: ITreasury(treasury).deposits(token, targets[i]),
                allowance: IERC20(token).allowance(targets[i], treasury),
                etherBalance: targets[i].balance
            });
        }
        return data;
    }

    function getBalanceDataBatch(
        address treasury,
        address[] calldata token,
        address[] calldata targets
    ) public view returns (Data[] memory) {
        Data[] memory data = new Data[](targets.length * token.length);
        uint256 index;
        for (uint i; i < targets.length; i++) {
            for (uint j; j < targets.length; j++) {
                data[index++] = Data({
                    balance: IERC20(token[j]).balanceOf(targets[i]),
                    deposited: ITreasury(treasury).deposits(
                        token[j],
                        targets[i]
                    ),
                    allowance: IERC20(token[j]).allowance(targets[i], treasury),
                    etherBalance: targets[i].balance
                });
            }
        }
        return data;
    }

    function getBalanceDataV2Batch(
        address treasury,
        address oldTreasury,
        address token,
        address[] calldata targets
    ) public view returns (DataV2[] memory) {
        DataV2[] memory data = new DataV2[](targets.length);
        for (uint i; i < targets.length; i++) {
            data[i] = DataV2({
                balance: IERC20(token).balanceOf(targets[i]),
                depositedOld: IOldTreasury(oldTreasury).deposits(targets[i]),
                deposited: ITreasury(treasury).deposits(token, targets[i]),
                allowance: IERC20(token).allowance(targets[i], treasury),
                etherBalance: targets[i].balance,
                xyroBalance: IERC20(ITreasury(treasury).xyroToken()).balanceOf(
                    targets[i]
                ),
                xyroAllowance: IERC20(ITreasury(treasury).xyroToken())
                    .allowance(targets[i], treasury),
                xyroDeposited: ITreasury(treasury).deposits(
                    ITreasury(treasury).xyroToken(),
                    targets[i]
                )
            });
        }
        return data;
    }

    function getBalanceDataV2(
        address treasury,
        address oldTreasury,
        address token,
        address target
    ) public view returns (DataV2 memory) {
        DataV2 memory data;
        data = DataV2({
            balance: IERC20(token).balanceOf(target),
            depositedOld: IOldTreasury(oldTreasury).deposits(target),
            deposited: ITreasury(treasury).deposits(token, target),
            allowance: IERC20(token).allowance(target, treasury),
            etherBalance: target.balance,
            xyroBalance: IERC20(ITreasury(treasury).xyroToken()).balanceOf(
                target
            ),
            xyroAllowance: IERC20(ITreasury(treasury).xyroToken()).allowance(
                target,
                treasury
            ),
            xyroDeposited: ITreasury(treasury).deposits(
                ITreasury(treasury).xyroToken(),
                target
            )
        });
        return data;
    }

    function getOldBalanceData(
        address treasury,
        address token,
        address[] calldata targets
    ) public view returns (Data[] memory) {
        Data[] memory data = new Data[](targets.length);
        for (uint i; i < targets.length; i++) {
            data[i] = Data({
                balance: IERC20(token).balanceOf(targets[i]),
                deposited: IOldTreasury(treasury).deposits(targets[i]),
                allowance: IERC20(token).allowance(targets[i], treasury),
                etherBalance: targets[i].balance
            });
        }
        return data;
    }

    function getUpDownData(
        address updown
    ) public view returns (UpDownData memory) {
        IUpDown.UpDownDecodedInfo memory data;
        return
            UpDownData({
                startTime: data.startTime,
                endTime: data.endTime,
                stopPredictAt: data.stopPredictAt,
                feedNumber: data.feedNumber,
                currentGameId: IUpDown(updown).currentGameId(),
                startingPrice: IUpDown(updown).startingPrice(),
                totalDepositsUp: IUpDown(updown).totalDepositsUp(),
                totalDepositsDown: IUpDown(updown).totalDepositsDown()
            });
    }

    function getBullseyeData(
        address bullseye
    ) public view returns (BullseyeData memory) {
        IBullseye.BullseyeDecodedInfo memory data;
        return
            BullseyeData({
                feedNumber: data.feedNumber,
                startTime: data.startTime,
                endTime: data.endTime,
                stopPredictAt: data.stopPredictAt,
                isMultiParticipationOn: data.isMultiParticipationOn,
                currentGameId: IBullseye(bullseye).currentGameId(),
                depositAmount: IBullseye(bullseye).depositAmount(),
                totalPlayers: IBullseye(bullseye).getTotalPlayers()
            });
    }
}
