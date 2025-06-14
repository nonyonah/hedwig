import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { randomUUID } from 'crypto';

// Ensure environment variables are loaded
loadServerEnvironment();

let walletProvider: CdpV2EvmWalletProvider | null = null;

/**
 * Generates a unique idempotency key that meets CDP requirements (minimum 36 characters)
 * @param userId - User identifier to include in the key
 * @returns A unique idempotency key
 */
function generateIdempotencyKey(userId: string): string {
  // Generate a UUID (36 characters) and combine with user ID and timestamp
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  return `${uuid}-user-${userId}-${timestamp}`;
}

/**
 * Gets or creates a wallet for a user
 * @param userId - Unique identifier for the user
 * @param address - Optional address of an existing wallet to use
 */
export async function getOrCreateWallet(userId: string, address?: string) {
  if (walletProvider) {
    return walletProvider;
  }

  try {
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
        // Add any v2 specific configuration here
        // Example:
        // chainId: 84532, // Base Sepolia testnet
        // rpcUrl: process.env.NEXT_PUBLIC_RPC_URL
      }
    };

    walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    return walletProvider;
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}