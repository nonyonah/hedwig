// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title HedwigProjectContract
 * @dev Ultra-minimal smart contract for managing project-based contracts
 */
contract HedwigProjectContract is Ownable {
    // Platform configuration
    address public platformWallet;
    uint256 public platformFeeRate; // Basis points (e.g., 250 = 2.5%)
    uint256 public constant MAX_PLATFORM_FEE = 1000; // 10% max

    // Counter
    uint256 private _contractIdCounter;

    // Contract statuses
    enum ContractStatus {
        Created,
        Funded,
        Completed,
        Approved
    }

    // Project contract structure
    struct ProjectContract {
        uint256 contractId;
        address client;
        address freelancer;
        string title;
        uint256 amount;
        address tokenAddress;
        uint256 deadline;
        ContractStatus status;
    }

    // Storage
    mapping(uint256 => ProjectContract) public contracts;

    // Events
    event ContractCreated(uint256 indexed contractId, address indexed client, address indexed freelancer);
    event ContractFunded(uint256 indexed contractId, uint256 amount);
    event ContractCompleted(uint256 indexed contractId);
    event ContractApproved(uint256 indexed contractId);
    event PaymentReleased(uint256 indexed contractId, address indexed freelancer, uint256 amount);

    // Modifiers
    modifier contractExists(uint256 contractId) {
        require(contracts[contractId].contractId != 0, "Contract does not exist");
        _;
    }

    modifier onlyClient(uint256 contractId) {
        require(msg.sender == contracts[contractId].client, "Only client");
        _;
    }

    modifier onlyFreelancer(uint256 contractId) {
        require(msg.sender == contracts[contractId].freelancer, "Only freelancer");
        _;
    }

    constructor(address _platformWallet, uint256 _platformFeeRate) Ownable(msg.sender) {
        require(_platformWallet != address(0), "Invalid platform wallet");
        require(_platformFeeRate <= MAX_PLATFORM_FEE, "Platform fee too high");
        
        platformWallet = _platformWallet;
        platformFeeRate = _platformFeeRate;
    }

    /**
     * @dev Create a new project contract
     */
    function createContract(
        address _client,
        address _freelancer,
        string memory _title,
        uint256 _amount,
        address _tokenAddress,
        uint256 _deadline
    ) external returns (uint256) {
        require(_client != address(0), "Invalid client");
        require(_freelancer != address(0), "Invalid freelancer");
        require(_client != _freelancer, "Client and freelancer must be different");
        require(_amount > 0, "Amount must be greater than 0");
        require(_deadline > block.timestamp, "Invalid deadline");
        
        uint256 contractId = ++_contractIdCounter;
        
        contracts[contractId].contractId = contractId;
        contracts[contractId].client = _client;
        contracts[contractId].freelancer = _freelancer;
        contracts[contractId].title = _title;
        contracts[contractId].amount = _amount;
        contracts[contractId].tokenAddress = _tokenAddress;
        contracts[contractId].deadline = _deadline;
        contracts[contractId].status = ContractStatus.Created;
        
        emit ContractCreated(contractId, _client, _freelancer);
        return contractId;
    }

    /**
     * @dev Fund a contract
     */
    function fundContract(uint256 contractId) 
        external 
        payable
        contractExists(contractId) 
        onlyClient(contractId)
    {
        require(contracts[contractId].status == ContractStatus.Created, "Invalid status");
        
        if (contracts[contractId].tokenAddress == address(0)) {
            require(msg.value == contracts[contractId].amount, "Incorrect amount");
        } else {
            require(msg.value == 0, "No ETH for token payments");
            IERC20(contracts[contractId].tokenAddress).transferFrom(
                msg.sender,
                address(this),
                contracts[contractId].amount
            );
        }
        
        contracts[contractId].status = ContractStatus.Funded;
        emit ContractFunded(contractId, contracts[contractId].amount);
    }

    /**
     * @dev Complete contract
     */
    function completeContract(uint256 contractId)
        external
        contractExists(contractId)
        onlyFreelancer(contractId)
    {
        require(contracts[contractId].status == ContractStatus.Funded, "Not funded");
        contracts[contractId].status = ContractStatus.Completed;
        emit ContractCompleted(contractId);
    }

    /**
     * @dev Approve contract and release payment
     */
    function approveContract(uint256 contractId)
        external
        contractExists(contractId)
        onlyClient(contractId)
    {
        require(contracts[contractId].status == ContractStatus.Completed, "Not completed");
        
        contracts[contractId].status = ContractStatus.Approved;
        
        uint256 amount = contracts[contractId].amount;
        uint256 platformFee = (amount * platformFeeRate) / 10000;
        uint256 freelancerAmount = amount - platformFee;
        
        if (contracts[contractId].tokenAddress == address(0)) {
            payable(contracts[contractId].freelancer).transfer(freelancerAmount);
            if (platformFee > 0) {
                payable(platformWallet).transfer(platformFee);
            }
        } else {
            IERC20 token = IERC20(contracts[contractId].tokenAddress);
            token.transfer(contracts[contractId].freelancer, freelancerAmount);
            if (platformFee > 0) {
                token.transfer(platformWallet, platformFee);
            }
        }
        
        emit PaymentReleased(contractId, contracts[contractId].freelancer, freelancerAmount);
        emit ContractApproved(contractId);
    }

    // View functions
    function getContract(uint256 contractId) external view returns (ProjectContract memory) {
        return contracts[contractId];
    }

    // Admin functions
    function updatePlatformWallet(address _newPlatformWallet) external onlyOwner {
        require(_newPlatformWallet != address(0), "Invalid wallet");
        platformWallet = _newPlatformWallet;
    }

    function updatePlatformFeeRate(uint256 _newFeeRate) external onlyOwner {
        require(_newFeeRate <= MAX_PLATFORM_FEE, "Fee too high");
        platformFeeRate = _newFeeRate;
    }
}