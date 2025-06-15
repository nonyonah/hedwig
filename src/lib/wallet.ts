import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';

// Ensure environment variables are loaded
loadServerEnvironment();

// Always create a new wallet provider for each request to ensure a unique X-Idempotency-Key
// Removed walletProviders cache as per Coinbase CDP API idempotency requirements.

/**
 * Generates a unique idempotency key that meets CDP requirements (minimum 36 characters)
 * @param userId - User identifier to include in the key
 * @returns A unique idempotency key
 */
function generateIdempotencyKey(userId: string): string {
  const key = uuidv4();
  console.log('[CDP] Generated idempotency key:', key, 'Length:', key.length);
  if (key.length !== 36) {
    throw new Error(`[CDP] Invalid idempotency key length: ${key.length}. Key: ${key}`);
  }
  return key;
}

// Base Sepolia testnet configuration
const BASE_SEPOLIA_CONFIG = {
  chainId: 84532, // Base Sepolia testnet chain ID
  rpcUrl: "https://sepolia.base.org", // Base Sepolia RPC URL
};

/**
 * Gets or creates a wallet for a user
 * @param userId - Unique identifier for the user
 * @param address - Optional address of an existing wallet to use
 */
export async function getOrCreateWallet(userId: string, address?: string) {

  try {
    console.log(`Creating new wallet provider for user ${userId}`);
    
    // Log available environment variables for debugging (without exposing secrets)
    const envKeys = Object.keys(process.env).filter(key => 
      key.includes('CDP') || key.includes('NETWORK')
    );
    console.log('Available CDP environment variable keys:', envKeys);
    
    // Get CDP environment variables
    const cdpEnv = getCdpEnvironment();
    console.log('CDP environment loaded:', {
      apiKeyId: cdpEnv.apiKeyId ? 'PRESENT' : 'MISSING',
      apiKeySecret: cdpEnv.apiKeySecret ? 'PRESENT' : 'MISSING',
      walletSecret: cdpEnv.walletSecret ? 'PRESENT' : 'MISSING',
      networkId: cdpEnv.networkId
    });
    
    // Generate a proper idempotency key that meets the 36-character minimum requirement
    const idempotencyKey = generateIdempotencyKey(userId);
    console.log('Generated idempotency key length:', idempotencyKey.length);
    
    const config = {
      // CDP v2 wallet configuration
      apiKeyId: cdpEnv.apiKeyId,
      apiKeySecret: cdpEnv.apiKeySecret,
      walletSecret: cdpEnv.walletSecret,
      networkId: cdpEnv.networkId,
      // idempotencyKey is generated but must be sent as X-Idempotency-Key header
      idempotencyKey, // For reference; not used directly by the API
      ...(address && { address }),
      
      // CDP v2 specific configuration
      walletType: 'v2',
      walletConfig: {
        // Explicitly set Base Sepolia testnet configuration
        chainId: BASE_SEPOLIA_CONFIG.chainId,
        rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl,
      },
      // If agentkit supports custom headers, set the header here
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      }
    };
    // NOTE: If @coinbase/agentkit does not forward the headers property, you must patch the library or wrap HTTP requests to ensure X-Idempotency-Key is sent.


    console.log('Initializing wallet with config:', {
      ...config,
      apiKeyId: config.apiKeyId ? '[REDACTED]' : 'MISSING',
      apiKeySecret: '[REDACTED]',
      walletSecret: '[REDACTED]',
      networkId: config.networkId,
      chainId: config.walletConfig.chainId,
      rpcUrl: config.walletConfig.rpcUrl,
    });

    try {
      // Configure with explicit wallet and network parameters
      const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
      
      // Verify the wallet is working by getting the address
      const walletAddress = await walletProvider.getAddress();
      console.log(`Successfully created wallet with address: ${walletAddress}`);
      
      // Always return a new wallet provider (no caching)
      return walletProvider;
    } catch (error) {
      console.error('Error configuring wallet provider:', error);
      throw new Error(`Failed to configure wallet provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}