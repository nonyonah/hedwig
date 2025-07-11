import { getPrivyUserAuthToken } from './privy';

import { createClient } from '@supabase/supabase-js';
import fetch, { Response } from 'node-fetch';

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
    console.log(`[TransactionHandler] Executing transaction for user ${userId} with params:`, transactionData);
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
      supabaseUserId: userId, // Pass the original Supabase UUID
      privyUserId: user.privy_user_id, // Pass the looked-up Privy ID
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
  supabaseUserId,
  privyUserId,
  walletId,
  chain,
  transaction,
}: {
  supabaseUserId: string;
  privyUserId: string;
  walletId: string;
  chain: string;
  transaction: {
    to: string;
    value: string;
    data?: string;
  };
}): Promise<{ hash: string; explorerUrl: string }> {
  try {
    // getPrivyUserAuthToken expects the Supabase UUID to perform its own lookup.
    const authToken = await getPrivyUserAuthToken(supabaseUserId);
    const url = `https://api.privy.io/v1/wallets/${walletId}/eth_send_transaction`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'privy-app-id': process.env.PRIVY_APP_ID!,
      },
      body: JSON.stringify({
        transaction, // EIP-1559 or legacy transaction
        chain_id: `eip155:${getChainId(chain)}`,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[sendPrivyTransaction] Privy API error: ${response.status}`, errorBody);
      throw new Error(`Failed to send transaction via Privy.`);
    }

    const result = await response.json();
    const txHash = result.transaction_hash;
    const explorerUrl = getExplorerUrl(chain, txHash);

    return { hash: txHash, explorerUrl };

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