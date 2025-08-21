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
        address platformWallet = vm.envOr("PLATFORM_WALLET", address(0x1234567890123456789012345678901234567890));
        
        vm.startBroadcast();
        
        HedwigPayment payment = new HedwigPayment(platformWallet);
        
        vm.stopBroadcast();
        
        console.log("HedwigPayment deployed at:", address(payment));
        console.log("Platform wallet:", platformWallet);
        console.log("Owner:", payment.OWNER());
        console.log("Platform fee:", payment.PLATFORM_FEE(), "basis points (0.5%)");
    }
}
