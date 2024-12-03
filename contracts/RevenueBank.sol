// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IERC20Burn {
    function decimals() external view returns (uint256);
    function burn(address account, uint256 amount) external;
}

interface ITreasury {
    function withdrawFees(address to, uint256 amount, address token) external;
}

contract RevenueBank is AccessControl, EIP712, Nonces {
    using ECDSA for bytes32;

    struct Data {
        address to;
        uint256 amount;
        uint256 deadline;
    }

    event NewSigner(address signer);
    event NewWallet(address wallet);
    event NewSwapRouter(address swapRouter);
    event NewXyroToken(address xyroToken);
    event NewApprovedToken(address approvedToken);
    event NewTreasury(address treasury);

    bytes32 public constant ACCOUNTANT_ROLE = keccak256("ACCOUNTANT_ROLE");
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public buybackBalance;
    uint256 public rewardsBalance;
    uint256 public collectedFees;
    uint256 public buybackPart = 2500;
    uint256 public rewardsPart = 1000;
    address public approvedToken;
    address public xyroToken;
    mapping(address => bool) public signers;
    address public treasury;
    address public wallet;
    address public swapRouter;

    constructor(
        address _approvedToken,
        address _xyroToken,
        address _treasury,
        address _wallet,
        address _swapRouter
    ) EIP712("XYRO", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = _approvedToken;
        xyroToken = _xyroToken;
        signers[msg.sender] = true;
        treasury = _treasury;
        swapRouter = _swapRouter;
        wallet = _wallet;
    }

    function withdraw(
        uint256 amount,
        address to
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collectedFees >= amount, "Wrong amount");
        collectedFees -= amount;
        SafeERC20.safeTransfer(IERC20(approvedToken), to, amount);
    }

    function verifyTransfer(Data memory data, bytes memory signature) public {
        require(block.timestamp < data.deadline, "Deadline expired");
        bytes32 hash = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256(
                        "Data(address to,uint256 amount,uint256 nonce,uint256 deadline)"
                    ),
                    data.to,
                    data.amount,
                    _useNonce(data.to),
                    data.deadline
                )
            )
        );
        address recoveredSigner = ECDSA.recover(hash, signature);

        require(signers[recoveredSigner], "Wrong signer");
        require(rewardsBalance >= data.amount, "Not enough rewards");
        rewardsBalance -= data.amount;
        SafeERC20.safeTransfer(IERC20(approvedToken), data.to, data.amount);
    }

    function collectFees(
        uint256 amount,
        address token
    ) public onlyRole(ACCOUNTANT_ROLE) {
        ITreasury(treasury).withdrawFees(address(this), amount, token);
        uint256 amountForBuyback = (amount * buybackPart) / FEE_DENOMINATOR;
        buybackBalance += amountForBuyback;
        uint256 amountForRewards = (amount * rewardsPart) / FEE_DENOMINATOR;
        rewardsBalance += amountForRewards;
        collectedFees += amount - amountForRewards - amountForBuyback;
    }

    function buybackAndBurn() public onlyRole(ACCOUNTANT_ROLE) {
        IERC20(approvedToken).approve(swapRouter, buybackBalance);

        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02
            .ExactInputSingleParams({
                tokenIn: approvedToken,
                tokenOut: xyroToken,
                fee: 3000,
                recipient: address(this),
                amountIn: buybackBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        buybackBalance = 0;
        uint256 amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
        SafeERC20.safeTransfer(IERC20(xyroToken), wallet, amountOut);
    }

    function setSigner(
        address signer,
        bool status
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        signers[signer] = status;
        emit NewSigner(signer);
    }

    function setTreasury(
        address _treasury
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
        emit NewTreasury(_treasury);
    }

    function setWallet(address _wallet) public onlyRole(DEFAULT_ADMIN_ROLE) {
        wallet = _wallet;
        emit NewWallet(_wallet);
    }

    function setSwapRouter(
        address _swapRouter
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        swapRouter = _swapRouter;
        emit NewSwapRouter(_swapRouter);
    }

    function setXyroToken(
        address _xyroToken
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        xyroToken = _xyroToken;
        emit NewXyroToken(_xyroToken);
    }

    function setApprovedToken(
        address _approvedToken
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        approvedToken = _approvedToken;
        emit NewApprovedToken(_approvedToken);
    }

    function setFeeDistribution(
        uint256 _buybackPart,
        uint256 _rewardsPart
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        buybackPart = _buybackPart;
        rewardsPart = _rewardsPart;
    }

    function nonces(
        address owner
    ) public view virtual override(Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}
