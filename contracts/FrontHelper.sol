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

interface IUniPool {
    struct Slot0 {
        uint160 sqrtPriceX96;
        int24 tick;
        uint16 observationIndex;
        uint16 observationCardinality;
        uint16 observationCardinalityNext;
        uint8 feeProtocol;
        bool unlocked;
    }
    function slot0() external view returns (Slot0 memory);
}

contract FrontHelper {
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
        uint160 sqrtPriceX96;
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
        IUniPool.Slot0 memory poolData;
        poolData = IUniPool(0xcD3439B962b3FCF9163d6cE9B498949d7Ed1eF14).slot0();
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
                ),
                sqrtPriceX96: poolData.sqrtPriceX96
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
        IUniPool.Slot0 memory poolData;
        poolData = IUniPool(0xcD3439B962b3FCF9163d6cE9B498949d7Ed1eF14).slot0();
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
            ),
            sqrtPriceX96: poolData.sqrtPriceX96
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
}
