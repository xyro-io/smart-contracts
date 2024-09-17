// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IERC20Mint {
    function decimals() external view returns (uint256);
    function mint(address to, uint256 value) external;
}

contract Treasury is AccessControl {
    event FeeCollected(uint256 feeEarned, uint256 totalFees);
    event UpkeepChanged(address newUpkeep);
    event UsedRakeback(bytes32[] gameIds, uint256 totalRakeback);
    address public approvedToken;
    address public xyroToken;
    address public upkeep;
    uint256 public precisionRate;
    uint256 public setupInitiatorFee = 1000;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant PRECISION_AMPLIFIER = 100000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    uint256[10] rakebackRate = [
        500,
        2500,
        5000,
        12500,
        25000,
        50000,
        125000,
        250000,
        500000,
        1250000
    ];
    uint256 public collectedFee;
    mapping(address => uint256) public deposits;
    mapping(bytes32 => uint256) public locked;
    mapping(bytes32 => bool) public gameStatus;
    mapping(bytes32 => mapping(address => uint256)) public lockedRakeback;

    /**
     * @param newApprovedToken stable token used in games
     * @param xyroTokenAdr Xyro's token
     */
    constructor(address newApprovedToken, address xyroTokenAdr) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = newApprovedToken;
        xyroToken = xyroTokenAdr;
        precisionRate = 10 ** (IERC20Mint(approvedToken).decimals() - 4);
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
     * Set new fee for setup initiators games
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
     */
    function deposit(uint256 amount) public {
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            msg.sender,
            address(this),
            amount * precisionRate
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(
            newBalance == oldBalance + amount * precisionRate,
            "Token with fee"
        );
        deposits[msg.sender] += amount * precisionRate;
    }

    /**
     * Deposit token in treasury and lock them
     * @param amount token amount
     * @param from token sender
     * @param gameId game id
     * @param isRakeback set to true if game supports rakeback
     */
    function depositAndLock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) public onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rakeback) {
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            from,
            address(this),
            amount * precisionRate
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(
            newBalance == oldBalance + amount * precisionRate,
            "Token with fee"
        );
        if (isRakeback) {
            rakeback = calculateRakebackAmount(from, amount);
            lockedRakeback[gameId][from] += rakeback;
        }
        locked[gameId] += amount * precisionRate;
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
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        IERC20Permit(approvedToken).permit(
            msg.sender,
            address(this),
            amount * precisionRate,
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            msg.sender,
            address(this),
            amount * precisionRate
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(
            newBalance == oldBalance + amount * precisionRate,
            "Token with fee"
        );
        deposits[msg.sender] += amount;
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     * @param from token sender
     * @param gameId game id
     * @param isRakeback set to true if game supports rakeback
     */
    function depositAndLockWithPermit(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rakeback) {
        uint256 oldBalance = IERC20(approvedToken).balanceOf(address(this));
        IERC20Permit(approvedToken).permit(
            from,
            address(this),
            amount * precisionRate,
            deadline,
            v,
            r,
            s
        );
        SafeERC20.safeTransferFrom(
            IERC20(approvedToken),
            from,
            address(this),
            amount * precisionRate
        );
        uint256 newBalance = IERC20(approvedToken).balanceOf(address(this));
        require(
            newBalance == oldBalance + amount * precisionRate,
            "Token with fee"
        );
        if (isRakeback) {
            rakeback = calculateRakebackAmount(from, amount);
            lockedRakeback[gameId][from] += rakeback;
        }
        locked[gameId] += amount * precisionRate;
    }

    /**
     * Withdraw all tokens from user deposit
     * @param amount amount of tokens to withdraw
     */
    function withdraw(uint256 amount) public {
        require(deposits[msg.sender] >= amount * precisionRate, "Wrong amount");
        deposits[msg.sender] -= amount * precisionRate;
        SafeERC20.safeTransfer(
            IERC20(approvedToken),
            msg.sender,
            amount * precisionRate
        );
    }

    /**
     * Locks deposited tokens (only game contracts can call)
     * @param amount token amount
     * @param from token sender
     * @param gameId game id
     * @param isRakeback set to true if game supports rakeback
     */
    function lock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) public onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rakeback) {
        require(
            deposits[from] >= amount * precisionRate,
            "Insufficent deposit amount"
        );

        if (isRakeback) {
            rakeback = calculateRakebackAmount(from, amount);
            lockedRakeback[gameId][from] += rakeback;
        }
        deposits[from] -= amount * precisionRate;
        locked[gameId] += amount * precisionRate;
    }

    /**
     * Refunds tokens
     * @param amount token amount
     * @param to reciever address
     * @param gameId game id
     */
    function refund(
        uint256 amount,
        address to,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(locked[gameId] >= amount * precisionRate, "Wrong amount");
        uint256 rakeback = lockedRakeback[gameId][to];
        if (rakeback != 0) {
            lockedRakeback[gameId][to] = 0;
            locked[gameId] -= (amount + rakeback) * precisionRate;
            deposits[to] += (amount + rakeback) * precisionRate;
        } else {
            locked[gameId] -= amount * precisionRate;
            deposits[to] += amount * precisionRate;
        }
    }

    /**
     * Refunds tokens and withdraws fees
     * @param amount token amount
     * @param to reciever address
     * @param refundFee fee in bp to withheld
     * @param gameId game id
     */
    function refundWithFees(
        uint256 amount,
        address to,
        uint256 refundFee,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(locked[gameId] >= amount * precisionRate, "Wrong amount");
        uint256 withdrawnFees = (amount * refundFee) / FEE_DENOMINATOR;
        uint256 rakeback = lockedRakeback[gameId][to];
        collectedFee += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee);
        if (rakeback != 0) {
            lockedRakeback[gameId][to] = 0;
            locked[gameId] -= (amount + rakeback) * precisionRate;
            deposits[to] += (amount + rakeback - withdrawnFees) * precisionRate;
        } else {
            locked[gameId] -= amount * precisionRate;
            deposits[to] += (amount - withdrawnFees) * precisionRate;
        }
    }

    /**
     * Withdraws earned fees
     * @param to account that will recieve fee
     * @param amount amount to withdraw
     */

    function withdrawFees(
        address to,
        uint256 amount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collectedFee >= amount * precisionRate, "Wrong amount");
        collectedFee -= amount * precisionRate;
        SafeERC20.safeTransfer(
            IERC20(approvedToken),
            to,
            amount * precisionRate
        );
    }

    /**
     * Distribute reward
     * @param amount token amount
     * @param to token reciever
     * @param initialDeposit initial deposit amount
     * @param gameFee game mode fees in bp
     * @param gameId game id
     */
    function distribute(
        uint256 amount,
        address to,
        uint256 initialDeposit,
        uint256 gameFee,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        amount *= precisionRate;
        initialDeposit *= precisionRate;
        if (lockedRakeback[gameId][to] != 0) {
            initialDeposit += lockedRakeback[gameId][to] * precisionRate;
            lockedRakeback[gameId][to] = 0;
        }
        uint256 withdrawnFees = (amount * gameFee) / FEE_DENOMINATOR;
        uint256 wonAmount = amount - withdrawnFees;
        collectedFee += withdrawnFees / precisionRate;
        emit FeeCollected(withdrawnFees, collectedFee);
        locked[gameId] -= amount;
        deposits[to] += wonAmount;
    }

    /**
     * Distribute reward without fees
     * @param rate reward rate in bp
     * @param to token reciever
     * @param usedFee fee in bp that was withheld earlier
     * @param initialDeposit initial deposit amount
     * @param gameId game id
     */
    function distributeWithoutFee(
        uint256 rate,
        address to,
        uint256 usedFee,
        uint256 initialDeposit,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        initialDeposit *= precisionRate;
        if (lockedRakeback[gameId][to] != 0) {
            initialDeposit += lockedRakeback[gameId][to] * precisionRate;
            lockedRakeback[gameId][to] = 0;
        }
        uint256 withdrawnFees = (initialDeposit * usedFee) / FEE_DENOMINATOR;
        uint256 wonAmount = (initialDeposit - withdrawnFees) +
            ((initialDeposit - withdrawnFees) * rate) /
            (FEE_DENOMINATOR * PRECISION_AMPLIFIER);
        deposits[to] += wonAmount;
        locked[gameId] -= wonAmount;
    }

    /**
     * Calculates setup reward rate and distributes fee for setup creator
     * @param lostTeamTotal summ of lost team deposits
     * @param wonTeamTotal summ of won team deposits
     * @param initiator game initiator address
     * @param gameId setup game id
     */
    function calculateSetupRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 setupFee,
        address initiator,
        bytes32 gameId
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256, uint256) {
        lostTeamTotal *= precisionRate;
        wonTeamTotal *= precisionRate;
        uint256 withdrawnFees = (lostTeamTotal * setupFee) / FEE_DENOMINATOR;
        collectedFee += withdrawnFees;
        uint256 lostTeamFee = (lostTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * setupInitiatorFee) /
            FEE_DENOMINATOR;
        deposits[initiator] += lostTeamFee + wonTeamFee;
        //collect dust
        uint256 rate = ((lostTeamTotal - withdrawnFees - lostTeamFee) *
            (FEE_DENOMINATOR * PRECISION_AMPLIFIER)) /
            (wonTeamTotal - wonTeamFee);
        locked[gameId] -= withdrawnFees + lostTeamFee + wonTeamFee;
        return (rate, lostTeamFee + wonTeamFee);
    }

    /**
     * Calculates updown reward rate
     * @param lostTeamTotal summ of lost team deposits
     * @param wonTeamTotal summ of won team deposits
     * @param updownFee updown game fee
     * @param gameId updown game id
     */
    function calculateUpDownRate(
        uint256 lostTeamTotal,
        uint256 wonTeamTotal,
        uint256 updownFee,
        bytes32 gameId
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rate) {
        lostTeamTotal *= precisionRate;
        wonTeamTotal *= precisionRate;
        uint256 lostTeamFee = (lostTeamTotal * updownFee) / FEE_DENOMINATOR;
        uint256 wonTeamFee = (wonTeamTotal * updownFee) / FEE_DENOMINATOR;
        collectedFee += lostTeamFee + wonTeamFee;
        locked[gameId] -= lostTeamFee + wonTeamFee;
        //collect dust

        rate =
            ((lostTeamTotal - lostTeamFee) *
                (FEE_DENOMINATOR * PRECISION_AMPLIFIER)) /
            (wonTeamTotal - wonTeamFee);
    }

    /**
     * Counts earned rakeback amount
     * @param target player address
     * @param initialDeposit initial deposit amount
     */
    function calculateRakebackAmount(
        address target,
        uint256 initialDeposit
    ) internal view returns (uint256) {
        uint256 targetBalance = IERC20(xyroToken).balanceOf(target);
        if (
            targetBalance <
            rakebackRate[0] * 10 ** IERC20Mint(xyroToken).decimals()
        ) {
            return 0;
        }
        uint256 rate;
        for (uint256 i = 10; i > 0; i--) {
            if (
                targetBalance >=
                rakebackRate[i - 1] * 10 ** IERC20Mint(xyroToken).decimals()
            ) {
                rate = i;
                break;
            }
            rate = 0;
        }
        return (initialDeposit * rate * 100) / FEE_DENOMINATOR;
    }

    /**
     * Changes game status wich allows players to withdraw rakeback
     * @param gameIds array of game ids with earned rakeback
     */
    function withdrawRakeback(bytes32[] calldata gameIds) public {
        uint256 rakeback;
        for (uint i = 0; i < gameIds.length; i++) {
            require(
                gameStatus[gameIds[i]] == true,
                "Can't withdraw from unfinished game"
            );
            rakeback += lockedRakeback[gameIds[i]][msg.sender];
            lockedRakeback[gameIds[i]][msg.sender] = 0;
        }
        deposits[msg.sender] += rakeback * precisionRate;
        emit UsedRakeback(gameIds, rakeback * precisionRate);
    }

    /**
     * Changes game status wich allows players to withdraw rakeback
     */
    function setGameFinished(
        bytes32 gameId
    ) external onlyRole(DISTRIBUTOR_ROLE) {
        gameStatus[gameId] = true;
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
}
