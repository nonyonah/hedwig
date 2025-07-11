import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CDP_API_BASE_URL = 'https://api.coinbase.com/api/v2';

/**
 * Sign a typed data structure using EIP-712
 */
export async function signTypedData({
  walletAddress,
  typedData,
}: {
  walletAddress: string;
  typedData: {
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    domain: Record<string, any>;
    message: Record<string, any>;
  };
}): Promise<string> {
  try {
    const response = await fetch(`${CDP_API_BASE_URL}/evm-accounts/${walletAddress}/sign-typed-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CDP_API_KEY}`,
      },
      body: JSON.stringify({
        typedData,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`CDP API Error (Sign Typed Data): ${response.status} ${errorBody}`);
    }

    const { signature } = await response.json();
    return signature;
  } catch (error) {
    console.error('[signTypedData] Error:', error);
    throw error;
  }
}

/**
 * Sign a message using EIP-191 personal_sign
 */
export async function signMessage({
  walletAddress,
  message,
}: {
  walletAddress: string;
  message: string;
}): Promise<string> {
  try {
    const response = await fetch(`${CDP_API_BASE_URL}/evm-accounts/${walletAddress}/sign-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CDP_API_KEY}`,
      },
      body: JSON.stringify({
        message,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`CDP API Error (Sign Message): ${response.status} ${errorBody}`);
    }

    const { signature } = await response.json();
    return signature;
  } catch (error) {
    console.error('[signMessage] Error:', error);
    throw error;
  }
}

/**
 * Sign a hash using raw ECDSA
 */
export async function signHash({
  walletAddress,
  hash,
}: {
  walletAddress: string;
  hash: string;
}): Promise<string> {
  try {
    const response = await fetch(`${CDP_API_BASE_URL}/evm-accounts/${walletAddress}/sign-hash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CDP_API_KEY}`,
      },
      body: JSON.stringify({
        hash,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`CDP API Error (Sign Hash): ${response.status} ${errorBody}`);
    }

    const { signature } = await response.json();
    return signature;
  } catch (error) {
    console.error('[signHash] Error:', error);
    throw error;
  }
}

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
    
    if (!wallet.address) {
      throw new Error('Wallet address is required for transaction signing.');
    }
    
    console.log(`[TransactionHandler] Found wallet:`, wallet);
    
    // Only execute transaction if isExecute is true
    if (!options.isExecute) {
      return { text: 'Transaction not confirmed. Please confirm to proceed.' };
    }
    
    // Prepare transaction data
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
    
    // Send transaction using CDP
    const { hash, explorerUrl } = await sendCDPTransaction({
      walletAddress: wallet.address,
      chain,
      transaction,
    });

    // Record transaction in database
    await recordTransaction(userId, wallet.address, { hash, explorerUrl }, chain, transaction);

    return { hash, explorerUrl };
  } catch (error) {
    console.error('[TransactionHandler] Transaction failed:', error);
    const errorMessage = getUserFriendlyErrorMessage(error);
    throw new Error(errorMessage);
  }
}

/**
 * Send a transaction via CDP API
 */
export async function sendCDPTransaction({
  walletAddress,
  chain,
  transaction,
}: {
  walletAddress: string;
  chain: string;
  transaction: {
    to: string;
    value: string;
    chainId?: number | string;
    data?: string;
  };
}): Promise<{ hash: string; explorerUrl: string }> {
  try {
    console.log(`[sendCDPTransaction] Sending transaction for wallet ${walletAddress} on chain ${chain}`);
    const chainId = transaction.chainId || getChainId(chain);

    // First, sign the transaction
    const signResponse = await fetch(`${CDP_API_BASE_URL}/evm-accounts/${walletAddress}/sign-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CDP_API_KEY}`,
      },
      body: JSON.stringify({
        transaction: {
          to: transaction.to,
          value: transaction.value,
          data: transaction.data || '0x',
          chainId: chainId,
        },
      }),
    });

    if (!signResponse.ok) {
      const errorBody = await signResponse.text();
      throw new Error(`CDP API Error (Sign): ${signResponse.status} ${errorBody}`);
    }

    const { signedTransaction } = await signResponse.json();

    // Then, send the signed transaction
    const sendResponse = await fetch(`${CDP_API_BASE_URL}/evm-accounts/${walletAddress}/send-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CDP_API_KEY}`,
      },
      body: JSON.stringify({
        signedTransaction,
      }),
    });

    if (!sendResponse.ok) {
      const errorBody = await sendResponse.text();
      throw new Error(`CDP API Error (Send): ${sendResponse.status} ${errorBody}`);
    }

    const { hash } = await sendResponse.json();
    const explorerUrl = getExplorerUrl(chain, hash);
    return { hash, explorerUrl };

  } catch (error) {
    console.error('[sendCDPTransaction] Error:', error);
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