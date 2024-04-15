// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

interface IERC20Mint {
    function mint(address to, uint256 value) external returns (bool);
}

contract Treasury is AccessControlEnumerable {
    address approvedToken;
    address xyroToken;
    uint256 public fee = 100; //100 for 1%
    uint256 public updownFee = 500;
    uint256 public setupInitiatorFee = 100;
    uint256 public constant FEE_DENOMINATOR = 10000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    uint256 public collectedFee;
    mapping(address => uint256) public earnedRakeback;

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
        require(
            hasRole(DAO_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Invalid role"
        );
        fee = newFee;
    }

    function setSetupFee(uint256 newFee) public {
        require(
            hasRole(DAO_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Invalid role"
        );
        setupInitiatorFee = newFee;
    }

    function deposit(uint256 amount, address initiator) public {
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            initiator,
            address(this),
            amount
        );
    }

    function depositWithPermit(
        uint256 amount,
        address initiator,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        IERC20Permit(approvedToken).permit(
            initiator,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
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
            earnedRakeback[winner] += getCashbackAmount(winner, initialBet);
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
            earnedRakeback[winner] += getCashbackAmount(winner, initialBet);
        }
    }

    function distributeUpDown(
        uint256 amount,
        address winner,
        uint256 initialBet
    ) public {
        require(hasRole(DISTRIBUTOR_ROLE, msg.sender), "Invalid role");
        uint256 withdrawnFees = (amount * updownFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount - withdrawnFees;
        collectedFee += withdrawnFees;
        SafeERC20.safeTransfer(IERC20(approvedToken), winner, wonAmount);
        if (getCashbackAmount(winner, initialBet) != 0) {
            earnedRakeback[winner] += getCashbackAmount(winner, initialBet);
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
            earnedRakeback[winner] += getCashbackAmount(winner, initialBet);
        }
    }

    function calculateSetupRate(
        uint256 lostTeamBets,
        uint256 wonTeamBets,
        address initiator
    ) public returns (uint256 rate) {
        uint256 withdrawnFee = (lostTeamBets * fee) / FEE_DENOMINATOR;
        collectedFee += withdrawnFee;
        uint256 lostTeamFee = (lostTeamBets * setupInitiatorFee) /
            FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamBets * setupInitiatorFee) /
            FEE_DENOMINATOR;
        // uint256 feeToInitiator = ((lostTeamBets + wonTeamBets) * fee) /
        //     FEE_DENOMINATOR;
        SafeERC20.safeTransfer(
            IERC20(approvedToken),
            initiator,
            lostTeamFee + wonTeamFee
        );
        //collect dust
        rate =
            ((lostTeamBets - withdrawnFee - lostTeamFee) * FEE_DENOMINATOR) /
            (wonTeamBets - wonTeamFee);
    }

    function withdrawRakeback(uint256 amount) public {
        require(
            earnedRakeback[msg.sender] >= amount,
            "Amount is greated than earned rakeback"
        );
        earnedRakeback[msg.sender] -= amount;
        IERC20Mint(xyroToken).mint(msg.sender, amount);
    }

    function getCashbackAmount(
        address target,
        uint256 amount
    ) public view returns (uint256) {
        uint256 targetBalance = IERC20(xyroToken).balanceOf(target);
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
