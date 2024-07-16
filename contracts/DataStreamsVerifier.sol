// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {Common} from "@chainlink/contracts/src/v0.8/llo-feeds/libraries/Common.sol";
import {IRewardManager} from "@chainlink/contracts/src/v0.8/llo-feeds/interfaces/IRewardManager.sol";
import {IVerifierFeeManager} from "@chainlink/contracts/src/v0.8/llo-feeds/interfaces/IVerifierFeeManager.sol";
import {IERC20} from "@chainlink/contracts-ccip/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@chainlink/contracts-ccip/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

/**
 * THIS IS AN EXAMPLE CONTRACT THAT USES UN-AUDITED CODE FOR DEMONSTRATION PURPOSES.
 * DO NOT USE THIS CODE IN PRODUCTION.
 */

// Custom interfaces for IVerifierProxy and IFeeManager
interface IVerifierProxy {
    /**
     * @notice Verifies that the data encoded has been signed.
     * correctly by routing to the correct verifier, and bills the user if applicable.
     * @param payload The encoded data to be verified, including the signed
     * report.
     * @param parameterPayload Fee metadata for billing. In the current implementation,
     * this consists of the abi-encoded address of the ERC-20 token used for fees.
     * @return verifierResponse The encoded report from the verifier.
     */
    function verify(
        bytes calldata payload,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory verifierResponse);

    /**
     * @notice Verifies multiple reports in bulk, ensuring that each is signed correctly,
     * routes them to the appropriate verifier, and handles billing for the verification process.
     * @param payloads An array of encoded data to be verified, where each entry includes
     * the signed report.
     * @param parameterPayload Fee metadata for billing. In the current implementation,
     * this consists of the abi-encoded address of the ERC-20 token used for fees.
     * @return verifiedReports An array of encoded reports returned from the verifier.
     */
    function verifyBulk(
        bytes[] calldata payloads,
        bytes calldata parameterPayload
    ) external payable returns (bytes[] memory verifiedReports);

    function s_feeManager() external view returns (IVerifierFeeManager);
}

interface IFeeManager {
    /**
     * @notice Calculates the fee and reward associated with verifying a report, including discounts for subscribers.
     * This function assesses the fee and reward for report verification, applying a discount for recognized subscriber addresses.
     * @param subscriber The address attempting to verify the report. A discount is applied if this address
     * is recognized as a subscriber.
     * @param unverifiedReport The report data awaiting verification. The content of this report is used to
     * determine the base fee and reward, before considering subscriber discounts.
     * @param quoteAddress The payment token address used for quoting fees and rewards.
     * @return fee The fee assessed for verifying the report, with subscriber discounts applied where applicable.
     * @return reward The reward allocated to the caller for successfully verifying the report.
     * @return totalDiscount The total discount amount deducted from the fee for subscribers.
     */
    function getFeeAndReward(
        address subscriber,
        bytes memory unverifiedReport,
        address quoteAddress
    ) external returns (Common.Asset memory, Common.Asset memory, uint256);

    function i_linkAddress() external view returns (address);

    function i_nativeAddress() external view returns (address);

    function i_rewardManager() external view returns (address);
}
/**
 * @dev This contract implements functionality to verify Data Streams reports from
 * the Streams Direct API or WebSocket connection, with payment in LINK tokens.
 */
