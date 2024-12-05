//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITreasury {
    function deposits(
        address token,
        address target
    ) external view returns (uint256);
}

interface IOldTreasury {
    function deposits(address target) external view returns (uint256);
}

interface IGame {
    function fee() external view returns (uint256);
    function initiatorFee() external view returns (uint256);
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
        uint256 allowanceOld;
        uint256 depositedOld;
        uint256 deposited;
        uint256 allowance;
        uint256 etherBalance;
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
                allowanceOld: IERC20(token).allowance(targets[i], oldTreasury),
                depositedOld: IOldTreasury(oldTreasury).deposits(targets[i]),
                deposited: ITreasury(treasury).deposits(token, targets[i]),
                allowance: IERC20(token).allowance(targets[i], treasury),
                etherBalance: targets[i].balance
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
            allowanceOld: IERC20(token).allowance(target, oldTreasury),
            depositedOld: IOldTreasury(oldTreasury).deposits(target),
            deposited: ITreasury(treasury).deposits(token, target),
            allowance: IERC20(token).allowance(target, treasury),
            etherBalance: target.balance
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
