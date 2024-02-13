// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "hardhat/console.sol";

contract Treasury is AccessControlEnumerable {
    address approvedToken;
    address xyroToken;
    uint256 fee; //100 for 1%
    uint256 public constant FEE_DENOMINATOR = 10000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    uint256 public collectedFee;

    constructor(address newApprovedToken, address xyroTokenAdr) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = newApprovedToken;
        xyroToken = xyroTokenAdr;
    }

    function setToken(address token) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Invalid role");
        approvedToken = token;
    }

    function setFee(uint256 newFee) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Invalid role");
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

    function distribute(
        uint256 amount,
        address winner,
        uint256 initialBet
    ) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender), "Invalid role");
        uint256 withdrawnFee = (amount * fee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount * 2 - withdrawnFee;
        collectedFee += withdrawnFee;
        IERC20(approvedToken).approve(winner, wonAmount);
        SafeERC20.safeTransfer(IERC20(approvedToken), winner, wonAmount);
        if (getCashbackAmount(winner, initialBet) != 0) {
            IERC20(xyroToken).mint(
                winner,
                getCashbackAmount(winner, initialBet)
            );
        }
    }

    function refund(uint256 amount, address initiator) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender), "Invalid role");
        IERC20(approvedToken).approve(initiator, amount);
        SafeERC20.safeTransfer(IERC20(approvedToken), initiator, amount);
    }

    function withdrawFees(uint256 amount) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Invalid role");
        IERC20(approvedToken).approve(msg.sender, amount);
        SafeERC20.safeTransfer(IERC20(approvedToken), msg.sender, amount);
    }

    function increaseFee(uint256 amount) public {
        collectedFee += amount;
    }

    function distributeBullseye(
        uint256 amount,
        address winner,
        uint256 initialBet
    ) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender), "Invalid role");
        IERC20(approvedToken).approve(winner, amount);
        SafeERC20.safeTransfer(IERC20(approvedToken), winner, amount);
        if (getCashbackAmount(winner, initialBet) != 0) {
            IERC20(xyroToken).mint(
                winner,
                getCashbackAmount(winner, initialBet)
            );
        }
    }

    function distributeWithoutFee(
        uint256 rate,
        address winner,
        uint256 initialBet
    ) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender), "Invalid role");
        uint256 withdrawnFees = (initialBet * fee) / FEE_DENOMINATOR;
        uint256 wonAmount = (initialBet - withdrawnFees) +
            ((initialBet - withdrawnFees) * rate) /
            FEE_DENOMINATOR;
        IERC20(approvedToken).approve(winner, wonAmount);
        SafeERC20.safeTransfer(IERC20(approvedToken), winner, wonAmount);
        if (getCashbackAmount(winner, initialBet) != 0) {
            IERC20(xyroToken).mint(
                winner,
                getCashbackAmount(winner, initialBet)
            );
        }
    }

    function calculateSetupRate(
        uint256 lostTeamBets,
        uint256 wonTeamBets,
        address initiator
    ) public returns (uint256 rate) {
        uint256 withdrawnFee = (lostTeamBets * fee) / FEE_DENOMINATOR;
        collectedFee += withdrawnFee;
        console.log("fee", withdrawnFee / 10 ** 18);

        uint256 feeToInitiator = ((lostTeamBets + wonTeamBets) * fee) /
            FEE_DENOMINATOR;
        console.log("1% fee from 400", feeToInitiator / 10 ** 18);
        //стоит ли перенести в отдельную выплату?
        SafeERC20.safeTransfer(
            IERC20(approvedToken),
            initiator,
            feeToInitiator
        );
        console.log((lostTeamBets - withdrawnFee * 2) * FEE_DENOMINATOR);
        console.log((wonTeamBets - ((wonTeamBets * fee) / FEE_DENOMINATOR)));
        //collect dust
        rate =
            ((lostTeamBets - withdrawnFee * 2) * FEE_DENOMINATOR) /
            (wonTeamBets - ((wonTeamBets * fee) / FEE_DENOMINATOR));
    }

    function getCashbackAmount(
        address target,
        uint256 amount
    ) public view returns (uint256) {
        uint256 targetBalance = IERC20(xyroToken).balanceOf(target);
        //если будет пул xyro/usdt можно брать цену оттуда
        //пока что кешбек привязан к кол-ву xyro токена
        if (targetBalance >= 500000 * 10 ** 18) {
            return (amount * 1000) / FEE_DENOMINATOR;
        } else if (targetBalance >= 250000 * 10 ** 18) {
            return (amount * 900) / FEE_DENOMINATOR;
        } else if (targetBalance >= 100000 * 10 ** 18) {
            return (amount * 800) / FEE_DENOMINATOR;
        } else if (targetBalance >= 50000 * 10 ** 18) {
            return (amount * 700) / FEE_DENOMINATOR;
        } else if (targetBalance >= 25000 * 10 ** 18) {
            return (amount * 600) / FEE_DENOMINATOR;
        } else if (targetBalance >= 10000 * 10 ** 18) {
            return (amount * 500) / FEE_DENOMINATOR;
        } else if (targetBalance >= 5000 * 10 ** 18) {
            return (amount * 400) / FEE_DENOMINATOR;
        } else if (targetBalance >= 2500 * 10 ** 18) {
            return (amount * 300) / FEE_DENOMINATOR;
        } else if (targetBalance >= 1000 * 10 ** 18) {
            return (amount * 200) / FEE_DENOMINATOR;
        } else if (targetBalance >= 100 * 10 ** 18) {
            return (amount * 100) / FEE_DENOMINATOR;
        } else {
            return 0;
        }
    }
}
