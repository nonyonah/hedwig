import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { getPrivyAuthHeader } from './privy';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRIVY_API_URL = 'https://api.privy.io/v1/wallets';

/**
 * Handles incoming transaction requests and integrates with Privy for wallet transactions
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
    
    // Default to base chain if not specified
    const chain = options.chain || transactionData.chain || 'base';
    
    console.log(`[TransactionHandler] Using chain: ${chain}`);
    
    // Get wallet for the specified chain
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
    
    if (!wallet.privy_wallet_id) {
      throw new Error('Privy wallet ID is required for transaction signing.');
    }
    
    console.log(`[TransactionHandler] Found wallet:`, wallet);
    
    // Only execute transaction if isExecute is true
    if (!options.isExecute) {
      return { text: 'Transaction not confirmed. Please confirm to proceed.' };
    }
    
    // Prepare transaction data for Privy
    const to = options.recipient || transactionData.recipient || transactionData.to;
    const amount = options.amount || transactionData.amount || '0';
    
    // Convert amount to wei (for ETH transactions)
    let value;
    if (typeof amount === 'number' || (typeof amount === 'string' && !amount.startsWith('0x'))) {
      const amountValue = typeof amount === 'number' ? amount : parseFloat(amount);
      const amountInWei = Math.floor(amountValue * 1e18);
      value = '0x' + amountInWei.toString(16);
    } else {
      value = amount; // Already in hex format
    }
    
    // Prepare transaction object
    const transaction = {
      to: to,
      value: value,
      chainId: getChainId(chain),
      data: transactionData.data || '0x',
    };
    
    // Send transaction using Privy
    const result = await sendPrivyTransaction({
      walletId: wallet.privy_wallet_id,
      chain: chain,
      transaction: transaction,
    });
    
    // Record transaction in database
    await recordTransaction(userId, wallet.address, result, chain, transaction);
    
    return result;
  } catch (error) {
    console.error('[TransactionHandler] Transaction failed:', error);
    
    // Provide user-friendly error messages while logging detailed errors for developers
    const errorMessage = getUserFriendlyErrorMessage(error);
    
    throw new Error(errorMessage);
  }
}

/**
 * Get a user-friendly error message from a technical error
 */
function getUserFriendlyErrorMessage(error: any): string {
  // Log the full error for developers
  console.error('[TransactionHandler] Detailed error:', error);
  
  const errorStr = error?.message || String(error);
  
  // Check for common error patterns and provide user-friendly messages
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
  
  if (errorStr.includes('rate limit') || errorStr.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  
  // For unknown errors, provide a generic message
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
    // Don't throw here, as the transaction itself was successful
  }
}

/**
 * Send a transaction via Privy API
 */
async function sendPrivyTransaction({
  walletId,
  chain,
  transaction,
}: {
  walletId: string;
  chain: string;
  transaction: {
    to: string;
    value: string;
    chainId?: number | string;
    data?: string;
  };
}): Promise<{ hash: string; explorerUrl: string }> {
  console.log(`[sendPrivyTransaction] Sending transaction to ${transaction.to} from wallet ${walletId} on ${chain}`);
  
  try {
    // Convert chain to CAIP2 format for Privy
    const caip2 = `eip155:${transaction.chainId || getChainId(chain)}`;
    
    // Prepare request body
    const requestBody = {
      method: 'eth_sendTransaction',
      caip2: caip2,
      params: {
        transaction: {
          to: transaction.to,
          value: transaction.value,
          data: transaction.data || '0x'
        }
      }
    };
    
    console.log(`[sendPrivyTransaction] Request body:`, JSON.stringify(requestBody, null, 2));
    
    // Send request to Privy API
    const response = await fetch(
      `${PRIVY_API_URL}/${walletId}/rpc`,
      {
        method: 'POST',
        headers: {
          'Authorization': getPrivyAuthHeader(),
          'Content-Type': 'application/json',
          'privy-app-id': process.env.PRIVY_APP_ID!,
        },
        body: JSON.stringify(requestBody),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sendPrivyTransaction] Error ${response.status}: ${errorText}`);
      throw new Error(`Privy API error: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`[sendPrivyTransaction] Transaction sent:`, data);
    
    const hash = data.data.hash;
    const explorerUrl = getExplorerUrl(chain, hash);
    
    return {
      hash,
      explorerUrl,
    };
  } catch (error) {
    console.error('[sendPrivyTransaction] Error:', error);
    
    // Log detailed error for developers but throw user-friendly message
    const errorMessage = getUserFriendlyErrorMessage(error);
    throw new Error(errorMessage);
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