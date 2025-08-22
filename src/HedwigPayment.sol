// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal IERC20 interface for USDC only
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title HedwigPayment
 * @dev Optimized smart contract for Hedwig payments with 1% platform fee
 * Gas-optimized version with minimal features for cost-effective deployment
 */
contract HedwigPayment {
    // --- Constants (immutable for gas savings) ---
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // Base Sepolia USDC Testnet (correct)
    uint256 public constant PLATFORM_FEE = 100; // 1% in basis points
    
    address public immutable PLATFORM_WALLET;
    address public immutable OWNER;
    
    // --- Events ---
    event PaymentReceived(
        address indexed payer,
        address indexed freelancer,
        uint256 amount,
        uint256 fee,
        string invoiceId
    );

    // --- Custom Errors (gas efficient) ---
    error InvalidAddress();
    error InvalidAmount();
    error TransferFailed();
    error InsufficientAllowance();
    error Unauthorized();
    
    /**
     * @dev Constructor sets immutable values for gas efficiency
     * @param _platformWallet Address to receive platform fees
     */
    constructor(address _platformWallet) {
        if (_platformWallet == address(0)) revert InvalidAddress();
        PLATFORM_WALLET = _platformWallet;
        OWNER = msg.sender;
    }

    function version() public pure returns (string memory) {
        return "3.0.0";
    }
    
    /**
     * @notice Pay an invoice or payment link in USDC with 1% platform fee
     * @dev Optimized for gas efficiency with minimal checks
     * @param amount Amount of USDC to pay (must be > 0)
     * @param freelancer Address to receive payout
     * @param invoiceId Reference string for tracking
     */
    function pay(
        uint256 amount,
        address freelancer,
        string memory invoiceId
    ) external {
        // Input validation
        if (amount == 0) revert InvalidAmount();
        if (freelancer == address(0)) revert InvalidAddress();

        IERC20 usdc = IERC20(USDC);
        
        // Check allowance
        if (usdc.allowance(msg.sender, address(this)) < amount) {
            revert InsufficientAllowance();
        }

        // Calculate fee (1%)
        uint256 fee = (amount * PLATFORM_FEE) / 10000;
        uint256 freelancerPayout = amount - fee;

        // Transfer USDC from payer to contract
        if (!usdc.transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        // Transfer fee to platform wallet
        if (fee > 0 && !usdc.transfer(PLATFORM_WALLET, fee)) {
            revert TransferFailed();
        }

        // Transfer payout to freelancer
        if (!usdc.transfer(freelancer, freelancerPayout)) {
            revert TransferFailed();
        }

        emit PaymentReceived(msg.sender, freelancer, amount, fee, invoiceId);
    }
    

}