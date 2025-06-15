import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';

// Ensure environment variables are loaded
loadServerEnvironment();

// Wallet credentials cache: only one wallet per user unless explicitly requested
const walletCredentialsCache = new Map<string, { walletSecret: string; address: string }>();

// Helper to get wallet credentials for a user
export function getCachedWalletCredentials(userId: string) {
  return walletCredentialsCache.get(userId);
}

// Helper to set wallet credentials for a user
function cacheWalletCredentials(userId: string, walletSecret: string, address: string) {
  walletCredentialsCache.set(userId, { walletSecret, address });
}


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
export async function getOrCreateWallet(userId: string, address?: string, forceNew = false) {
  try {
    // Try to get cached credentials
    let cached = getCachedWalletCredentials(userId);
    let walletSecret: string | undefined;
    let walletAddress: string | undefined;
    if (cached && !forceNew) {
      walletSecret = cached.walletSecret;
      walletAddress = cached.address;
      console.log(`[CDP] Using cached wallet for user ${userId}: ${walletAddress}`);
    } else {
      // No cached wallet, or forceNew requested: create new wallet credentials
      // For demo: generate a new walletSecret (in real app, use secure generation/storage)
      walletSecret = uuidv4(); // Use uuid as a stand-in for wallet secret
      walletAddress = undefined; // Let provider create new wallet/address
      console.log(`[CDP] Creating new wallet for user ${userId}`);
    }

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
      walletSecret: walletSecret ? '[CACHED/NEW]' : 'MISSING',
      networkId: cdpEnv.networkId
    });
    
    // Generate a proper idempotency key that meets the 36-character minimum requirement
    const idempotencyKey = generateIdempotencyKey(userId);
    console.log('Generated idempotency key length:', idempotencyKey.length);
    
    const config = {
      apiKeyId: cdpEnv.apiKeyId,
      apiKeySecret: cdpEnv.apiKeySecret,
      walletSecret: walletSecret,
      networkId: cdpEnv.networkId,
      idempotencyKey,
      ...(walletAddress && { address: walletAddress }),
      walletType: 'v2',
      walletConfig: {
        chainId: BASE_SEPOLIA_CONFIG.chainId,
        rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl,
      },
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      }
    };
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
      // Always create a new provider instance per call
      const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
      // Get the wallet address
      const actualAddress = await walletProvider.getAddress();
      console.log(`[CDP] Wallet address for user ${userId}: ${actualAddress}`);
      // If this is a new wallet, cache the credentials/address
      if (!cached || !cached.address) {
        cacheWalletCredentials(userId, walletSecret!, actualAddress);
      }
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