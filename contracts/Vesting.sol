// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract XyroVesting {
    address public beneficiary;
    address public token;
    uint256 public start;
    uint256 public duration;
    uint256 public totalAmount;
    uint256 public released;
    //поменять названия переменных в остальных контрактах
    constructor(
        address _beneficiary,
        uint256 _start,
        uint256 _duration,
        uint256 _totalAmount,
        address _token
    ) {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(_start >= block.timestamp, "Start time must be in the future");
        require(_duration > 0, "Duration must be greater than zero");
        require(_totalAmount > 0, "Total amount must be greater than zero");
        require(_token != address(0), "Invalid token address");
        token = _token;
        beneficiary = _beneficiary;
        start = _start;
        duration = _duration;
        totalAmount = _totalAmount;
    }

    function release() public {
        uint256 vested = vestedAmount();
        require(vested > released, "No tokens to release");

        uint256 amount = vested - released;
        released = vested;

        SafeERC20.safeTransfer(IERC20(token), beneficiary, amount);
    }

    //можно выдавать не в зависимости от времени, а определенный amount несколькими этапами
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < start) {
            return 0;
        } else if (block.timestamp >= start + duration) {
            return totalAmount;
        } else {
            return (totalAmount * (block.timestamp - start)) / duration;
        }
    }

    //onlyDAO
    function increaseDuration(uint256 _duration) public {
        duration = _duration;
    }
}
