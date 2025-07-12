import { privy } from './privy';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { 
  signData, 
  importPrivateKeyFromBase64, 
  generateP256KeyPair,
  validateCryptoEnvironment 
} from './cryptoUtils';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables for server-side execution
loadServerEnvironment();

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
      .select('address, privy_wallet_id') // Select the correct Privy Wallet ID
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
      privyWalletId: wallet.privy_wallet_id, // Use the correct Privy Wallet ID
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
/**
 * Generate Basic Auth credentials for Privy API authentication
 * @returns The Basic Auth credentials
 */
function generatePrivyAuthCredentials(): string {
  // Create Basic Auth credentials using APP_ID and APP_SECRET
  const credentials = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64');
  return credentials;
}

/**
 * Check if session signers are properly configured for KeyQuorum
 * This helps diagnose "KeyQuorum user session key is expired" errors
 */
export function hasSessionSigners(user: any): boolean {
  return user?.wallet?.sessionSigners?.length > 0;
}

/**
 * Generate authorization signature for Privy KeyQuorum using cryptoUtils
 * @param method HTTP method (e.g., 'POST')
 * @param path API path (e.g., '/v1/wallets/{wallet_id}/rpc')
 * @param body Request body as a JSON object
 * @returns The authorization signature for the Privy API request
 */
async function generatePrivyAuthorizationSignature(method: string, path: string, body: any): Promise<string> {
  try {
    // Validate crypto environment
    const validation = validateCryptoEnvironment();
    if (!validation.isValid) {
      console.warn('[generatePrivyAuthorizationSignature] Missing environment variables:', validation.missingVars);
      return '';
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[generatePrivyAuthorizationSignature] Environment warnings:', validation.warnings);
    }
    
    const privyAuthorizationKey = process.env.PRIVY_AUTHORIZATION_KEY!;
    const privyKeyQuorumId = process.env.PRIVY_KEY_QUORUM_ID!;
    
    // Create the payload for signing
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      method: method.toUpperCase(),
      path: path,
      body: body ? JSON.stringify(body) : '',
      timestamp: timestamp,
      key_id: privyKeyQuorumId
    };
    
    // Canonicalize the payload per RFC 8785
    const canonicalizedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    
    // Import the private key and sign the payload
    const privateKey = await importPrivateKeyFromBase64(privyAuthorizationKey);
    const signature = await signData(canonicalizedPayload, privateKey);
    
    console.log('[generatePrivyAuthorizationSignature] Generated signature using cryptoUtils');
    return signature;
  } catch (error) {
    console.error('[generatePrivyAuthorizationSignature] Error generating authorization signature:', error);
    return '';
  }
}

/**
 * Send a transaction via Privy API with retry mechanism for expired session keys
 */
