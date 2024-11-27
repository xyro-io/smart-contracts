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

    struct FeeData {
        uint256 setupFee;
        uint256 setupInitiatorFee;
        uint256 oneVsOneFee;
        uint256 upDownfee;
        uint256 bullseyeFee;
    }

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function getFeeData(
        address oneVsOne,
        address setup,
        address upDown,
        address bullseye
    ) public view returns (FeeData memory) {
        return
            FeeData({
                setupFee: IGame(setup).fee(),
                setupInitiatorFee: IGame(setup).initiatorFee(),
                oneVsOneFee: IGame(oneVsOne).fee(),
                upDownfee: IGame(upDown).fee(),
                bullseyeFee: IGame(bullseye).fee()
            });
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
