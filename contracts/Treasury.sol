// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IERC20Mint {
    function decimals() external view returns (uint256);
    function mint(address to, uint256 value) external returns (bool);
}

contract Treasury is AccessControl {
    address public approvedToken;
    address public xyroToken;
    address public upkeep;
    uint256 public fee = 100; //100 for 1%
    uint256 public setupInitiatorFee = 100;
    uint256 public constant FEE_DENOMINATOR = 10000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    uint256 public collectedFee;
    mapping(address => uint256) public earnedRakeback;

    /**
     * @param newApprovedToken stable token used in games
     * @param xyroTokenAdr Xyro's token
     */
    constructor(address newApprovedToken, address xyroTokenAdr) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = newApprovedToken;
        xyroToken = xyroTokenAdr;
    }

    /**
     * Set new token for in game usage
     * @param token new token address
     */
    function setToken(address token) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Zero address");
        approvedToken = token;
    }

    /**
     * Set new fee
     * @param newFee fee in bp
     */
    function setFee(uint256 newFee) public {
        require(
            hasRole(DAO_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Invalid role"
        );
        fee = newFee;
    }

    /**
     * Set new fee for setup games
     * @param newFee fee in bp
     */
    function setSetupFee(uint256 newFee) public {
        require(
            hasRole(DAO_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Invalid role"
        );
        setupInitiatorFee = newFee;
    }

    /**
     * Deposit token in treasury
     * @param amount token amount
     * @param from token sender
     */
    function deposit(uint256 amount, address from) public {
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            from,
            address(this),
            amount * 10 ** IERC20Mint(approvedToken).decimals()
        );
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     * @param from token sender
     */
    function depositWithPermit(
        uint256 amount,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        IERC20Permit(approvedToken).permit(
            from,
            address(this),
            amount * 10 ** IERC20Mint(approvedToken).decimals(),
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            from,
            address(this),
            amount * 10 ** IERC20Mint(approvedToken).decimals()
        );
    }

    /**
     * Refunds tokens
     * @param amount token amount
     * @param to reciever address
     */
    function refund(
        uint256 amount,
        address to
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        IERC20(approvedToken).approve(to, amount);
        SafeERC20.safeTransfer(
            IERC20(approvedToken),
            to,
            amount * 10 ** IERC20Mint(approvedToken).decimals()
        );
    }

    /**
     * Withrad earned fees
     * @param amount amount to withdraw
     */
    function withdrawFees(
        uint256 amount,
        address to
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(approvedToken).approve(to, amount);
        SafeERC20.safeTransfer(IERC20(approvedToken), to, amount);
    }

    /**
     * Distribute reward
     * @param amount token amount
     * @param to token reciever
     * @param initialDeposit initial deposit amount
     * @param gameFee game mode fees in bp
     */
    function distribute(
        uint256 amount,
        address to,
        uint256 initialDeposit,
        uint256 gameFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        amount *= 10 ** IERC20Mint(approvedToken).decimals();
        initialDeposit *= 10 ** IERC20Mint(approvedToken).decimals();
        uint256 withdrawnFees = (amount * gameFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount -
            (withdrawnFees -
                (withdrawnFees * getCommissionCut(to)) /
                FEE_DENOMINATOR);
        collectedFee += withdrawnFees;
        SafeERC20.safeTransfer(IERC20(approvedToken), to, wonAmount);
        if (getRakebackAmount(to, initialDeposit) != 0) {
            earnedRakeback[to] += getRakebackAmount(to, initialDeposit);
        }
    }

    /**
     * Distribute reward without fees
     * @param rate reward rate in bp
     * @param to token reciever
     * @param initialDeposit initial deposit amount
     */
    function distributeWithoutFee(
        uint256 rate,
        address to,
        uint256 initialDeposit
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        initialDeposit *= 10 ** IERC20Mint(approvedToken).decimals();
        uint256 withdrawnFees = (initialDeposit * fee) / FEE_DENOMINATOR;
        uint256 wonAmount = (initialDeposit - withdrawnFees) +
            ((initialDeposit - withdrawnFees) * rate) /
            FEE_DENOMINATOR;
        IERC20(approvedToken).approve(to, wonAmount);
        SafeERC20.safeTransfer(IERC20(approvedToken), to, wonAmount);
        if (getRakebackAmount(to, initialDeposit) != 0) {
            earnedRakeback[to] += getRakebackAmount(to, initialDeposit);
        }
    }

    /**
     * Calculates setup reward rate and distributes fee for setup creator
     * @param lostTeamTotal summ of lost team deposits
     * @param wonTeamTotal summ of won team deposits
     * @param initiator game initiator address
     */
    function calculateSetupRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        address initiator
    ) external returns (uint256, uint256) {
        lostTeamTotal *= 10 ** IERC20Mint(approvedToken).decimals();
        wonTeamTotal *= 10 ** IERC20Mint(approvedToken).decimals();
        uint256 withdrawnFee = (lostTeamTotal * fee) / FEE_DENOMINATOR;
        collectedFee += withdrawnFee;
        uint256 lostTeamFee = (lostTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        SafeERC20.safeTransfer(
            IERC20(approvedToken),
            initiator,
            lostTeamFee + wonTeamFee
        );
        //collect dust
        uint256 rate = ((lostTeamTotal - withdrawnFee - lostTeamFee) *
            FEE_DENOMINATOR) / (wonTeamTotal - wonTeamFee);
        return (rate, lostTeamFee + wonTeamFee);
    }

    /**
     * Calculates updown reward rate
     * @param lostTeamTotal summ of lost team deposits
     * @param wonTeamTotal summ of won team deposits
     * @param updownFee updown game fee
     */
    function calculateUpDownRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 updownFee
    ) external returns (uint256 rate) {
        lostTeamTotal *= 10 ** IERC20Mint(approvedToken).decimals();
        wonTeamTotal *= 10 ** IERC20Mint(approvedToken).decimals();
        uint256 lostTeamFee = (lostTeamTotal * updownFee) / FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * updownFee) / FEE_DENOMINATOR;
        collectedFee += lostTeamFee + wonTeamFee;
        //collect dust
        rate =
            ((lostTeamTotal - lostTeamFee) * FEE_DENOMINATOR) /
            (wonTeamTotal - wonTeamFee);
    }

    /**
     *  Mints earned amount of Xyro tokens
     * @param amount amount to withdraw
     */
    function withdrawRakeback(uint256 amount) public {
        require(
            earnedRakeback[msg.sender] >= amount,
            "Amount is greated than earned rakeback"
        );
        earnedRakeback[msg.sender] -= amount;
        IERC20Mint(xyroToken).mint(msg.sender, amount);
    }

    /**
     * Counts earned rakeback amount
     * @param target player address
     * @param initialDeposit initial deposit amount
     */
    function getRakebackAmount(
        address target,
        uint256 initialDeposit
    ) internal view returns (uint256) {
        uint256 targetBalance = IERC20(xyroToken).balanceOf(target);
        uint256 tier = targetBalance / (2500 * 10 ** 18) >= 4
            ? 4
            : targetBalance / (2500 * 10 ** 18);
        return (initialDeposit * 500 * tier) / FEE_DENOMINATOR;
    }

    /**
     * Counts commission cut for player address
     * @param target player address
     */
    function getCommissionCut(
        address target
    ) public view returns (uint256 comissionCut) {
        uint256 targetBalance = IERC20(xyroToken).balanceOf(target);
        uint256 tier = targetBalance / (2500 * 10 ** 18) >= 4
            ? 4
            : targetBalance / (2500 * 10 ** 18);

        if (tier == 4) {
            //10-20%
            comissionCut = 3000;
        } else if (tier > 0) {
            //30%
            comissionCut = 1000 + 500 * tier - 1;
        }
    }

    /**
     * Changes Chainlink upkeep address
     * @param newUpkeep new upkeep address
     */
    function setUpkeep(address newUpkeep) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newUpkeep != address(0), "Zero address");
        upkeep = newUpkeep;
    }
}
