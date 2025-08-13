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
 * @dev Smart contract for Hedwig freelancer assistant app
 * Handles invoice and payment link payments with automatic fee splitting
 */
contract HedwigPayment {
    // --- Constants ---
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint256 public constant MAX_FEE = 500; // 5% max

    // --- Storage ---
    uint256 public platformFee = 150; // Default 1.5%
    address public platformWallet;
    address public owner;
    uint256 private _reentrancyLock;

    // Platform fee in basis points (e.g., 150 = 1.5%)
    uint256 public platformFee = 150; // Default 1.5%
    uint256 public constant MAX_FEE = 500; // Maximum 5%
    
    // Platform wallet address
    address public platformWallet;
    
    // --- Events ---
    event PaymentReceived(
        address indexed payer,
        address indexed freelancer,
        uint256 amount,
        uint256 fee,
        string invoiceId
    );

    // --- Custom Errors ---
    error InvalidAmount();
    error InvalidFee();
    error InvalidAddress();
    error TransferFailed();
    error InsufficientAllowance();
    error Unauthorized();
    error Reentrancy();
    
    /**
     * @dev Contract deploys with platform wallet and sets deployer as owner.
     *      Owner can update fee/wallet and recover tokens.
     *      USDC address is hardcoded for gas and security.
     * @param _platformWallet Address to receive platform fees (must not be zero)
     */
    constructor(address _platformWallet) {
        if (_platformWallet == address(0)) revert InvalidAddress();
        platformWallet = _platformWallet;
        owner = msg.sender;
        _reentrancyLock = 1;
    }
    
    /**
     * @dev Main payment function for invoices and payment links. USDC only.
     * @param amount Total amount to pay (must be > 0)
     * @param freelancer Address of the freelancer to receive payout
     * @param invoiceId String reference (invoice ID, payment link ID, or unique reference)
     * Implements comprehensive input validation, reentrancy protection, CEI pattern, and safe transfer.
     */
    /**
     * @notice Pay an invoice or payment link in USDC. Fee is split to platform.
     * @dev Implements:
     *      - Comprehensive input validation
     *      - Minimal reentrancy protection (state var)
     *      - Checks-Effects-Interactions (CEI) pattern
     *      - Overflow checks for fee math
     *      - Safe transfer pattern, checks return values
     *      - Emits PaymentReceived event
     * @param amount Amount of USDC to pay (must be > 0)
     * @param freelancer Address to receive payout (must not be zero)
     * @param invoiceId Reference string (invoice/payment link/unique)
     */
    function pay(
        uint256 amount,
        address freelancer,
        string calldata invoiceId
    ) external {
        // --- Reentrancy Guard ---
        // Prevent reentrant calls with minimal storage (saves gas vs. OZ)
        if (_reentrancyLock != 1) revert Reentrancy();
        _reentrancyLock = 2;

        // --- Input Validation ---
        // Validate all input addresses and amounts
        if (amount == 0) revert InvalidAmount();
        if (freelancer == address(0)) revert InvalidAddress();
        if (msg.sender == address(0)) revert InvalidAddress();

        IERC20 usdc = IERC20(USDC);
        uint256 allowance = usdc.allowance(msg.sender, address(this));
        if (allowance < amount) revert InsufficientAllowance();

        // --- Fee Calculation with Overflow Protection ---
        // Prevent overflow and ensure fee cannot exceed amount
        uint256 fee = (amount * platformFee) / 10000;
        if (fee > amount) revert InvalidFee();
        uint256 freelancerPayout = amount - fee;

        // --- CEI Pattern: Checks-Effects-Interactions ---
        // Effects: No state changes for this stateless payment

        // --- Interactions ---
        // Transfer USDC from payer to contract
        bool ok = usdc.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        // Transfer platform fee to platform wallet
        if (fee > 0) {
            ok = usdc.transfer(platformWallet, fee);
            if (!ok) revert TransferFailed();
        }

        // Transfer payout to freelancer
        ok = usdc.transfer(freelancer, freelancerPayout);
        if (!ok) revert TransferFailed();

        // --- Emit event ---
        emit PaymentReceived(msg.sender, freelancer, amount, fee, invoiceId);

        // --- Release reentrancy lock ---
        _reentrancyLock = 1;
    }
    
    // --- Token whitelist functions removed: USDC only ---

    
    /**
     * @notice Set the platform fee (basis points, max 5%). Only callable by owner.
     * @dev Protects against excessive fees. Zero fee is allowed.
     * @param _fee New platform fee in basis points (e.g., 150 = 1.5%)
     */
    function setPlatformFee(uint256 _fee) external onlyOwner {
        if (_fee > MAX_FEE) revert InvalidFee();
        platformFee = _fee;
    }
    
    /**
     * @notice Update the platform wallet address. Only callable by owner.
     * @dev New wallet must not be zero address.
     * @param _newWallet New platform wallet address
     */
    function setPlatformWallet(address _newWallet) external onlyOwner {
        if (_newWallet == address(0)) revert InvalidAddress();
        platformWallet = _newWallet;
    }
    
    // --- Whitelist and fee calculation view functions removed: USDC only ---

    
    /**
     * @notice Emergency function to recover any ERC20 tokens sent to contract.
     * @dev Only callable by owner. Use with caution.
     * @param token Address of the ERC20 token to recover
     * @param amount Amount to recover
     */
    function emergencyRecoverToken(address token, uint256 amount) external onlyOwner {
        bool ok = IERC20(token).transfer(owner, amount);
        if (!ok) revert TransferFailed();
    }
    
    /**
     * @notice Get contract version string.
     * @dev For frontend and integration checks.
     */
    function version() external pure returns (string memory) {
        return "2.0.0";
    }

    // --- Minimal Ownable replacement ---
    /**
     * @dev Only allow the owner to call this function.
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // --- Minimal reentrancy guard replacement ---
    // (implemented directly in pay())
}