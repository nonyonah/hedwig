// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/HedwigProjectContract.sol";

contract HedwigProjectContractDeploy is Script {
    function run() external {
        address platformWallet = 0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d;
        uint256 platformFeeRate = 250; // 2.5%
        
        vm.startBroadcast();
        
        HedwigProjectContract projectContract = new HedwigProjectContract(
            platformWallet,
            platformFeeRate
        );
        
        vm.stopBroadcast();
        
        console.log("HedwigProjectContract deployed to:", address(projectContract));
    }
}