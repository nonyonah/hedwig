import { createClient } from '@supabase/supabase-js';
import fetch, { Response } from 'node-fetch';
import * as crypto from 'crypto';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);



/**
 * Handles incoming transaction requests and integrates with Coinbase Developer Program for wallet transactions
 */
export async function handleTransaction(
  userId: string,
  transactionData: any,
  options: {
    chain?: string;
    token?: string;
    amount?: string | number;
    recipient?: string;
    isExecute?: boolean;
  } = {}
) {
  try {
    console.log(`[TransactionHandler] Processing transaction for user ${userId}`);
    const chain = options.chain || transactionData.chain || 'base';
    console.log(`[TransactionHandler] Using chain: ${chain}`);

    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('chain', chain)
      .single();

    if (error || !wallet) {
      console.error(`[TransactionHandler] Error fetching wallet:`, error);
      throw new Error(`Wallet not found for chain ${chain}`);
    }

    const txData = {
      to: options.recipient || transactionData.to,
      value: options.amount?.toString() || transactionData.value,
      data: transactionData.data || '0x',
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('privy_user_id')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.privy_user_id) {
      throw new Error('Privy user ID not found for this user.');
    }

    const result = await sendPrivyTransaction({
      userId: user.privy_user_id,
      walletId: wallet.address, // For Privy, wallet.address is the wallet ID
      chain: chain,
      transaction: txData,
    });

    await recordTransaction(userId, wallet.address, result, chain, txData);
    return result;

  } catch (error) {
    console.error('[TransactionHandler] Transaction failed:', error);
    const errorMessage = getUserFriendlyErrorMessage(error);
    throw new Error(errorMessage);
  }
}

/**
 * Send a transaction via Privy API
 */
export async function sendPrivyTransaction({
  userId,
  walletId,
  chain,
  transaction,
}: {
  userId: string;
  walletId: string;
  chain: string;
  transaction: {
    to: string;
    value: string;
    chainId?: number | string;
    data?: string;
  };
}): Promise<{ hash: string; explorerUrl: string }> {
  // DEBUG: Log incoming parameters to diagnose 404 error
  console.log(`[sendPrivyTransaction] Received userId: ${userId}, walletId: ${walletId}`);
  try {
    const chainId = transaction.chainId || getChainId(chain);
    const url = `https://auth.privy.io/api/v1/wallets/${walletId}/rpc`;
    const weiValue = Math.floor(parseFloat(transaction.value) * 1e18);
    const valueHex = `0x${BigInt(weiValue).toString(16)}`;

    // DEBUG: Check if the private key is loaded
    console.log(`[sendPrivyTransaction] Privy Auth Private Key Loaded: ${!!process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY}`);

    // 1. Generate authorization signature for the request
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${process.env.PRIVY_APP_ID}:${timestamp}`;
    
    // Use crypto to create signature
    const crypto = require('crypto');
    const privateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(message);
    const signature = signer.sign(privateKey, 'base64');

    // Create Authorization header
    const authorization = `Bearer privy:${process.env.PRIVY_APP_ID}:${timestamp}:${signature}`;

    // 3. Construct and send the RPC request manually via fetch
    const rpcPayload = {
      method: 'eth_sendTransaction',
      params: {
        transaction: {
          to: transaction.to as `0x${string}`,
          value: valueHex as `0x${string}`,
          data: (transaction.data || '0x') as `0x${string}`,
          from: walletId as `0x${string}`,
        },
      },
      caip2: `eip155:${typeof chainId === 'string' ? chainId.split(':')[1] : chainId}`,
      walletId: walletId,
    };

    const response = await fetch(`https://auth.privy.io/api/v1/wallets/${walletId}/rpc`, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'X-Privy-App-Id': process.env.PRIVY_APP_ID!,
      },
      body: JSON.stringify(rpcPayload),
    });

    const rpcResponse = await response.json();

    if (!response.ok) {
      console.error('[sendPrivyTransaction] RPC Error:', rpcResponse);
      const errorMessage = rpcResponse.message || JSON.stringify(rpcResponse) || `HTTP error! status: ${response.status}`;
      throw new Error(`Failed to send transaction: ${errorMessage}`);
    }

    if (rpcResponse.data && rpcResponse.data.hash) {
      const transactionHash = rpcResponse.data.hash;
      const explorerUrl = getExplorerUrl(chain, transactionHash);
      return { hash: transactionHash, explorerUrl };
    } else {
      console.error('[sendPrivyTransaction] Invalid RPC Response:', rpcResponse);
      throw new Error('Failed to send transaction: Invalid response from Privy API.');
    }

  } catch (error) {
    console.error('[sendPrivyTransaction] Error:', error);
    const errorMessage = getUserFriendlyErrorMessage(error);
    throw new Error(errorMessage);
  }
}

