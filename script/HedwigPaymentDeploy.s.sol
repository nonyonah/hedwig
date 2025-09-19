// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HedwigPayment} from "../src/HedwigPayment.sol";

/**
 * @title HedwigPaymentDeploy
 * @dev Deployment script for HedwigPayment contract across multiple networks
 * @notice This script handles deployment to Base, Celo, and Lisk networks (mainnet and testnet)
 */
contract HedwigPaymentDeploy is Script {
    // Network-specific configuration
    struct NetworkConfig {
        address platformWallet;
        address usdcAddress;
        string networkName;
    }
    
    // Platform wallet addresses (same across all networks for now)
    address constant PLATFORM_WALLET = 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d; // Replace with actual platform wallet
    
    // USDC token addresses per network
    // Base Mainnet
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    // Celo Mainnet - Using cUSD instead of USDC
    address constant CELO_CUSD = 0x765de816845861e75a25fca122bb6898b8b1282a;
    
    // Celo Alfajores Testnet (Circle USDC)
    address constant CELO_ALFAJORES_USDC = 0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B; // Circle USDC on Alfajores
    
    // Lisk Mainnet - Using USDT instead of USDC
    address constant LISK_USDT = 0x05D032ac25d322df992303dCa074EE7392C117b9;
    
    // Lisk Sepolia Testnet (Mock USDC for testing - will need to deploy or use test token)
    address constant LISK_SEPOLIA_USDC = 0x0000000000000000000000000000000000000000; // To be deployed or found
    
    HedwigPayment public hedwigPayment;
    
    function setUp() public {}
    
    function run() public {
        NetworkConfig memory config = getNetworkConfig();
        
        vm.startBroadcast();
        
        // Deploy HedwigPayment contract
        hedwigPayment = new HedwigPayment(
            config.platformWallet,
            config.usdcAddress
        );
        
        vm.stopBroadcast();
        
        // Log deployment information
        console.log("=== HedwigPayment Deployment ===");
        console.log("Network:", config.networkName);
        console.log("Contract Address:", address(hedwigPayment));
        console.log("Platform Wallet:", config.platformWallet);
        console.log("USDC Address:", config.usdcAddress);
        console.log("Deployer:", msg.sender);
        console.log("================================");
    }
    
    function getNetworkConfig() internal view returns (NetworkConfig memory) {
        uint256 chainId = block.chainid;
        
        if (chainId == 8453) {
            // Base Mainnet
            return NetworkConfig({
                platformWallet: PLATFORM_WALLET,
                usdcAddress: BASE_USDC,
                networkName: "Base Mainnet"
            });
        } else if (chainId == 42220) {
            // Celo Mainnet
            return NetworkConfig({
                platformWallet: PLATFORM_WALLET,
                usdcAddress: CELO_CUSD,
                networkName: "Celo Mainnet"
            });
        } else if (chainId == 44787) {
            // Celo Alfajores Testnet
            return NetworkConfig({
                platformWallet: PLATFORM_WALLET,
                usdcAddress: CELO_ALFAJORES_USDC,
                networkName: "Celo Alfajores Testnet"
            });
        } else if (chainId == 1135) {
            // Lisk Mainnet
            return NetworkConfig({
                platformWallet: PLATFORM_WALLET,
                usdcAddress: LISK_USDT,
                networkName: "Lisk Mainnet"
            });
        } else if (chainId == 4202) {
            // Lisk Sepolia Testnet
            return NetworkConfig({
                platformWallet: PLATFORM_WALLET,
                usdcAddress: LISK_SEPOLIA_USDC,
                networkName: "Lisk Sepolia Testnet"
            });
        } else {
            // Default/Unknown network - use Base config as fallback
            console.log("Warning: Unknown network, using Base Mainnet config as fallback");
            return NetworkConfig({
                platformWallet: PLATFORM_WALLET,
                usdcAddress: BASE_USDC,
                networkName: "Unknown Network (Base Fallback)"
            });
        }
    }
    
    /**
     * @dev Helper function to verify deployment
     * Call this after deployment to ensure everything is set up correctly
     */
    function verifyDeployment() external view {
        require(address(hedwigPayment) != address(0), "Contract not deployed");
        require(hedwigPayment.platformWallet() == PLATFORM_WALLET, "Platform wallet mismatch");
        require(hedwigPayment.USDC() != address(0), "USDC address not set");
        require(hedwigPayment.whitelistedTokens(hedwigPayment.USDC()), "USDC not whitelisted");
        
        console.log("Deployment verification passed!");
    }
}