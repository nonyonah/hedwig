// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HedwigPayment
 * @dev Smart contract for Hedwig freelancer assistant app
 * Handles invoice and payment link payments with automatic fee splitting
 */
contract HedwigPayment is Ownable, ReentrancyGuard {
    // Platform fee in basis points (e.g., 150 = 1.5%)
    uint256 public platformFee = 150; // Default 1.5%
    uint256 public constant MAX_FEE = 500; // Maximum 5%
    
    // Platform wallet address
    address public platformWallet;
    
    // Mapping of whitelisted stablecoins
    mapping(address => bool) public whitelistedTokens;
    
    // Events
    event PaymentReceived(
        address indexed payer,
        address indexed freelancer,
        address indexed token,
        uint256 amount,
        uint256 fee,
        string invoiceId
    );
    
    event TokenWhitelisted(address indexed token, bool status);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);
    
    // Custom errors
    error TokenNotWhitelisted();
    error InvalidAmount();
    error InvalidFee();
    error InvalidAddress();
    error TransferFailed();
    error InsufficientAllowance();
    
    /**
     * @dev Constructor
     * @param _platformWallet Address to receive platform fees
     * @param _initialTokens Array of initial whitelisted token addresses
     */
    constructor(
        address _platformWallet,
        address[] memory _initialTokens
    ) Ownable(msg.sender) {
        if (_platformWallet == address(0)) revert InvalidAddress();
        
        platformWallet = _platformWallet;
        
        // Whitelist initial tokens
        for (uint256 i = 0; i < _initialTokens.length; i++) {
            if (_initialTokens[i] != address(0)) {
                whitelistedTokens[_initialTokens[i]] = true;
                emit TokenWhitelisted(_initialTokens[i], true);
            }
        }
    }
    
    /**
     * @dev Main payment function for invoices and payment links
     * @param token Address of the stablecoin to use for payment
     * @param amount Total amount to pay
     * @param freelancer Address of the freelancer to receive payout
     * @param invoiceId String reference (invoice ID, payment link ID, or unique reference)
     */
    function pay(
        address token,
        uint256 amount,
        address freelancer,
        string calldata invoiceId
    ) external nonReentrant {
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
        if (amount == 0) revert InvalidAmount();
        if (freelancer == address(0)) revert InvalidAddress();
        
        IERC20 stablecoin = IERC20(token);
        
        // Check allowance
        uint256 allowance = stablecoin.allowance(msg.sender, address(this));
        if (allowance < amount) revert InsufficientAllowance();
        
        // Calculate fee and freelancer payout
        uint256 fee = (amount * platformFee) / 10000;
        uint256 freelancerPayout = amount - fee;
        
        // Transfer tokens from payer to contract
        bool success = stablecoin.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        
        // Transfer fee to platform wallet
        if (fee > 0) {
            success = stablecoin.transfer(platformWallet, fee);
            if (!success) revert TransferFailed();
        }
        
        // Transfer remaining amount to freelancer
        success = stablecoin.transfer(freelancer, freelancerPayout);
        if (!success) revert TransferFailed();
        
        // Emit payment event
        emit PaymentReceived(
            msg.sender,
            freelancer,
            token,
            amount,
            fee,
            invoiceId
        );
    }
    
    /**
     * @dev Whitelist or un-whitelist a stablecoin
     * @param token Address of the token
     * @param status True to whitelist, false to remove
     */
    function setTokenWhitelist(address token, bool status) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        
        whitelistedTokens[token] = status;
        emit TokenWhitelisted(token, status);
    }
    
    /**
     * @dev Batch whitelist multiple tokens
     * @param tokens Array of token addresses
     * @param statuses Array of corresponding statuses
     */
    function batchSetTokenWhitelist(
        address[] calldata tokens,
        bool[] calldata statuses
    ) external onlyOwner {
        if (tokens.length != statuses.length) revert InvalidAmount();
        
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] != address(0)) {
                whitelistedTokens[tokens[i]] = statuses[i];
                emit TokenWhitelisted(tokens[i], statuses[i]);
            }
        }
    }
    
    /**
     * @dev Set platform fee (in basis points)
     * @param _fee New fee in basis points (e.g., 150 = 1.5%)
     */
    function setPlatformFee(uint256 _fee) external onlyOwner {
        if (_fee > MAX_FEE) revert InvalidFee();
        
        uint256 oldFee = platformFee;
        platformFee = _fee;
        emit PlatformFeeUpdated(oldFee, _fee);
    }
    
    /**
     * @dev Update platform wallet address
     * @param _newWallet New platform wallet address
     */
    function setPlatformWallet(address _newWallet) external onlyOwner {
        if (_newWallet == address(0)) revert InvalidAddress();
        
        address oldWallet = platformWallet;
        platformWallet = _newWallet;
        emit PlatformWalletUpdated(oldWallet, _newWallet);
    }
    
    /**
     * @dev Check if a token is whitelisted
     * @param token Token address to check
     * @return bool True if whitelisted
     */
    function isTokenWhitelisted(address token) external view returns (bool) {
        return whitelistedTokens[token];
    }
    
    /**
     * @dev Calculate fee for a given amount
     * @param amount Payment amount
     * @return fee Platform fee amount
     * @return freelancerPayout Amount after fee deduction
     */
    function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 freelancerPayout) {
        fee = (amount * platformFee) / 10000;
        freelancerPayout = amount - fee;
    }
    
    /**
     * @dev Emergency function to recover stuck tokens (only owner)
     * @param token Token address
     * @param amount Amount to recover
     */
    function emergencyRecoverToken(address token, uint256 amount) external onlyOwner {
        bool success = IERC20(token).transfer(owner(), amount);
        if (!success) revert TransferFailed();
    }
    
    /**
     * @dev Get contract version
     * @return string Contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}