import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CDP_API_BASE_URL = 'https://api.coinbase.com/v2';

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
  try {
    const chainId = transaction.chainId || getChainId(chain);
    const url = `https://auth.privy.io/api/v1/wallets/${walletId}/rpc`;
    const weiValue = Math.floor(parseFloat(transaction.value) * 1e18);
    const valueHex = `0x${BigInt(weiValue).toString(16)}`;

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

    const now = Math.floor(Date.now() / 1000);
    const formattedPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!.replace(/\\n/g, '\n');

    const token = jwt.sign(
      {
        iat: now,
        exp: now + 300, // 5-minute expiration
        iss: process.env.PRIVY_APP_ID!,
        aud: 'privy.io',
        sub: userId, // The user's Privy DID is critical for authorization
      },
      formattedPrivateKey,
      { algorithm: 'ES256' }
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

    const { result: transactionHash } = await response.json();
    const explorerUrl = getExplorerUrl(chain, transactionHash);
    return { hash: transactionHash, explorerUrl };

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