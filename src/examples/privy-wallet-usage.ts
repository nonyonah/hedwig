/**
 * Example usage of the new Privy Wallet API
 * 
 * This file demonstrates how to use the new privyWalletApi for various wallet operations.
 * These examples can be used in your API endpoints, server-side functions, or other parts of your application.
 */

import { privyWalletApi, EthereumTransaction, SUPPORTED_CHAINS } from '../lib/privyWalletApi';

/**
 * Example 1: Send a simple ETH transfer transaction
 */
export async function sendEthTransfer(userId: string, recipientAddress: string, amountInEth: string) {
  try {
    // Get user's wallet
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // Prepare transaction
    const transaction: EthereumTransaction = {
      to: recipientAddress,
      value: (parseFloat(amountInEth) * 1e18).toString(), // Convert ETH to wei
    };

    // Send a transaction
  const txResult = await privyWalletApi.sendTransaction(
    wallet.privy_wallet_id,
      transaction,
      'base-sepolia'
    );

    console.log('Transaction sent:', txResult.hash);
    console.log('Explorer URL:', privyWalletApi.getExplorerUrl('base-sepolia', txResult.hash));
    
    return txResult;
  } catch (error) {
    console.error('Failed to send ETH transfer:', error);
    throw error;
  }
}

/**
 * Example 2: Send a token transfer (ERC-20)
 */
export async function sendTokenTransfer(
  userId: string, 
  tokenAddress: string, 
  recipientAddress: string, 
  amount: string,
  decimals: number = 18
) {
  try {
    // Get user's wallet
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // ERC-20 transfer function signature: transfer(address,uint256)
    const transferData = `0xa9059cbb${recipientAddress.slice(2).padStart(64, '0')}${BigInt(parseFloat(amount) * 10 ** decimals).toString(16).padStart(64, '0')}`;
    
    // Prepare transaction
    const transaction: EthereumTransaction = {
      to: tokenAddress,
      value: '0', // No ETH value for token transfers
      data: transferData,
      gasLimit: '100000', // Typical gas limit for ERC-20 transfers
    };

    // Send transaction
    const result = await privyWalletApi.sendTransaction(
      wallet.privy_wallet_id,
      transaction,
      'base-sepolia'
    );

    console.log('Token transfer sent:', result.hash);
    return result;
  } catch (error) {
    console.error('Failed to send token transfer:', error);
    throw error;
  }
}

/**
 * Example 3: Sign a message
 */
export async function signUserMessage(userId: string, message: string) {
  try {
    // Get user's wallet
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // Sign message
    const result = await privyWalletApi.signMessage(
      wallet.privy_wallet_id,
      message
    );

    console.log('Message signed:', result.signature);
    return result;
  } catch (error) {
    console.error('Failed to sign message:', error);
    throw error;
  }
}

/**
 * Example 4: Sign typed data (EIP-712)
 */
export async function signTypedDataExample(userId: string) {
  try {
    // Get user's wallet
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // Example EIP-712 typed data
    const typedData = {
      domain: {
        name: 'Hedwig Wallet',
        version: '1',
        chainId: 84532, // Base Sepolia
        verifyingContract: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b'
      },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Message: [
          { name: 'content', type: 'string' },
          { name: 'timestamp', type: 'uint256' }
        ]
      },
      message: {
        content: 'Hello from Hedwig!',
        timestamp: Math.floor(Date.now() / 1000)
      }
    };
    
    // Sign typed data
    const result = await privyWalletApi.signTypedData(
      wallet.privy_wallet_id,
      typedData
    );

    console.log('Typed data signed:', result.signature);
    return result;
  } catch (error) {
    console.error('Failed to sign typed data:', error);
    throw error;
  }
}

/**
 * Example 5: Sign a transaction without sending it
 */
export async function signTransactionOnly(userId: string, recipientAddress: string, amountInEth: string) {
  try {
    // Get user's wallet
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // Prepare transaction
    const transaction: EthereumTransaction = {
      to: recipientAddress,
      value: (parseFloat(amountInEth) * 1e18).toString(),
      gasLimit: '21000',
    };

    // Sign transaction (without sending)
    const result = await privyWalletApi.signTransaction(
      wallet.privy_wallet_id,
      transaction,
      'base-sepolia'
    );

    console.log('Transaction signed:', result.signedTransaction);
    return result;
  } catch (error) {
    console.error('Failed to sign transaction:', error);
    throw error;
  }
}

