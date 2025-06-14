import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { randomUUID } from 'crypto';

// Ensure environment variables are loaded
loadServerEnvironment();

// Wallet provider cache with user-specific instances
const walletProviders = new Map<string, CdpV2EvmWalletProvider>();

/**
 * Generates a unique idempotency key that meets CDP requirements (minimum 36 characters)
 * @param userId - User identifier to include in the key
 * @returns A unique idempotency key
 */
function generateIdempotencyKey(userId: string): string {
  // Generate a UUID (36 characters) and combine with user ID and timestamp
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  // Ensure the key is truly unique and long enough
  return `${uuid}-user-${userId}-${timestamp}`;
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
  // Check if we already have a wallet provider for this user
  if (walletProviders.has(userId)) {
    console.log(`Returning cached wallet provider for user ${userId}`);
    return walletProviders.get(userId)!;
  }

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
      idempotencyKey,
      ...(address && { address }),
      
      // CDP v2 specific configuration
      walletType: 'v2',
      walletConfig: {
        // Explicitly set Base Sepolia testnet configuration
        chainId: BASE_SEPOLIA_CONFIG.chainId,
        rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl,
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
      // Configure with explicit wallet and network parameters
      const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
      
      // Verify the wallet is working by getting the address
      const walletAddress = await walletProvider.getAddress();
      console.log(`Successfully created wallet with address: ${walletAddress}`);
      
      // Cache the wallet provider for this user
      walletProviders.set(userId, walletProvider);
      
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