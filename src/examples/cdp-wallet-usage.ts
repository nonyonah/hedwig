// src/examples/cdp-wallet-usage.ts
import {
  createWallet,
  getWallet,
  getBalances,
  transferNativeToken,
  transferToken,
  getTransaction,
  SUPPORTED_NETWORKS,
} from '../lib/cdp';

/**
 * Example 1: Create a new wallet
 */
async function exampleCreateWallet() {
  try {
    // Replace with actual user ID
    const userId = 'user-123';
    
    // Create wallet on Base Sepolia testnet
    const wallet = await createWallet(userId, 'base-sepolia');
    
    console.log('Created wallet:', wallet);
    return wallet;
  } catch (error) {
    console.error('Failed to create wallet:', error);
    throw error;
  }
}

/**
 * Example 2: Get wallet balances
 */
async function exampleGetBalances(address: string) {
  try {
    // Get balances on Base Sepolia testnet
    const balances = await getBalances(address, 'base-sepolia');
    
    console.log('Wallet balances:', balances);
    return balances;
  } catch (error) {
    console.error('Failed to get balances:', error);
    throw error;
  }
}

/**
 * Example 3: Transfer ETH
 */
async function exampleTransferETH(fromAddress: string, toAddress: string) {
  try {
    // Transfer 0.01 ETH on Base Sepolia testnet
    const result = await transferNativeToken(
      fromAddress,
      toAddress,
      '0.01',
      'base-sepolia'
    );
    
    console.log('Transfer result:', result);
    return result;
  } catch (error) {
    console.error('Failed to transfer ETH:', error);
    throw error;
  }
}

/**
 * Example 4: Transfer ERC-20 token
 */
async function exampleTransferERC20(
  fromAddress: string,
  toAddress: string,
  tokenAddress: string
) {
  try {
    // Transfer 10 tokens on Base Sepolia testnet
    // Assuming token has 18 decimals (like most ERC-20 tokens)
    const result = await transferToken(
      fromAddress,
      toAddress,
      tokenAddress,
      '10',
      18,
      'base-sepolia'
    );
    
    console.log('Token transfer result:', result);
    return result;
  } catch (error) {
    console.error('Failed to transfer token:', error);
    throw error;
  }
}

/**
 * Example 5: Get transaction details
 */
async function exampleGetTransaction(txHash: string) {
  try {
    // Get transaction on Base Sepolia testnet
    const transaction = await getTransaction(txHash, 'base-sepolia');
    
    console.log('Transaction details:', transaction);
    return transaction;
  } catch (error) {
    console.error('Failed to get transaction:', error);
    throw error;
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    // Example 1: Create wallet
    const wallet = await exampleCreateWallet();
    
    // Example 2: Get balances
    await exampleGetBalances(wallet.address);
    
    // For the remaining examples, we need a funded wallet and a recipient address
    console.log('To complete the remaining examples:');
    console.log('1. Fund the wallet with testnet tokens');
    console.log('2. Set a recipient address');
    console.log('3. For ERC-20 transfers, set a token contract address');
    
    // Uncomment and configure these examples when ready
    /*
    // Example 3: Transfer ETH
    const recipientAddress = '0x...'; // Set recipient address
    const transferResult = await exampleTransferETH(wallet.address, recipientAddress);
    
    // Example 4: Transfer ERC-20
    const tokenAddress = '0x...'; // Set token contract address
    await exampleTransferERC20(wallet.address, recipientAddress, tokenAddress);
    
    // Example 5: Get transaction
    await exampleGetTransaction(transferResult.hash);
    */
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Uncomment to run examples
// runExamples();

export {
  exampleCreateWallet,
  exampleGetBalances,
  exampleTransferETH,
  exampleTransferERC20,
  exampleGetTransaction,
  runExamples,
};