export async function sendPrivyTransaction({
  privyWalletId,
  chain,
  transaction,
}: {
  privyWalletId: string;
  chain: string;
  transaction: {
    to: string;
    value: string;
    data?: string;
  };
}): Promise<{ hash: string; explorerUrl: string }> {
  // Maximum number of retry attempts
  const MAX_RETRIES = 3;
  // Initial delay in milliseconds before retrying (will be doubled each retry - exponential backoff)
  const INITIAL_RETRY_DELAY = 1000;
  
  let retryCount = 0;
  let lastError: any = null;
  
  while (retryCount <= MAX_RETRIES) {
    try {
      // Generate fresh Basic Auth credentials for each attempt
      const credentials = generatePrivyAuthCredentials();
      const path = `/v1/wallets/${privyWalletId}/rpc`;
      const url = `https://api.privy.io${path}`;
      
      console.log(`[sendPrivyTransaction] Attempt ${retryCount + 1}/${MAX_RETRIES + 1}`);
      
      // Prepare request body
      const requestBody = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendTransaction',
        params: [transaction],
      };
      
      // Generate authorization signature if KeyQuorum is configured
      const authSignature = await generatePrivyAuthorizationSignature('POST', path, requestBody);
      
      // Prepare headers
      const headers: Record<string, string> = {
        'Authorization': `Basic ${credentials}`,
        'privy-app-id': process.env.PRIVY_APP_ID!,
        'Content-Type': 'application/json',
      };
      
      // Add authorization signature header if available
      if (authSignature) {
        headers['privy-authorization-signature'] = authSignature;
        console.log('[sendPrivyTransaction] Using KeyQuorum authorization signature');
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[sendPrivyTransaction] Privy API error: ${response.status}`, errorBody);
        
        // Check if this is a KeyQuorum session key expired error
        if (response.status === 401 && errorBody.includes('KeyQuorum user session key is expired')) {
          if (retryCount < MAX_RETRIES) {
            // Calculate delay with exponential backoff
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
            console.log(`[sendPrivyTransaction] KeyQuorum session key expired. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retryCount++;
            continue;
          }
        }
        
        throw new Error(`Failed to send transaction via Privy: ${errorBody}`);
      }

      const result = await response.json() as { result: string };
      const txHash = result.result;
      if (!txHash) {
          const errorBody = JSON.stringify(result);
          console.error(`[sendPrivyTransaction] Privy API did not return a transaction hash. Full response:`, errorBody);
          throw new Error(`Failed to send transaction via Privy: ${errorBody}`);
      }
      const explorerUrl = getExplorerUrl(chain, txHash);

      return { hash: txHash, explorerUrl };
    } catch (error) {
      lastError = error;
      
      // If this is not a retry-able error or we've exhausted retries, throw it
      if (retryCount >= MAX_RETRIES || 
          !(error instanceof Error && 
            error.message.includes('KeyQuorum user session key is expired'))) {
        console.error('[sendPrivyTransaction] Error:', error);
        const errorMessage = getUserFriendlyErrorMessage(error);
        throw new Error(errorMessage);
      }
      
      // Calculate delay with exponential backoff
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`[sendPrivyTransaction] Error: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      retryCount++;
    }
  }
  
  // If we've exhausted all retries, throw the last error with a user-friendly message
  console.error('[sendPrivyTransaction] All retry attempts failed:', lastError);
  const errorMessage = getUserFriendlyErrorMessage(lastError);
  throw new Error(errorMessage);
  }


/**
 * Get a user-friendly error message from a technical error
 */
function getUserFriendlyErrorMessage(error: any): string {
  console.error('[TransactionHandler] Detailed error:', error);
  
  const errorStr = error?.message || String(error);
  
  // Privy-specific error handling
  if (errorStr.includes('KeyQuorum user session key is expired')) {
    return 'Your wallet session has expired. Please refresh the page and try again. If the problem persists, you may need to reconnect your wallet.'; 
  }
  
  if (errorStr.includes('401') && errorStr.includes('Privy')) {
    return 'Authentication failed. Please log out and log back in.'; 
  }
  
  if (errorStr.includes('429') && errorStr.includes('Privy')) {
    return 'Too many requests. Please wait a moment and try again.'; 
  }
  
  if (errorStr.includes('500') && errorStr.includes('Privy')) {
    return 'The wallet service is experiencing issues. Please try again later.'; 
  }

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

/**
 * Generate a P-256 key pair for Privy KeyQuorum authorization using cryptoUtils
 * This function is intended for testing or production use
 * The public key should be registered with Privy for your KeyQuorum account
 * The private key should be set as PRIVY_AUTHORIZATION_KEY in your environment variables
 * 
 * @returns Promise containing object with base64-encoded private and public keys
 */
export async function generatePrivyAuthorizationKeyPair() {
  try {
    const keyPair = await generateP256KeyPair();

    console.log('\n=== Privy KeyQuorum P-256 Key Pair ===');
    console.log('PRIVATE KEY (base64, for PRIVY_AUTHORIZATION_KEY):');
    console.log(keyPair.privateKeyBase64);
    console.log('\nPUBLIC KEY (base64, for Privy registration):');
    console.log(keyPair.publicKeyBase64);
    console.log('\nPRIVATE KEY (PEM format):');
    console.log(keyPair.privateKeyPem);
    console.log('\nPUBLIC KEY (PEM format):');
    console.log(keyPair.publicKeyPem);
    console.log('\nInstructions:');
    console.log('1. Set the PRIVY_AUTHORIZATION_KEY environment variable to the private key (base64)');
    console.log('2. Register the public key with Privy for your KeyQuorum account');
    console.log('3. Set the PRIVY_KEY_QUORUM_ID environment variable to the ID provided by Privy');

    return {
      privateKey: keyPair.privateKeyBase64,
      publicKey: keyPair.publicKeyBase64,
      privateKeyPem: keyPair.privateKeyPem,
      publicKeyPem: keyPair.publicKeyPem
    };
  } catch (error) {
    console.error('Error generating P-256 key pair:', error);
    throw new Error('Failed to generate P-256 key pair');
  }
}