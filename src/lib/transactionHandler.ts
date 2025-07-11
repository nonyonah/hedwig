import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { privyClient } from './privy';

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
    const { hash, explorerUrl } = await sendPrivyTransaction({
      userId: wallet.privy_user_id, 
      walletId: wallet.address, 
      chain,
      transaction,
    });

    // Record transaction in database
    await recordTransaction(userId, wallet.address, { hash, explorerUrl }, chain, transaction);

    return { hash, explorerUrl };
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
  try {
    console.log(`[sendPrivyTransaction] Sending transaction for wallet ${walletId} on chain ${chain}`);
    const chainId = transaction.chainId || getChainId(chain);

    const url = `https://auth.privy.io/api/v1/wallets/${walletId}/rpc`;
    const valueHex = `0x${BigInt(transaction.value).toString(16)}`;

    const requestBody = {
      request: {
        method: 'eth_sendTransaction',
        params: [
          {
            to: transaction.to,
            value: valueHex,
            data: transaction.data || '0x',
            from: walletId,
          },
        ],
      },
      chainId: `eip155:${typeof chainId === 'string' ? chainId.split(':')[1] : chainId}`,
    };

    // Manually construct the JWT for user-authorized API calls as per Privy docs.
    // This is necessary because the SDK's createAccessToken method is not available in the current environment.
    const now = Math.floor(Date.now() / 1000);
    // Format and validate the private key for ES256 JWT signing
    let formattedPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!;
    
    // If the key starts with 'wallet-auth:', remove the prefix
    if (formattedPrivateKey.startsWith('wallet-auth:')) {
      formattedPrivateKey = formattedPrivateKey.replace('wallet-auth:', '');
    }

    // Ensure proper line endings first
    formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');

    // Check if the key is already in PEM format
    if (!formattedPrivateKey.includes('BEGIN EC PRIVATE KEY')) {
      try {
        // Try to decode if the key is base64 encoded
        const decoded = Buffer.from(formattedPrivateKey, 'base64').toString();
        if (decoded.includes('BEGIN EC PRIVATE KEY')) {
          formattedPrivateKey = decoded;
        } else {
          // If not in PEM format, wrap it with EC key headers
          formattedPrivateKey = `-----BEGIN EC PRIVATE KEY-----\n${formattedPrivateKey}\n-----END EC PRIVATE KEY-----`;
        }
      } catch (e) {
        // If decoding fails, wrap with EC key headers
        formattedPrivateKey = `-----BEGIN EC PRIVATE KEY-----\n${formattedPrivateKey}\n-----END EC PRIVATE KEY-----`;
      }
    }

    // Line endings are already handled above

    const token = jwt.sign(
      {
        iat: now,
        exp: now + 300, // 5-minute expiration
        iss: 'privy.io', // Must be 'privy.io'
        aud: process.env.PRIVY_APP_ID!, // Must be your Privy App ID
        sub: userId, // The user's Privy DID
        sid: `session_${now}` // Required session ID
      },
      formattedPrivateKey,
      { 
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          typ: 'JWT'
        }
      }
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'privy-app-id': process.env.PRIVY_APP_ID!,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Privy API Error: ${response.status} ${errorBody}`);
    }

    const { result: hash } = await response.json();
    const explorerUrl = getExplorerUrl(chain, hash);
    return { hash, explorerUrl };

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