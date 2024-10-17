// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IERC20Mint {
    function decimals() external view returns (uint256);
    function mint(address to, uint256 value) external;
}

interface ITreasury {
    function withdrawFees(address to, uint256 amount) external;
}

contract RevenueBank is AccessControl, EIP712, Nonces {
    using ECDSA for bytes32;
    event NewSigner(address newSigner);
    address public approvedToken;
    address public xyroToken;
    address public signer;
    address public treasury;
    /**
     * @param _approvedToken stable token used in games
     * @param _xyroToken Xyro's token
     * @param _treasury Xyro's treasury
     */
    constructor(
        address _approvedToken,
        address _xyroToken,
        address _treasury
    ) EIP712("XYRO", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        approvedToken = _approvedToken;
        xyroToken = _xyroToken;
        signer = msg.sender;
        treasury = _treasury;
    }

    function withdraw(
        uint256 amount,
        address to
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        SafeERC20.safeTransfer(IERC20(approvedToken), to, amount);
    }

    struct Data {
        address to;
        uint256 amount;
        uint256 deadline;
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

        require(recoveredSigner == signer, "Wrong signer");
        SafeERC20.safeTransfer(IERC20(xyroToken), data.to, data.amount);
    }

    function collectFees(uint256 amount) public onlyRole(DEFAULT_ADMIN_ROLE) {
        ITreasury(treasury).withdrawFees(msg.sender, amount);
    }

    function setSigner(address newSigner) public onlyRole(DEFAULT_ADMIN_ROLE) {
        signer = newSigner;
        emit NewSigner(newSigner);
    }

    function nonces(
        address owner
    ) public view virtual override(Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