/**
 * Example 6: Get wallet information
 */
export async function getWalletInfo(userId: string) {
  try {
    // Get user's wallet from database
    const dbWallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // Get wallet info from Privy
    const privyWallet = await privyWalletApi.getWallet(dbWallet.privy_wallet_id);

    console.log('Wallet info:', {
      address: privyWallet.address,
      chainType: privyWallet.chainType,
      createdAt: privyWallet.createdAt
    });
    
    return privyWallet;
  } catch (error) {
    console.error('Failed to get wallet info:', error);
    throw error;
  }
}

/**
 * Example 7: Multi-chain operations
 */
export async function sendTransactionOnDifferentChains(userId: string, recipientAddress: string, amountInEth: string) {
  const chains = ['base-sepolia', 'sepolia', 'base'] as const;
  const results = [];

  for (const chain of chains) {
    try {
      console.log(`Sending transaction on ${chain}...`);
      
      // Get user's wallet for this chain
      const wallet = await privyWalletApi.getUserWallet(userId, chain);
      
      // Prepare transaction
      const transaction: EthereumTransaction = {
        to: recipientAddress,
        value: (parseFloat(amountInEth) * 1e18).toString(),
      };

      // Send transaction
      const result = await privyWalletApi.sendTransaction(
        wallet.privy_wallet_id,
        transaction,
        chain
      );

      results.push({
        chain,
        hash: result.hash,
        explorerUrl: privyWalletApi.getExplorerUrl(chain, result.hash)
      });
      
    } catch (error) {
      console.error(`Failed to send transaction on ${chain}:`, error);
      results.push({
        chain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

/**
 * Example 8: Get supported chains
 */
export function getSupportedChains() {
  console.log('Supported chains:', Object.keys(SUPPORTED_CHAINS));
  
  // Get specific chain config
  const baseSepoliaConfig = privyWalletApi.getChainConfig('base-sepolia');
  console.log('Base Sepolia config:', baseSepoliaConfig);
  
  return SUPPORTED_CHAINS;
}

/**
 * Example 9: Error handling best practices
 */
export async function robustTransactionSend(userId: string, recipientAddress: string, amountInEth: string) {
  try {
    // Validate inputs
    if (!userId || !recipientAddress || !amountInEth) {
      throw new Error('Missing required parameters');
    }

    if (parseFloat(amountInEth) <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      throw new Error('Invalid recipient address format');
    }

    // Get user's wallet
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    if (!wallet.privy_wallet_id) {
      throw new Error('User wallet does not have a Privy wallet ID');
    }

    // Prepare transaction with proper gas settings
    const transaction: EthereumTransaction = {
      to: recipientAddress,
      value: (parseFloat(amountInEth) * 1e18).toString(),
      gasLimit: '21000', // Standard ETH transfer gas limit
    };

    console.log('Sending transaction:', {
      from: wallet.address,
      to: recipientAddress,
      value: `${amountInEth} ETH`,
      chain: 'base-sepolia'
    });

    // Send transaction
    const result = await privyWalletApi.sendTransaction(
      wallet.privy_wallet_id,
      transaction,
      'base-sepolia'
    );

    const explorerUrl = privyWalletApi.getExplorerUrl('base-sepolia', result.hash);
    
    console.log('Transaction successful:', {
      hash: result.hash,
      explorerUrl
    });

    return {
      success: true,
      hash: result.hash,
      explorerUrl,
      message: `Successfully sent ${amountInEth} ETH to ${recipientAddress}`
    };

  } catch (error) {
    console.error('Transaction failed:', error);
    
    // Return user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return {
      success: false,
      error: errorMessage,
      message: `Failed to send transaction: ${errorMessage}`
    };
  }
}

/**
 * Example 10: Batch operations
 */
export async function batchWalletOperations(userId: string) {
  try {
    const wallet = await privyWalletApi.getUserWallet(userId, 'base-sepolia');
    
    // Perform multiple operations
    const [walletInfo, messageSignature] = await Promise.all([
      privyWalletApi.getWallet(wallet.privy_wallet_id),
      privyWalletApi.signMessage(wallet.privy_wallet_id, 'Batch operation test')
    ]);

    return {
      walletInfo,
      messageSignature,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Batch operations failed:', error);
    throw error;
  }
}