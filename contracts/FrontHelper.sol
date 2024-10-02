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
    }

    address public token;
    address public treasury;

    constructor(address _token, address _treasury) {
        treasury = _treasury;
        token = _token;
    }

    function getBalanceData(address target) public view returns (Data memory) {
        return
            Data({
                balance: IERC20(token).balanceOf(target),
                deposited: ITreasury(treasury).deposits(target),
                allowance: IERC20(token).allowance(target, treasury)
            });
    }
}
