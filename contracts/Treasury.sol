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
    event FeeCollected(uint256 feeEarned, uint256 totalFees, address token);
    event Distributed(address to, uint256 amount, address token);
    event Refunded(address to, uint256 amount, address token);
    event UpkeepChanged(address newUpkeep);
    mapping(address => bool) public approvedTokens;
    address public upkeep;
    uint256 public setupInitiatorFee;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant PRECISION_AMPLIFIER = 100000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant ACCOUNTANT_ROLE = keccak256("ACCOUNTANT_ROLE");
    mapping(address => uint256) public collectedFee;
    mapping(address => uint256) public minDepositAmount;
    mapping(address => mapping(address => uint256)) public deposits;
    mapping(address => mapping(address => uint256)) public locked;

    /**
     * @param approvedToken stable token used in games
     */
    function initialize(address approvedToken) public initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedTokens[approvedToken] = true;
        setupInitiatorFee = 1000;
        minDepositAmount[approvedToken] =
            10 ** IERC20Mint(approvedToken).decimals();
    }

    /**
     * Set new token for in game usage
     * @param token new token address
     * @param status true for approved token
     */
    function setToken(
        address token,
        bool status
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Zero address");
        approvedTokens[token] = status;
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
    function deposit(uint256 amount, address token) public {
        require(amount >= minDepositAmount[token], "Wrong deposit amount");
        require(approvedTokens[token], "Unapproved token");
        uint256 oldBalance = IERC20(token).balanceOf(address(this));
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );
        uint256 newBalance = IERC20(token).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        deposits[token][msg.sender] += amount;
    }

    /**
     * Deposit token in treasury and lock them
     * @param amount token amount
     * @param from token sender
     */
    function depositAndLock(
        uint256 amount,
        address from,
        address token
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(amount >= minDepositAmount[token], "Wrong deposit amount");
        require(approvedTokens[token], "Unapproved token");
        uint256 oldBalance = IERC20(token).balanceOf(address(this));
        SafeERC20.safeTransferFrom(IERC20(token), from, address(this), amount);
        uint256 newBalance = IERC20(token).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        locked[token][from] += amount;
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     */
    function depositWithPermit(
        uint256 amount,
        address token,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(amount >= minDepositAmount[token], "Wrong deposit amount");
        require(approvedTokens[token], "Unapproved token");
        uint256 oldBalance = IERC20(token).balanceOf(address(this));
        IERC20Permit(token).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );
        uint256 newBalance = IERC20(token).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        deposits[token][msg.sender] += amount;
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     * @param from token sender
     */
    function depositAndLockWithPermit(
        uint256 amount,
        address token,
        address from,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(amount >= minDepositAmount[token], "Wrong deposit amount");
        require(approvedTokens[token], "Unapproved token");
        uint256 oldBalance = IERC20(token).balanceOf(address(this));
        IERC20Permit(token).permit(
            from,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(IERC20(token), from, address(this), amount);
        uint256 newBalance = IERC20(token).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        locked[token][from] += amount;
    }

    /**
     * Withdraw all tokens from user deposit
     */
    function withdraw(uint256 amount, address token) public {
        require(approvedTokens[token], "Unapproved token");
        require(deposits[token][msg.sender] >= amount, "Wrong amount");
        deposits[token][msg.sender] -= amount;
        SafeERC20.safeTransfer(IERC20(token), msg.sender, amount);
    }

    /**
     * Locks deposited tokens (only game contracts can call)
     */
    function lock(
        uint256 amount,
        address from,
        address token
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(approvedTokens[token], "Unapproved token");
        require(deposits[token][from] >= amount, "Insufficent deposit amount");
        deposits[token][from] -= amount;
        locked[token][from] += amount;
    }

    /**
     * Refunds tokens
     * @param amount token amount
     * @param to reciever address
     */
    function refund(
        uint256 amount,
        address to,
        address token
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(approvedTokens[token], "Unapproved token");
        require(locked[token][to] >= amount, "Wrong amount");
        locked[token][to] -= amount;
        deposits[token][to] += amount;
        emit Refunded(to, amount, token);
    }

    /**
     * Refunds tokens and withdraws fees
     * @param amount token amount
     * @param to reciever address
     */
    function refundWithFees(
        uint256 amount,
        address to,
        address token,
        uint256 refundFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(approvedTokens[token], "Unapproved token");
        require(locked[token][to] >= amount, "Wrong amount");
        uint256 withdrawnFees = (amount * refundFee) / FEE_DENOMINATOR;
        collectedFee[token] += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee[token], token);
        locked[token][to] -= amount;
        deposits[token][to] += (amount - withdrawnFees);
        emit Refunded(to, (amount - withdrawnFees), token);
    }

    /**
     * Withdraws earned fees
     * @param to account that will recieve fee
     */

    function withdrawFees(address to, uint256 amount, address token) public {
        require(approvedTokens[token], "Unapproved token");
        require(
            hasRole(ACCOUNTANT_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Invalid role"
        );
        require(collectedFee[token] >= amount, "Wrong amount");
        collectedFee[token] -= amount;
        SafeERC20.safeTransfer(IERC20(token), to, amount);
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
        address token,
        uint256 gameFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        uint256 withdrawnFees = (amount * gameFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount - withdrawnFees;
        collectedFee[token] += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee[token], token);
        deposits[token][to] += wonAmount;
        emit Distributed(to, wonAmount, token);
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
        address token,
        uint256 gameFee
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        uint256 withdrawnFees = (amount * gameFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount - withdrawnFees;
        collectedFee[token] += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee[token], token);
        deposits[token][to] += wonAmount;
        emit Distributed(to, wonAmount, token);
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
        address token,
        uint256 usedFee,
        uint256 initialDeposit
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        uint256 withdrawnFees = (initialDeposit * usedFee) / FEE_DENOMINATOR;
        uint256 wonAmount = (initialDeposit - withdrawnFees) +
            ((initialDeposit - withdrawnFees) * rate) /
            (FEE_DENOMINATOR * PRECISION_AMPLIFIER);
        deposits[token][to] += wonAmount;
        emit Distributed(to, wonAmount, token);
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
        address token,
        uint256 setupFee,
        address initiator
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256, uint256) {
        uint256 withdrawnFees = (lostTeamTotal * setupFee) / FEE_DENOMINATOR;
        collectedFee[token] += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee[token], token);
        uint256 lostTeamFee = (lostTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        deposits[token][initiator] += lostTeamFee + wonTeamFee;
        emit Distributed(initiator, lostTeamFee + wonTeamFee, token);
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
        address token,
        uint256 updownFee
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rate) {
        uint256 lostTeamFee = (lostTeamTotal * updownFee) / FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * updownFee) / FEE_DENOMINATOR;
        collectedFee[token] += lostTeamFee + wonTeamFee;
        emit FeeCollected(lostTeamFee + wonTeamFee, collectedFee[token], token);
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
        uint256 newMinAmount,
        address token
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(approvedTokens[token], "Unapproved token");
        minDepositAmount[token] = newMinAmount;
    }
}
