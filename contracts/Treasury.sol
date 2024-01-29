// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";


contract Treasury is AccessControlEnumerable {
    address approvedToken;
    uint256 fee; //100 for 1%
    uint256 public constant FEE_DENOMINATOR = 10000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    uint256 public collectedFee;

    constructor(address newApprovedToken) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = newApprovedToken;
    }

    function setToken(address token) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender),"Invalid role");
        approvedToken = token;
    }

    function setFee(uint256 newFee) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender),"Invalid role");
        fee = newFee;
    }

    function deposit(uint256 amount, address initiator) public {
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            initiator,
            address(this),
            amount
        );
    }

    function distribute(uint256 amount, address winner) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender),"Invalid role");
        uint256 withdrawnFee = (amount * fee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount * 2 - withdrawnFee;
        collectedFee += withdrawnFee;
        IERC20(approvedToken).approve(winner, wonAmount);
        SafeERC20.safeTransfer(IERC20(approvedToken), winner, wonAmount);
    }

    function refund(uint256 amount, address initiator) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender),"Invalid role");
        IERC20(approvedToken).approve(initiator, amount);
        SafeERC20.safeTransfer(IERC20(approvedToken), initiator, amount);
    }

    function withdrawFees(uint256 amount) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender),"Invalid role");
        IERC20(approvedToken).approve(msg.sender, amount);
        SafeERC20.safeTransfer(IERC20(approvedToken), msg.sender, amount);
    }
}
