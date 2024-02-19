// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract XyroStaking {
    address public token;
    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastClaimTime;
    uint256 public rewardRate; //недельный рейт
    
    constructor(address _tokenAddress, uint256 _rewardRate) {
        token = _tokenAddress;
        rewardRate = _rewardRate;
    }
    
    function stake(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        SafeERC20.safeTransferFrom(IERC20(token),msg.sender, address(this), amount);
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;
        lastClaimTime[msg.sender] = block.timestamp;
    }
    
    function unstake(uint256 amount) external {
        require(amount > 0 && amount <= stakedBalance[msg.sender], "Invalid amount");
        require(lastClaimTime[msg.sender] >= 3 weeks, "Can't unstake so early");
        SafeERC20.safeTransfer(IERC20(token), msg.sender, earned(msg.sender));
        lastClaimTime[msg.sender] = block.timestamp;
        totalStaked -= amount;
        stakedBalance[msg.sender] -= amount;
    }
    
    //Можно прикрутить зависимость награды от статистики в играх
    function earned(address account) public view returns (uint256) {
        uint256 timeSinceLastClaim = block.timestamp - lastClaimTime[account];
        return stakedBalance[account] + (stakedBalance[account] * rewardRate * timeSinceLastClaim/1 weeks) / 10000;
    }
    
    function setRewardRate(uint256 _rewardRate) external {
        rewardRate = _rewardRate;
    }
}
