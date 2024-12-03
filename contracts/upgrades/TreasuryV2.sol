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

contract TreasuryV2 is Initializable, AccessControlUpgradeable {
    event FeeCollected(uint256 feeEarned, uint256 totalFees, address token);
    event Distributed(address to, uint256 amount, address token);
    event Refunded(address to, uint256 amount, address token);
    event UsedRakeback(bytes32 gameId, uint256 totalRakeback, address token);
    event UpkeepChanged(address newUpkeep);
    mapping(address => bool) public approvedTokens;
    address public xyroToken;
    address public upkeep;
    uint256 public setupInitiatorFee;
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant RATE_PRECISION_AMPLIFIER = 1000000000;
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant ACCOUNTANT_ROLE = keccak256("ACCOUNTANT_ROLE");
    uint256[10] rakebackRate;
    mapping(address => uint256) public collectedFee;
    mapping(address => uint256) public minDepositAmount;
    mapping(address => mapping(address => uint256)) public deposits;
    mapping(bytes32 => address) public gameToken;
    mapping(bytes32 => uint256) public locked;
    mapping(bytes32 => bool) public gameStatus;
    mapping(bytes32 => mapping(address => uint256)) public lockedRakeback;

    /**
     * @param approvedToken stable token used in games
     */
    function initialize(
        address approvedToken,
        address _xyroToken
    ) public initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        xyroToken = _xyroToken;
        approvedTokens[approvedToken] = true;
        setupInitiatorFee = 1000;
        minDepositAmount[approvedToken] =
            10 ** IERC20Mint(approvedToken).decimals();
        rakebackRate = [
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

    function setGameToken(
        bytes32 gameId,
        address token
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        require(approvedTokens[token], "Unapproved token");
        gameToken[gameId] = token;
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
     * Deposit token to a certain player's balance in treasury
     * @param amount token amount
     */
    function deposit(uint256 amount, address token, address to) public {
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
        deposits[token][to] += amount;
    }

    /**
     * Deposit token in treasury and lock them
     * @param amount token amount
     * @param from token sender
     */
    function depositAndLock(
        uint256 amount,
        address from,
        bytes32 gameId,
        bool isRakeback
    ) public onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rakeback) {
        address token = gameToken[gameId];
        require(amount >= minDepositAmount[token], "Wrong deposit amount");
        require(approvedTokens[token], "Unapproved token");
        uint256 oldBalance = IERC20(token).balanceOf(address(this));
        SafeERC20.safeTransferFrom(IERC20(token), from, address(this), amount);
        uint256 newBalance = IERC20(token).balanceOf(address(this));
        require(newBalance == oldBalance + amount, "Token with fee");
        if (isRakeback) {
            rakeback = calculateRakebackAmount(from, amount);
            lockedRakeback[gameId][from] += rakeback;
        }
        locked[gameId] += amount;
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
     * Deposit token on a certain player balance in treasury with permit
     * @param amount token amount
     */
    function depositWithPermit(
        uint256 amount,
        address token,
        address to,
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
        deposits[token][to] += amount;
    }

    /**
     * Deposit token in treasury with permit
     * @param amount token amount
     * @param from token sender
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
        address token = gameToken[gameId];
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
        if (isRakeback) {
            rakeback = calculateRakebackAmount(from, amount);
            lockedRakeback[gameId][from] += rakeback;
        }
        locked[gameId] += amount;
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
        bytes32 gameId,
        bool isRakeback
    ) public onlyRole(DISTRIBUTOR_ROLE) returns (uint256 rakeback) {
        address token = gameToken[gameId];
        require(approvedTokens[token], "Unapproved token");
        require(deposits[token][from] >= amount, "Insufficent deposit amount");
        if (isRakeback) {
            rakeback = calculateRakebackAmount(from, amount);
            lockedRakeback[gameId][from] += rakeback;
        }
        deposits[token][from] -= amount;
        // locked[token][from] += amount;
        locked[gameId] += amount;
    }

    /**
     * Refunds tokens
     * @param amount token amount
     * @param to reciever address
     */
    function refund(
        uint256 amount,
        address to,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        address token = gameToken[gameId];
        require(approvedTokens[token], "Unapproved token");
        require(locked[gameId] >= amount, "Wrong amount");
        if (lockedRakeback[gameId][to] != 0) {
            lockedRakeback[gameId][to] = 0;
        }
        locked[gameId] -= amount;
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
        uint256 refundFee,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        address token = gameToken[gameId];
        require(approvedTokens[token], "Unapproved token");
        require(locked[gameId] >= amount, "Wrong amount");
        uint256 withdrawnFees = (amount * refundFee) / FEE_DENOMINATOR;
        uint256 rakeback = lockedRakeback[gameId][to];
        collectedFee[token] += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee[token], token);
        if (rakeback != 0) {
            lockedRakeback[gameId][to] = 0;
            locked[gameId] -= (amount + rakeback);
            deposits[token][to] += (amount + rakeback - withdrawnFees);
        } else {
            locked[gameId] -= amount;
            deposits[token][to] += (amount - withdrawnFees);
        }
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

    function universalDistribute(
        address to,
        uint256 initialDeposit,
        bytes32 gameId,
        uint256 rate
    ) external onlyRole(DISTRIBUTOR_ROLE) {
        address token = gameToken[gameId];
        if (lockedRakeback[gameId][to] != 0) {
            lockedRakeback[gameId][to] = 0;
        }
        uint256 wonAmount = initialDeposit +
            (initialDeposit * rate) /
            RATE_PRECISION_AMPLIFIER;
        deposits[token][to] += wonAmount;
        locked[gameId] -= wonAmount;
        emit Distributed(to, wonAmount, token);
    }

    function withdrawGameFee(
        uint256 lostTeamDeposits,
        uint256 gameFee,
        bytes32 gameId
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256 withdrawnFees) {
        address token = gameToken[gameId];
        withdrawnFees = (lostTeamDeposits * gameFee) / FEE_DENOMINATOR;
        collectedFee[token] += withdrawnFees;
        emit FeeCollected(withdrawnFees, collectedFee[token], token);
        locked[gameId] -= withdrawnFees;
    }

    function calculateRate(
        uint256 wonTeamTotal,
        uint256 lostTeamRakeback,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) returns (uint256) {
        if (lostTeamRakeback != 0) {
            locked[gameId] -= lostTeamRakeback;
        }
        return
            ((locked[gameId] - wonTeamTotal) * RATE_PRECISION_AMPLIFIER) /
            wonTeamTotal;
    }

    function withdrawInitiatorFee(
        uint256 lostTeamDeposits,
        uint256 wonTeamDeposits,
        uint256 initiatorFee,
        address initiator,
        bytes32 gameId
    ) external onlyRole(DISTRIBUTOR_ROLE) returns (uint256 withdrawnFees) {
        address token = gameToken[gameId];
        withdrawnFees =
            (wonTeamDeposits + lostTeamDeposits * initiatorFee) /
            FEE_DENOMINATOR;
        deposits[token][initiator] += withdrawnFees;
        emit Distributed(initiator, withdrawnFees, token);
        locked[gameId] -= withdrawnFees;
    }

    /**
     * Distribute bullseye reward
     * @param to token reciever
     */
    function distributeBullseye(
        uint256 rate,
        uint256 lostTeamRakeback,
        address to,
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        address token = gameToken[gameId];
        if (lockedRakeback[gameId][to] != 0) {
            lockedRakeback[gameId][to] = 0;
        }
        uint256 wonAmount;
        if (rate == FEE_DENOMINATOR) {
            wonAmount = locked[gameId] - lostTeamRakeback;
        } else {
            wonAmount =
                ((locked[gameId] - lostTeamRakeback) * rate) /
                FEE_DENOMINATOR;
        }
        deposits[token][to] += wonAmount;
        emit Distributed(to, wonAmount, token);
    }

    function bullseyeResetLockedAmount(
        bytes32 gameId
    ) public onlyRole(DISTRIBUTOR_ROLE) {
        locked[gameId] = 0;
    }

    /**
     * Counts earned rakeback amount
     * @param target player address
     * @param initialDeposit initial deposit amount
     */
    function calculateRakebackAmount(
        address target,
        uint256 initialDeposit
    ) public view returns (uint256) {
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
        for (uint i = 0; i < gameIds.length; i++) {
            address token = gameToken[gameIds[i]];
            require(
                gameStatus[gameIds[i]] == true,
                "Can't withdraw from unfinished game"
            );
            deposits[token][msg.sender] += lockedRakeback[gameIds[i]][
                msg.sender
            ];
            emit UsedRakeback(
                gameIds[i],
                lockedRakeback[gameIds[i]][msg.sender],
                token
            );
            lockedRakeback[gameIds[i]][msg.sender] = 0;
        }
    }

    function withdrawRakebackSetup(
        bytes32 gameId,
        address target
    ) external onlyRole(DISTRIBUTOR_ROLE) {
        require(lockedRakeback[gameId][target] != 0, "No rakeback available");
        deposits[gameToken[gameId]][target] += lockedRakeback[gameId][target];
        emit UsedRakeback(
            gameId,
            lockedRakeback[gameId][target],
            gameToken[gameId]
        );
        lockedRakeback[gameId][target] = 0;
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

    function changeMinDepositAmount(
        uint256 newMinAmount,
        address token
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(approvedTokens[token], "Unapproved token");
        minDepositAmount[token] = newMinAmount;
    }

    function test() public pure returns (uint256) {
        return 333;
    }
}
