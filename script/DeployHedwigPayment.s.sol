// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HedwigPayment} from "../src/HedwigPayment.sol";

/**
 * @title Deploy Enhanced HedwigPayment
 * @dev Deployment script for the new enhanced HedwigPayment contract
 */
contract DeployHedwigPayment is Script {
    // Base Sepolia USDC address
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    
    // Base Mainnet USDC address (for future use)
    address constant BASE_MAINNET_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    function run() external {
        // Get deployment configuration from environment
        address platformWallet = getPlatformWallet();
        address usdcAddress = getUSDCAddress();
        uint256 deployerPrivateKey = getDeployerPrivateKey();
        
        console.log("=== Hedwig Payment Contract Deployment ===");
        console.log("Platform Wallet:", platformWallet);
        console.log("USDC Address:", usdcAddress);
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Chain ID:", block.chainid);
        
        // Start broadcast
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy the contract
        HedwigPayment hedwigPayment = new HedwigPayment(
            platformWallet,
            usdcAddress
        );
        
        vm.stopBroadcast();
        
        // Log deployment results
        console.log("\n=== Deployment Successful ===");
        console.log("Contract Address:", address(hedwigPayment));
        console.log("Contract Version:", hedwigPayment.version());
        console.log("Platform Fee:", hedwigPayment.platformFee(), "basis points");
        console.log("Platform Wallet:", hedwigPayment.platformWallet());
        console.log("USDC Address:", hedwigPayment.USDC());
        console.log("Owner:", hedwigPayment.owner());
        
        // Check USDC whitelist status
        bool usdcWhitelisted = hedwigPayment.isTokenWhitelisted(usdcAddress);
        console.log("USDC Whitelisted:", usdcWhitelisted);
        
        // Output environment variable configuration
        console.log("\n=== Environment Configuration ===");
        if (block.chainid == 84532) {
            console.log("Add to .env.local for Base Sepolia:");
            console.log("NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=", address(hedwigPayment));
            console.log("HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=", address(hedwigPayment));
        } else if (block.chainid == 8453) {
            console.log("Add to .env.local for Base Mainnet:");
            console.log("NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=", address(hedwigPayment));
            console.log("HEDWIG_PAYMENT_CONTRACT_ADDRESS_MAINNET=", address(hedwigPayment));
        } else {
            console.log("Add to .env.local:");
            console.log("NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS=", address(hedwigPayment));
        }
        
        console.log("\n=== Next Steps ===");
        console.log("1. Update your .env.local file with the contract address");
        console.log("2. Verify the contract on Basescan (optional)");
        console.log("3. Test the contract functionality");
        console.log("4. Update frontend integration if needed");
    }
    
    function getPlatformWallet() internal view returns (address) {
        // Try to get platform wallet from environment variables
        address wallet;
        
        if (block.chainid == 84532) {
            // Base Sepolia
            wallet = vm.envOr("HEDWIG_PLATFORM_WALLET_TESTNET", address(0));
        } else if (block.chainid == 8453) {
            // Base Mainnet
            wallet = vm.envOr("HEDWIG_PLATFORM_WALLET_MAINNET", address(0));
        }
        
        // Fallback to generic environment variable
        if (wallet == address(0)) {
            wallet = vm.envOr("HEDWIG_PLATFORM_WALLET", address(0));
        }
        
        // Final fallback to deployer address
        if (wallet == address(0)) {
            uint256 deployerKey = getDeployerPrivateKey();
            wallet = vm.addr(deployerKey);
            console.log("Warning: Using deployer address as platform wallet");
        }
        
        require(wallet != address(0), "Platform wallet address not configured");
        return wallet;
    }
    
    function getUSDCAddress() internal view returns (address) {
        if (block.chainid == 84532) {
            return BASE_SEPOLIA_USDC;
        } else if (block.chainid == 8453) {
            return BASE_MAINNET_USDC;
        } else {
            // For other networks, try to get from environment
            address usdc = vm.envOr("USDC_CONTRACT_ADDRESS", address(0));
            require(usdc != address(0), "USDC address not configured for this network");
            return usdc;
        }
    }
    
    function getDeployerPrivateKey() internal view returns (uint256) {
        string memory privateKeyStr = vm.envString("PLATFORM_PRIVATE_KEY");
        
        // Handle private key format (with or without 0x prefix)
        if (bytes(privateKeyStr).length >= 2 && 
            bytes(privateKeyStr)[0] == 0x30 && 
            bytes(privateKeyStr)[1] == 0x78) {
            // Already has 0x prefix
            return vm.parseUint(privateKeyStr);
        } else {
            // Add 0x prefix
            return vm.parseUint(string(abi.encodePacked("0x", privateKeyStr)));
        }
    }
}