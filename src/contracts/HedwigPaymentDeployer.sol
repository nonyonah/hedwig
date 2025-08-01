// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./HedwigPayment.sol";

/**
 * @title HedwigPaymentDeployer
 * @dev Deployment script for HedwigPayment contract
 */
contract HedwigPaymentDeployer {
    event ContractDeployed(address indexed contractAddress, address indexed platformWallet);
    
    /**
     * @dev Deploy HedwigPayment contract with Base chain stablecoins
     * @param platformWallet Address to receive platform fees
     * @return deployedContract Address of the deployed contract
     */
    function deployHedwigPayment(address platformWallet) external returns (address deployedContract) {
        // Base chain stablecoin addresses
        address[] memory initialTokens = new address[](2);
        
        // USDC on Base
        initialTokens[0] = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        
        // USDbC (USD Base Coin) on Base
        initialTokens[1] = 0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA;
        
        // Deploy the contract
        HedwigPayment hedwigPayment = new HedwigPayment(platformWallet, initialTokens);
        
        deployedContract = address(hedwigPayment);
        emit ContractDeployed(deployedContract, platformWallet);
        
        return deployedContract;
    }
    
    /**
     * @dev Deploy HedwigPayment contract with custom tokens
     * @param platformWallet Address to receive platform fees
     * @param customTokens Array of custom token addresses to whitelist
     * @return deployedContract Address of the deployed contract
     */
    function deployHedwigPaymentCustom(
        address platformWallet,
        address[] memory customTokens
    ) external returns (address deployedContract) {
        HedwigPayment hedwigPayment = new HedwigPayment(platformWallet, customTokens);
        
        deployedContract = address(hedwigPayment);
        emit ContractDeployed(deployedContract, platformWallet);
        
        return deployedContract;
    }
}