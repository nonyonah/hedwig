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
        // Deploy the contract (USDC-only, constructor takes only platformWallet)
        HedwigPayment hedwigPayment = new HedwigPayment(platformWallet);
        deployedContract = address(hedwigPayment);
        emit ContractDeployed(deployedContract, platformWallet);
        return deployedContract;
    }
    
    /**
     * @dev Deploy HedwigPayment contract (USDC-only, ignores customTokens)
     * @param platformWallet Address to receive platform fees
     * @return deployedContract Address of the deployed contract
     */
    function deployHedwigPaymentCustom(
        address platformWallet,
        address[] memory /* customTokens */
    ) external returns (address deployedContract) {
        // Deploy the contract (USDC-only, ignores customTokens)
        HedwigPayment hedwigPayment = new HedwigPayment(platformWallet);
        deployedContract = address(hedwigPayment);
        emit ContractDeployed(deployedContract, platformWallet);
        return deployedContract;
    }
}