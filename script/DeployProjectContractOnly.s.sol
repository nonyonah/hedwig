// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HedwigProjectContract} from "../src/HedwigProjectContract.sol";

/**
 * @title DeployProjectContractOnly
 * @dev Minimal deployment script for HedwigProjectContract only
 */
contract DeployProjectContractOnly is Script {
    // Platform wallet addresses
    address constant PLATFORM_WALLET = 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d;
    
    // Platform fee rate (100 = 1%)
    uint256 constant PLATFORM_FEE_RATE = 100;
    
    HedwigProjectContract public hedwigProjectContract;
    
    function run() public {
        uint256 chainId = block.chainid;
        string memory networkName = getNetworkName(chainId);
        
        console.log("Deploying to network:", networkName);
        console.log("Chain ID:", chainId);
        
        vm.startBroadcast();
        
        // Deploy HedwigProjectContract
        hedwigProjectContract = new HedwigProjectContract(
            PLATFORM_WALLET,
            PLATFORM_FEE_RATE
        );
        
        console.log("HedwigProjectContract deployed to:", address(hedwigProjectContract));
        console.log("Platform Wallet:", PLATFORM_WALLET);
        console.log("Platform Fee Rate:", PLATFORM_FEE_RATE);
        
        vm.stopBroadcast();
        
        // Log deployment details
        console.log("\n=== Deployment Summary ===");
        console.log("Contract Address:", address(hedwigProjectContract));
        console.log("Deployer:", msg.sender);
        console.log("Network:", networkName);
    }
    
    function getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 8453) return "Base Mainnet";
        if (chainId == 84532) return "Base Sepolia";
        if (chainId == 42220) return "Celo Mainnet";
        if (chainId == 44787) return "Celo Alfajores";
        return "Unknown Network";
    }
}