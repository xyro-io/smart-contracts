// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStaking {
    struct User {
        uint256 totalInvested;
        uint256 totalWithdrawn;
        uint32 lastPayout;
        uint32 depositTime;
        uint256 totalClaimed;
    }
    function users(
        uint256 pid,
        address staker
    ) external view returns (User memory);
    function poolLength() external view returns (uint256);
}

interface IToken {
    function balanceOf(address holder) external view returns (uint256);
}

contract StakingHelper {
    IToken constant XYRO = IToken(0x4eDDb15A0abfa2c349e8065aF9214E942d9A6D36);
    IStaking constant stakingContract =
        IStaking(0x873f9d1FCe73bc58dE54eCDEda3e71132C27341B);
    function getStakingData(
        address user
    ) public view returns (IStaking.User memory) {
        return stakingContract.users(0, user);
    }

    function getStakingDataBatch(
        address[] memory users
    ) public view returns (IStaking.User[] memory data) {
        for (uint i; i < users.length; i++) {
            data[i] = stakingContract.users(0, users[i]);
        }
    }

    function getStakedBalance(
        address user
    ) public view returns (uint256, uint256) {
        IStaking.User memory userData = stakingContract.users(0, user);
        return (
            userData.totalInvested - userData.totalWithdrawn,
            XYRO.balanceOf(user)
        );
    }

    function getStakedBalanceBatch(
        address[] memory users
    )
        public
        view
        returns (uint256[] memory staked, uint256[] memory xyroBalance)
    {
        for (uint i; i < users.length; i++) {
            IStaking.User memory userData = stakingContract.users(0, users[i]);
            staked[i] = userData.totalInvested - userData.totalWithdrawn;
            xyroBalance[i] = XYRO.balanceOf(users[i]);
        }
    }
}
