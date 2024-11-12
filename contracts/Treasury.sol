// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IERC20Mint {
    function decimals() external view returns (uint256);
}

contract Treasury is Initializable, AccessControlUpgradeable {
    event FeeCollected(uint256 feeEarned, uint256 totalFees);
    event Distributed(address to, uint256 amount);
    event Refunded(address to, uint256 amount);
    event UpkeepChanged(address newUpkeep);
    address public approvedToken;
    address public upkeep;
    uint256 public setupInitiatorFee;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant PRECISION_AMPLIFIER = 100000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant ACCOUNTANT_ROLE = keccak256("ACCOUNTANT_ROLE");
    uint256 public collectedFee;
    uint256 public minDepositAmount;
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public locked;

    /**
     * @param newApprovedToken stable token used in games
     */
    function initialize(address newApprovedToken) public initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = newApprovedToken;
        setupInitiatorFee = 1000;
        minDepositAmount = 10 ** IERC20Mint(approvedToken).decimals();
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
     * Set new fee for setup games
     * @param newFee fee in bp
     */
    function setSetupFee(uint256 newFee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        setupInitiatorFee = newFee;
    }

    /**
     * Deposit token in treasury
     * @param amount token amount
     */
    function deposit(uint256 amount) public {
        require(amount >= minDepositAmount, "Wrong deposit amount");
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            msg.sender,
            address(this),
            amount
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        deposits[msg.sender] += amount;
    }

    /**
     * Deposit token in treasury and lock them
     * @param amount token amount
     * @param from token sender
     */
    function depositAndLock(
        uint256 amount,
        address from
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(amount >= minDepositAmount, "Wrong deposit amount");
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            from,
            address(this),
            amount
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        locked[from] += amount;
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     */
    function depositWithPermit(
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(amount >= minDepositAmount, "Wrong deposit amount");
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        IERC20Permit(approvedToken).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            msg.sender,
            address(this),
            amount
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        deposits[msg.sender] += amount;
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     * @param from token sender
     */
    function depositAndLockWithPermit(
        uint256 amount,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(amount >= minDepositAmount, "Wrong deposit amount");
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        IERC20Permit(approvedToken).permit(
            from,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            from,
            address(this),
            amount
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        locked[from] += amount;
    }

    /**
     * Withdraw all tokens from user deposit
     */
    function withdraw(uint256 amount) public {
        require(deposits[msg.sender] >= amount, "Wrong amount");
        deposits[msg.sender] -= amount;
        SafeERC20.safeTransfer(IERC20(approvedToken), msg.sender, amount);
    }

    /**
     * Locks deposited tokens (only game contracts can call)
     */
    function lock(
        uint256 amount,
        address from
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(deposits[from] >= amount, "Insufficent deposit amount");
        deposits[from] -= amount;
        locked[from] += amount;
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
        require(locked[to] >= amount, "Wrong amount");
        locked[to] -= amount;
        deposits[to] += amount;
        emit Refunded(to, amount);
    }

    /**
     * Refunds tokens and withdraws fees
     * @param amount token amount
     * @param to reciever address
     */
    function refundWithFees(
        uint256 amount,
        address to,
        uint256 refundFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(locked[to] >= amount, "Wrong amount");
        uint256 withdrawnFees = (amount * refundFee) / FEE_DENOMINATOR;
        collectedFee += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee);
        locked[to] -= amount;
        deposits[to] += (amount - withdrawnFees);
        emit Refunded(to, (amount - withdrawnFees));
    }

    /**
     * Withdraws earned fees
     * @param to account that will recieve fee
     */

    function withdrawFees(address to, uint256 amount) public {
        require(
            hasRole(ACCOUNTANT_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Invalid role"
        );
        require(collectedFee >= amount, "Wrong amount");
        collectedFee -= amount;
        SafeERC20.safeTransfer(IERC20(approvedToken), to, amount);
    }

    /**
     * Distribute reward
     * @param amount token amount
     * @param to token reciever
     * @param gameFee game mode fees in bp
     */
    function distribute(
        uint256 amount,
        address to,
        uint256 gameFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        uint256 withdrawnFees = (amount * gameFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount - withdrawnFees;
        collectedFee += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee);
        deposits[to] += wonAmount;
        emit Distributed(to, wonAmount);
    }

    /**
     * Distribute bullseye reward
     * @param amount token amount
     * @param to token reciever
     * @param gameFee game mode fees in bp
     */
    function distributeBullseye(
        uint256 amount,
        address to,
        uint256 gameFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        uint256 withdrawnFees = (amount * gameFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount - withdrawnFees;
        collectedFee += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee);
        deposits[to] += wonAmount;
        emit Distributed(to, wonAmount);
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
        uint256 usedFee,
        uint256 initialDeposit
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        uint256 withdrawnFees = (initialDeposit * usedFee) / FEE_DENOMINATOR;
        uint256 wonAmount = (initialDeposit - withdrawnFees) +
            ((initialDeposit - withdrawnFees) * rate) /
            (FEE_DENOMINATOR * PRECISION_AMPLIFIER);
        deposits[to] += wonAmount;
        emit Distributed(to, wonAmount);
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
        uint256 setupFee,
        address initiator
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256, uint256) {
        uint256 withdrawnFees = (lostTeamTotal * setupFee) / FEE_DENOMINATOR;
        collectedFee += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee);
        uint256 lostTeamFee = (lostTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        deposits[initiator] += lostTeamFee + wonTeamFee;
        emit Distributed(initiator, lostTeamFee + wonTeamFee);
        //collect dust
        uint256 rate = ((lostTeamTotal - withdrawnFees - lostTeamFee) *
            (FEE_DENOMINATOR * PRECISION_AMPLIFIER)) /
            (wonTeamTotal - wonTeamFee);
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
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rate) {
        uint256 lostTeamFee = (lostTeamTotal * updownFee) / FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * updownFee) / FEE_DENOMINATOR;
        collectedFee += lostTeamFee + wonTeamFee;
        emit FeeCollected(lostTeamFee + wonTeamFee, collectedFee);
        //collect dust
        rate =
            ((lostTeamTotal - lostTeamFee) *
                (FEE_DENOMINATOR * PRECISION_AMPLIFIER)) /
            (wonTeamTotal - wonTeamFee);
    }

    /**
     * Changes Chainlink upkeep address
     * @param newUpkeep new upkeep address
     */
    function setUpkeep(address newUpkeep) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newUpkeep != address(0), "Zero address");
        upkeep = newUpkeep;
        emit UpkeepChanged(newUpkeep);
    }

    function changeMinDepositAmount(
        uint256 newMinAmount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        minDepositAmount = newMinAmount;
    }
}
