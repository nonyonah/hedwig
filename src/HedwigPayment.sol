// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HedwigPayment
 * @dev Enhanced smart contract for Hedwig freelancer payments with comprehensive features
 * @author Hedwig Team
 * @notice This contract handles invoice payments, payment links, and fee distribution
 */
contract HedwigPayment is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant MAX_PLATFORM_FEE = 500; // 5% maximum platform fee
    uint256 public constant BASIS_POINTS = 10000; // 100% in basis points
    string public constant VERSION = "4.0.0";
    
    // ============ State Variables ============
    address public immutable USDC; // USDC token address
    address public platformWallet; // Platform fee recipient
    uint256 public platformFee; // Platform fee in basis points (default 100 = 1%)
    
    // Token whitelist for supported payments
    mapping(address => bool) public whitelistedTokens;
    
    // Payment tracking
    mapping(string => bool) public processedInvoices;
    mapping(address => uint256) public totalPaymentsReceived;
    mapping(address => uint256) public totalPaymentsSent;
    
    // Emergency controls
    bool public emergencyWithdrawEnabled;
    
    // ============ Events ============
    event PaymentReceived(
        address indexed payer,
        address indexed freelancer,
        address indexed token,
        uint256 amount,
        uint256 fee,
        uint256 freelancerPayout,
        string invoiceId,
        uint256 timestamp
    );
    
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event PlatformWalletUpdated(address oldWallet, address newWallet);
    event TokenWhitelistUpdated(address indexed token, bool status);
    event EmergencyWithdrawExecuted(address indexed token, uint256 amount);
    event ContractPaused(address indexed by);
    event ContractUnpaused(address indexed by);
    
    // ============ Custom Errors ============
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFee();
    error TokenNotWhitelisted();
    error InsufficientAllowance();
    error TransferFailed();
    error InvoiceAlreadyProcessed();
    error EmergencyWithdrawNotEnabled();
    error ZeroBalance();
    
    // ============ Modifiers ============
    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert InvalidAddress();
        _;
    }
    
    modifier validAmount(uint256 _amount) {
        if (_amount == 0) revert InvalidAmount();
        _;
    }
    
    modifier onlyWhitelistedToken(address _token) {
        if (!whitelistedTokens[_token]) revert TokenNotWhitelisted();
        _;
    }
    
    // ============ Constructor ============
    /**
     * @dev Initialize the contract with platform wallet and USDC address
     * @param _platformWallet Address to receive platform fees
     * @param _usdcAddress USDC token contract address
     */
    constructor(
        address _platformWallet,
        address _usdcAddress
    ) 
        Ownable(msg.sender)
        validAddress(_platformWallet)
        validAddress(_usdcAddress)
    {
        platformWallet = _platformWallet;
        USDC = _usdcAddress;
        platformFee = 100; // 1% default fee
        
        // Whitelist USDC by default
        whitelistedTokens[_usdcAddress] = true;
        
        emit TokenWhitelistUpdated(_usdcAddress, true);
        emit PlatformWalletUpdated(address(0), _platformWallet);
    }
    
    // ============ Main Payment Functions ============
    /**
     * @notice Process a payment for an invoice or payment link (requires approval)
     * @dev Transfers tokens from payer to freelancer with platform fee deduction
     * @param token Token contract address (must be whitelisted)
     * @param amount Total amount to pay
     * @param freelancer Address to receive the payment
     * @param invoiceId Unique identifier for the payment
     */
    function pay(
        address token,
        uint256 amount,
        address freelancer,
        string calldata invoiceId
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(freelancer)
        validAmount(amount)
        onlyWhitelistedToken(token)
    {
        // Check if invoice was already processed
        if (bytes(invoiceId).length > 0 && processedInvoices[invoiceId]) {
            revert InvoiceAlreadyProcessed();
        }
        
        IERC20 paymentToken = IERC20(token);
        
        // Check allowance
        uint256 allowance = paymentToken.allowance(msg.sender, address(this));
        if (allowance < amount) {
            revert InsufficientAllowance();
        }
        
        // Calculate fees and payouts
        uint256 fee = (amount * platformFee) / BASIS_POINTS;
        uint256 freelancerPayout = amount - fee;
        
        // Transfer tokens from payer to contract
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Transfer fee to platform wallet
        if (fee > 0) {
            paymentToken.safeTransfer(platformWallet, fee);
        }
        
        // Transfer payout to freelancer
        paymentToken.safeTransfer(freelancer, freelancerPayout);
        
        // Mark invoice as processed if provided
        if (bytes(invoiceId).length > 0) {
            processedInvoices[invoiceId] = true;
        }
        
        // Update payment tracking
        totalPaymentsReceived[freelancer] += freelancerPayout;
        totalPaymentsSent[msg.sender] += amount;
        
        emit PaymentReceived(
            msg.sender,
            freelancer,
            token,
            amount,
            fee,
            freelancerPayout,
            invoiceId,
            block.timestamp
        );
    }
    
    /**
     * @notice Process a payment for an invoice or payment link (no approval required)
     * @dev Processes tokens already sent to the contract with platform fee deduction
     * @param token Token contract address (must be whitelisted)
     * @param amount Total amount to process
     * @param freelancer Address to receive the payment
     * @param invoiceId Unique identifier for the payment
     * @param payer Address of the payer (for tracking purposes)
     */
    function payDirect(
        address token,
        uint256 amount,
        address freelancer,
        string calldata invoiceId,
        address payer
    )
        external
        nonReentrant
        whenNotPaused
        validAddress(freelancer)
        validAddress(payer)
        validAmount(amount)
        onlyWhitelistedToken(token)
    {
        // Check if invoice was already processed
        if (bytes(invoiceId).length > 0 && processedInvoices[invoiceId]) {
            revert InvoiceAlreadyProcessed();
        }
        
        IERC20 paymentToken = IERC20(token);
        
        // Check contract has sufficient balance
        uint256 contractBalance = paymentToken.balanceOf(address(this));
        if (contractBalance < amount) {
            revert InsufficientAllowance(); // Reusing error for insufficient funds
        }
        
        // Calculate fees and payouts
        uint256 fee = (amount * platformFee) / BASIS_POINTS;
        uint256 freelancerPayout = amount - fee;
        
        // Transfer fee to platform wallet
        if (fee > 0) {
            paymentToken.safeTransfer(platformWallet, fee);
        }
        
        // Transfer payout to freelancer
        paymentToken.safeTransfer(freelancer, freelancerPayout);
        
        // Mark invoice as processed if provided
        if (bytes(invoiceId).length > 0) {
            processedInvoices[invoiceId] = true;
        }
        
        // Update payment tracking
        totalPaymentsReceived[freelancer] += freelancerPayout;
        totalPaymentsSent[payer] += amount;
        
        emit PaymentReceived(
            payer,
            freelancer,
            token,
            amount,
            fee,
            freelancerPayout,
            invoiceId,
            block.timestamp
        );
    }
    
    // ============ Admin Functions ============
    /**
     * @notice Update the platform fee percentage
     * @dev Only owner can call this function
     * @param _newFee New fee in basis points (max 5%)
     */
    function setPlatformFee(uint256 _newFee) external onlyOwner {
        if (_newFee > MAX_PLATFORM_FEE) revert InvalidFee();
        
        uint256 oldFee = platformFee;
        platformFee = _newFee;
        
        emit PlatformFeeUpdated(oldFee, _newFee);
    }
    
    /**
     * @notice Update the platform wallet address
     * @dev Only owner can call this function
     * @param _newWallet New platform wallet address
     */
    function setPlatformWallet(address _newWallet) 
        external 
        onlyOwner 
        validAddress(_newWallet) 
    {
        address oldWallet = platformWallet;
        platformWallet = _newWallet;
        
        emit PlatformWalletUpdated(oldWallet, _newWallet);
    }
    
    /**
     * @notice Add or remove a token from the whitelist
     * @dev Only owner can call this function
     * @param _token Token contract address
     * @param _status True to whitelist, false to remove
     */
    function setTokenWhitelist(address _token, bool _status) 
        external 
        onlyOwner 
        validAddress(_token) 
    {
        whitelistedTokens[_token] = _status;
        emit TokenWhitelistUpdated(_token, _status);
    }
    
    /**
     * @notice Pause the contract (emergency function)
     * @dev Only owner can call this function
     */
    function pause() external onlyOwner {
        _pause();
        emit ContractPaused(msg.sender);
    }
    
    /**
     * @notice Unpause the contract
     * @dev Only owner can call this function
     */
    function unpause() external onlyOwner {
        _unpause();
        emit ContractUnpaused(msg.sender);
    }
    
    /**
     * @notice Enable emergency withdraw functionality
     * @dev Only owner can call this function
     */
    function enableEmergencyWithdraw() external onlyOwner {
        emergencyWithdrawEnabled = true;
    }
    
    /**
     * @notice Emergency withdraw function for stuck tokens
     * @dev Only owner can call this function when emergency withdraw is enabled
     * @param _token Token contract address
     * @param _amount Amount to withdraw
     */
    function emergencyWithdraw(address _token, uint256 _amount) 
        external 
        onlyOwner 
        validAddress(_token)
        validAmount(_amount)
    {
        if (!emergencyWithdrawEnabled) revert EmergencyWithdrawNotEnabled();
        
        IERC20 token = IERC20(_token);
        uint256 balance = token.balanceOf(address(this));
        
        if (balance == 0) revert ZeroBalance();
        if (_amount > balance) _amount = balance;
        
        token.safeTransfer(owner(), _amount);
        
        emit EmergencyWithdrawExecuted(_token, _amount);
    }
    
    // ============ View Functions ============
    /**
     * @notice Calculate fee and freelancer payout for a given amount
     * @param _amount Payment amount
     * @return fee Platform fee amount
     * @return freelancerPayout Amount freelancer will receive
     */
    function calculateFee(uint256 _amount) 
        external 
        view 
        returns (uint256 fee, uint256 freelancerPayout) 
    {
        fee = (_amount * platformFee) / BASIS_POINTS;
        freelancerPayout = _amount - fee;
    }
    
    /**
     * @notice Check if a token is whitelisted
     * @param _token Token contract address
     * @return True if token is whitelisted
     */
    function isTokenWhitelisted(address _token) external view returns (bool) {
        return whitelistedTokens[_token];
    }
    
    /**
     * @notice Check if an invoice has been processed
     * @param _invoiceId Invoice identifier
     * @return True if invoice has been processed
     */
    function isInvoiceProcessed(string calldata _invoiceId) external view returns (bool) {
        return processedInvoices[_invoiceId];
    }
    
    /**
     * @notice Get contract version
     * @return Contract version string
     */
    function version() external pure returns (string memory) {
        return VERSION;
    }
    
    /**
     * @notice Get contract balance for a specific token
     * @param _token Token contract address
     * @return Token balance of this contract
     */
    function getContractBalance(address _token) external view returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }
    
    /**
     * @notice Get payment statistics for a freelancer
     * @param _freelancer Freelancer address
     * @return Total payments received by the freelancer
     */
    function getFreelancerStats(address _freelancer) external view returns (uint256) {
        return totalPaymentsReceived[_freelancer];
    }
    
    /**
     * @notice Get payment statistics for a payer
     * @param _payer Payer address
     * @return Total payments sent by the payer
     */
    function getPayerStats(address _payer) external view returns (uint256) {
        return totalPaymentsSent[_payer];
    }
}