contract DataStreamsVerifier {
    error NothingToWithdraw(); // Thrown when a withdrawal attempt is made but the contract holds no tokens of the specified type.
    error NotOwner(address caller); // Thrown when a caller tries to execute a function that is restricted to the contract's owner.

    struct BasicReport {
        bytes32 feedNumber; // The feed ID the report has data for
        uint32 validFromTimestamp; // Earliest timestamp for which price is applicable
        uint32 observationsTimestamp; // Latest timestamp for which price is applicable
        uint192 nativeFee; // Base cost to validate a transaction using the report, denominated in the chain’s native token (WETH/ETH)
        uint192 linkFee; // Base cost to validate a transaction using the report, denominated in LINK
        uint32 expiresAt; // Latest timestamp where the report can be verified onchain
        int192 price; // DON consensus median price, carried to 8 decimal places
    }

    struct PremiumReport {
        bytes32 feedNumber; // The feed ID the report has data for
        uint32 validFromTimestamp; // Earliest timestamp for which price is applicable
        uint32 observationsTimestamp; // Latest timestamp for which price is applicable
        uint192 nativeFee; // Base cost to validate a transaction using the report, denominated in the chain’s native token (WETH/ETH)
        uint192 linkFee; // Base cost to validate a transaction using the report, denominated in LINK
        uint32 expiresAt; // Latest timestamp where the report can be verified onchain
        int192 price; // DON consensus median price, carried to 8 decimal places
        int192 bid; // Simulated price impact of a buy order up to the X% depth of liquidity utilisation
        int192 ask; // Simulated price impact of a sell order up to the X% depth of liquidity utilisation
    }

    mapping(uint8 => IVerifierProxy) public verifiersProxy;
    // IVerifierProxy public s_verifierProxy;

    address private s_owner;
    int192 public last_decoded_price;
    uint32 public last_validFromTimestamp;

    event DecodedPrice(int192);

    /**
     * You can find these addresses on https://docs.chain.link/data-streams/stream-ids
     */
    constructor() {
        s_owner = msg.sender;
    }

    /// @notice Checks if the caller is the owner of the contract.
    modifier onlyOwner() {
        if (msg.sender != s_owner) revert NotOwner(msg.sender);
        _;
    }

    function verifyReportWithTimestamp(
        bytes memory unverifiedReport,
        uint8 feedNumber
    ) external returns (int192, uint32) {
        // Report verification fees
        IFeeManager feeManager = IFeeManager(
            address(verifiersProxy[feedNumber].s_feeManager())
        );

        IRewardManager rewardManager = IRewardManager(
            address(feeManager.i_rewardManager())
        );

        (, /* bytes32[3] reportContextData */ bytes memory reportData) = abi
            .decode(unverifiedReport, (bytes32[3], bytes));

        address feeTokenAddress = feeManager.i_linkAddress();

        (Common.Asset memory fee, , ) = feeManager.getFeeAndReward(
            address(this),
            reportData,
            feeTokenAddress
        );
        // Approve rewardManager to spend this contract's balance in fees
        IERC20(feeTokenAddress).approve(address(rewardManager), fee.amount);

        // Verify the report
        bytes memory verifiedReportData = verifiersProxy[feedNumber].verify(
            unverifiedReport,
            abi.encode(feeTokenAddress)
        );
        // Decode verified report data into BasicReport struct
        // If your report is a PremiumReport, you should decode it as a PremiumReport
        BasicReport memory verifiedReport = abi.decode(
            verifiedReportData,
            (BasicReport)
        );

        // Log price from report
        emit DecodedPrice(verifiedReport.price);

        // require(feedNumber == verifiedReport.feedNumber, "Wrong feed id");
        last_decoded_price = verifiedReport.price;
        last_validFromTimestamp = verifiedReport.validFromTimestamp;
        return (verifiedReport.price, verifiedReport.validFromTimestamp);
    }

    function verifyReport(
        bytes memory unverifiedReport,
        uint8 feedNumber
    ) external returns (int192) {
        // Report verification fees
        IFeeManager feeManager = IFeeManager(
            address(verifiersProxy[feedNumber].s_feeManager())
        );

        IRewardManager rewardManager = IRewardManager(
            address(feeManager.i_rewardManager())
        );

        (, /* bytes32[3] reportContextData */ bytes memory reportData) = abi
            .decode(unverifiedReport, (bytes32[3], bytes));

        address feeTokenAddress = feeManager.i_linkAddress();

        (Common.Asset memory fee, , ) = feeManager.getFeeAndReward(
            address(this),
            reportData,
            feeTokenAddress
        );
        // Approve rewardManager to spend this contract's balance in fees
        IERC20(feeTokenAddress).approve(address(rewardManager), fee.amount);

        // Verify the report
        bytes memory verifiedReportData = verifiersProxy[feedNumber].verify(
            unverifiedReport,
            abi.encode(feeTokenAddress)
        );
        // Decode verified report data into BasicReport struct
        // If your report is a PremiumReport, you should decode it as a PremiumReport
        BasicReport memory verifiedReport = abi.decode(
            verifiedReportData,
            (BasicReport)
        );

        // Log price from report
        emit DecodedPrice(verifiedReport.price);

        // require(feedNumber == verifiedReport.feedNumber, "Wrong feed id");
        last_decoded_price = verifiedReport.price;
        return verifiedReport.price;
    }

    function setfeedNumber(uint8 feedNumber, address verifierProxy) public {
        verifiersProxy[feedNumber] = IVerifierProxy(verifierProxy);
    }

    /**
     * @notice Withdraws all tokens of a specific ERC20 token type to a beneficiary address.
     * @dev Utilizes SafeERC20's safeTransfer for secure token transfer. Reverts if the contract's balance of the specified token is zero.
     * @param _beneficiary Address to which the tokens will be sent. Must not be the zero address.
     * @param _token Address of the ERC20 token to be withdrawn. Must be a valid ERC20 token contract.
     */
    function withdrawToken(
        address _beneficiary,
        address _token // LINK token address on Arbitrum Sepolia: 0x779877A7B0D9E8603169DdbD7836e478b4624789
    ) public onlyOwner {
        // Retrieve the balance of this contract
        uint256 amount = IERC20(_token).balanceOf(address(this));

        // Revert if there is nothing to withdraw
        if (amount == 0) revert NothingToWithdraw();

        IERC20(_token).safeTransfer(_beneficiary, amount);
    }

    function approve(uint8 feedNumber, uint256 amount) public {
        IFeeManager feeManager = IFeeManager(
            address(verifiersProxy[feedNumber].s_feeManager())
        );

        IRewardManager rewardManager = IRewardManager(
            address(feeManager.i_rewardManager())
        );
        address feeTokenAddress = feeManager.i_linkAddress();
        IERC20(feeTokenAddress).approve(address(rewardManager), amount);
    }
}