/**
 * Get a user-friendly error message from a technical error
 */
function getUserFriendlyErrorMessage(error: any): string {
  console.error('[TransactionHandler] Detailed error:', error);
  
  const errorStr = error?.message || String(error);
  


  // Chain-specific error handling
  if (errorStr.includes('insufficient funds') || errorStr.includes('insufficient balance')) {
    return 'Not enough funds to complete this transaction. Please add more funds to your wallet.';
  }
  
  if (errorStr.includes('gas') && (errorStr.includes('required') || errorStr.includes('fee'))) {
    return 'Not enough funds to cover the gas fee. Please add more funds to your wallet.';
  }
  
  if (errorStr.includes('nonce')) {
    return 'There was an issue with the transaction sequence. Please try again.';
  }
  
  if (errorStr.includes('rejected') || errorStr.includes('denied')) {
    return 'Transaction was rejected. Please try again.';
  }
  
  if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
    return 'The transaction is taking too long. Please try again later.';
  }
  
  // Generic error handling
  try {
    // Try to parse error body if it's JSON
    const errorBody = JSON.parse(errorStr.substring(errorStr.indexOf('{'), errorStr.lastIndexOf('}') + 1));
    if (errorBody.error) {
      return `Transaction failed: ${errorBody.error}`;
    }
  } catch (e) {
    // If parsing fails, return generic message
  }
  
  return 'Unable to complete the transaction. Please try again later.';
}

/**
 * Record transaction in the database
 */
async function recordTransaction(
  userId: string, 
  walletAddress: string, 
  result: any, 
  chain: string,
  txData: any
) {
  try {
    const txHash = result.hash;
    const explorerUrl = getExplorerUrl(chain, txHash);
    
    await supabase.from('transactions').insert([{
      user_id: userId,
      wallet_address: walletAddress,
      tx_hash: txHash,
      explorer_url: explorerUrl,
      chain: chain,
      status: 'completed',
      metadata: {
        ...txData,
        timestamp: new Date().toISOString()
      }
    }]);
    
    console.log(`[TransactionHandler] Transaction recorded in database: ${txHash}`);
  } catch (error) {
    console.error('[TransactionHandler] Failed to record transaction:', error);
  }
}

/**
 * Get chain ID for a given chain name
 */
function getChainId(chain: string): number {
  switch (chain.toLowerCase()) {
    case 'ethereum':
    case 'mainnet':
      return 1;
    case 'base':
      return 8453;
    case 'base-sepolia':
    case 'base-testnet':
      return 84532;
    case 'sepolia':
      return 11155111;
    case 'optimism':
      return 10;
    case 'arbitrum':
      return 42161;
    default:
      return 1; // Default to Ethereum mainnet
  }
}

/**
 * Get explorer URL for a given chain and transaction hash
 */
function getExplorerUrl(chain: string, txHash: string): string {
  switch (chain.toLowerCase()) {
    case 'ethereum':
    case 'mainnet':
      return `https://etherscan.io/tx/${txHash}`;
    case 'base':
      return `https://basescan.org/tx/${txHash}`;
    case 'base-sepolia':
    case 'base-testnet':
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 'sepolia':
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 'optimism':
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    case 'arbitrum':
      return `https://arbiscan.io/tx/${txHash}`;
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
}