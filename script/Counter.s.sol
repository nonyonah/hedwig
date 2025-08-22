// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HedwigPayment} from "../src/HedwigPayment.sol";

/**
 * @title Deploy HedwigPayment
 * @dev Deployment script for the optimized HedwigPayment contract
 */
contract DeployHedwigPayment is Script {
    function run() external {
        // Get platform wallet from environment or use default
        address platformWallet = vm.envOr("HEDWIG_PLATFORM_WALLET_TESTNET", 
                                         vm.envOr("HEDWIG_PLATFORM_WALLET_MAINNET", 
                                                 address(0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d)));
        
        // Get private key from environment
        string memory privateKeyStr = vm.envString("PLATFORM_PRIVATE_KEY");
        // Add 0x prefix if not present
        if (bytes(privateKeyStr)[0] != 0x30 || bytes(privateKeyStr)[1] != 0x78) {
            privateKeyStr = string(abi.encodePacked("0x", privateKeyStr));
        }
        uint256 deployerPrivateKey = vm.parseUint(privateKeyStr);
        
        // Start broadcast with the private key
        vm.startBroadcast(deployerPrivateKey);
        
        HedwigPayment payment = new HedwigPayment(platformWallet);
        
        vm.stopBroadcast();
        
        console.log("HedwigPayment deployed at:", address(payment));
        console.log("Platform wallet:", platformWallet);
        console.log("Owner:", payment.OWNER());
        console.log("Platform fee:", payment.PLATFORM_FEE(), "basis points (1%)");
        
        // Output environment variable to add to .env.local
        console.log("\nAdd this to your .env.local:");
        console.log("HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET=", address(payment));
    }
}
