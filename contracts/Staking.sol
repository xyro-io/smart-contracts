// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC20.sol";

contract XyroStaking {
    address public token;
    address public governanceToken;
    uint256 public totalStaked;
    uint256 public constant APR_DENOMINATOR = 10000;

    struct Stake {
        uint256 stakedBalance;
        uint256 startTime;
        uint256 lockedFor;
    }

    mapping(address => Stake[]) public stakes;

    constructor(address _tokenAddress, address _governanceToken) {
        token = _tokenAddress;
        governanceToken = _governanceToken;
    }

    function stake(uint256 amount, uint256 lockPeriod) external {
        require(amount > 0, "Amount must be greater than zero");
        require(
            lockPeriod == 30 days ||
                lockPeriod == 90 days ||
                lockPeriod == 180 days ||
                lockPeriod == 365 days,
            "Invalid lock period"
        );
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );
        IERC20Mint(governanceToken).mint(msg.sender, amount);
        totalStaked += amount;
        stakes[msg.sender].push(
            Stake({
                stakedBalance: amount,
                startTime: block.timestamp,
                lockedFor: lockPeriod
            })
        );
    }

    function unstake(uint256 stakeId) external {
        Stake memory currentStake = stakes[msg.sender][stakeId];
        require(
            IERC20Mint(governanceToken).balanceOf(msg.sender) >=
                currentStake.stakedBalance,
            "Can't unstake without governance"
        );
        require(
            currentStake.startTime >= currentStake.lockedFor,
            "Can't unstake so early"
        );
        IERC20Mint(governanceToken).burn(
            msg.sender,
            currentStake.stakedBalance
        );
        SafeERC20.safeTransfer(IERC20(token), msg.sender, earned(stakeId));
        //can be done without deleting but with additional state variable
        delete stakes[msg.sender][stakeId];
    }

    function earned(uint256 stakeId) public view returns (uint256 totalEarned) {
        Stake memory currentStake = stakes[msg.sender][stakeId];
        if (currentStake.lockedFor == 30 days) {
            totalEarned =
                currentStake.stakedBalance +
                (currentStake.stakedBalance * 2500) /
                APR_DENOMINATOR;
        } else if (currentStake.lockedFor == 90 days) {
            totalEarned =
                currentStake.stakedBalance +
                (currentStake.stakedBalance * 5000) /
                APR_DENOMINATOR;
        } else if (currentStake.lockedFor == 180 days) {
            totalEarned =
                currentStake.stakedBalance +
                (currentStake.stakedBalance * 8000) /
                APR_DENOMINATOR;
        } else if (currentStake.lockedFor == 365 days) {
            totalEarned =
                currentStake.stakedBalance +
                (currentStake.stakedBalance * 15000) /
                APR_DENOMINATOR;
        }
    }

    function stakedBalance() public view returns (uint256 userStaked) {
        for (uint i; i < stakes[msg.sender].length; i++) {
            userStaked += stakes[msg.sender][i].stakedBalance;
        }
    }
}
