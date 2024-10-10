//  SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITreasury {
    function deposits(address target) external view returns (uint256);
}

contract FrontHelper {
    struct Data {
        uint256 balance;
        uint256 deposited;
        uint256 allowance;
        uint256 etherBalance;
    }

    address public token;
    address public treasury;

    constructor(address _token, address _treasury) {
        treasury = _treasury;
        token = _token;
    }

    function getBalanceData(
        address[] calldata targets
    ) public view returns (Data[] memory) {
        Data[] memory data = new Data[](targets.length);
        for (uint i; i < targets.length; i++) {
            data[i] = Data({
                balance: IERC20(token).balanceOf(targets[i]),
                deposited: ITreasury(treasury).deposits(targets[i]),
                allowance: IERC20(token).allowance(targets[i], treasury),
                etherBalance: targets[i].balance
            });
        }
        return data;
    }
}
