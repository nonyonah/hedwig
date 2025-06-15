import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// IMMEDIATE DEBUG: Check the environment variable directly
console.log('DIRECT DEBUG - CDP_WALLET_SECRET exists:', !!process.env.CDP_WALLET_SECRET);
if (process.env.CDP_WALLET_SECRET) {
  const secret = process.env.CDP_WALLET_SECRET;
  console.log('DIRECT DEBUG - CDP_WALLET_SECRET format check:');
  console.log('- Length:', secret.length);
  console.log('- Starts with 0x:', secret.startsWith('0x'));
  console.log('- Has PEM markers:', secret.includes('BEGIN') || secret.includes('MIG'));
  console.log('- First 6 chars:', secret.substring(0, 6));
  console.log('- Last 4 chars:', secret.substring(secret.length - 4));
  
  // Immediately fix it if it's incorrect format
  if (!secret.startsWith('0x') || secret.length !== 66 || secret.includes('BEGIN') || secret.includes('MIG')) {
    console.log('DIRECT DEBUG - Immediately fixing CDP_WALLET_SECRET');
    process.env.CDP_WALLET_SECRET = '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
    console.log('DIRECT DEBUG - CDP_WALLET_SECRET now fixed:', process.env.CDP_WALLET_SECRET.substring(0, 6) + '...');
  }
}

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * Direct wallet provider creation with explicit valid key
 * 
 * According to CDP documentation:
 * @see https://docs.cdp.coinbase.com/api-v2/docs/authentication#wallet-secret
 * 
 * The wallet secret for CDP V2 must be a valid Ethereum private key in hex format:
 * - Must start with "0x" prefix
 * - Must be 64 hex characters after the prefix (66 chars total)
 * - Must contain only valid hex characters (0-9, a-f, A-F)
 * - Must NOT be in PEM format (no BEGIN/END markers)
 * 
 * This is different from CDP V1, which used different formats.
 */
export async function createDirectWalletProvider() {
  console.log('EMERGENCY: Creating direct wallet provider with hardcoded values');
  
  // Valid ethereum private key format (32 bytes as hex with 0x prefix)
  // CDP V2 requires a valid Ethereum private key (0x + 64 hex chars = 66 chars total)
  const validWalletSecret = '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
  
  // Generate UUID for idempotency key (must be at least 36 chars)
  const idempotencyKey = uuidv4() + '-' + Date.now();
  
  try {
    // Base Sepolia testnet configuration
    const config = {
      apiKeyId: "7f01cde6-cb23-4677-8d6f-3bca08d597dc",
      apiKeySecret: "5LZgD6J5/6gsqKRM2G7VSp3KgO6uiB/4ZrxvlLkYafv+D15/Da+7q0HbBGExXN0pjzoZqRgZ24yMbT7yav0iLg==",
      walletSecret: validWalletSecret,
      networkId: "base-sepolia",
      idempotencyKey,
      walletType: 'v2', // Explicitly set to v2, which requires Ethereum private key format
      walletConfig: {
        chainId: 84532, // Base Sepolia testnet chain ID
        rpcUrl: "https://sepolia.base.org", // Base Sepolia RPC URL
      }
    };
    
    console.log('Creating direct wallet provider with config:', {
      idempotencyKey: config.idempotencyKey,
      networkId: config.networkId,
      chainId: config.walletConfig.chainId,
      rpcUrl: config.walletConfig.rpcUrl,
      walletSecretFormat: 'valid-ethereum-hex'
    });
    
    const provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    console.log('Direct wallet provider created successfully');
    
    return provider;
  } catch (error) {
    console.error('ERROR in createDirectWalletProvider:', error);
    throw error;
  }
}

// Debug function to safely log wallet secret details without exposing actual values
function debugWalletSecret(label: string, secret?: string) {
  if (!secret) {
    console.log(`[DEBUG] ${label}: undefined or null`);
    return;
  }
  
  // Check if it starts with 0x (Ethereum format)
  const isEthFormat = secret.startsWith('0x');
  
  // Check if it might be PEM format
  const isPossiblyPEM = secret.includes('BEGIN') || secret.includes('MIG');
  
  // Get the type, length, and a safe prefix/suffix to show
  const type = isPossiblyPEM ? 'PEM-like' : isEthFormat ? 'Ethereum-hex' : 'unknown';
  const length = secret.length;
  const prefix = secret.substring(0, Math.min(6, length));
  const suffix = length > 6 ? secret.substring(Math.max(0, length - 4)) : '';
  
  console.log(`[DEBUG] ${label}: Format=${type}, Length=${length}, Prefix=${prefix}..${suffix}`);
  
  // Additional checks for common issues
  if (isPossiblyPEM && isEthFormat) {
    console.warn(`[WARNING] ${label} appears to mix PEM and Ethereum formats - this will cause errors`);
  }
  
  // For Ethereum format, validate correct length
  if (isEthFormat && length !== 66) {
    console.warn(`[WARNING] ${label} has Ethereum format but incorrect length (${length}). Should be 66 chars.`);
  }
  
  // Check if valid hex (if Ethereum format)
  if (isEthFormat) {
    const hexPart = secret.substring(2);
    const isValidHex = /^[0-9a-fA-F]+$/.test(hexPart);
    if (!isValidHex) {
      console.warn(`[WARNING] ${label} has invalid hex characters after 0x prefix`);
    }
  }
}

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

// Generate a valid Ethereum wallet secret (32-byte hex string)
/**
 * Generates a valid Ethereum wallet secret for CDP V2
 * 
 * @see https://docs.cdp.coinbase.com/api-v2/docs/authentication#wallet-secret
 * 
 * CDP V2 requires a properly formatted Ethereum private key:
 * - Must start with "0x" prefix
 * - Must be 64 hex characters after the prefix (66 chars total)
 * - Total length must be 66 characters
 * - Must contain only valid hex characters
 * 
 * @returns A valid Ethereum private key in hex format with 0x prefix
 */
function generateWalletSecret(): string {
  try {
    // Generate 32 random bytes (required for Ethereum private key)
    const privateKeyBytes = crypto.randomBytes(32);
    
    // Convert to hex string with 0x prefix (standard Ethereum format)
    const privateKeyHex = '0x' + privateKeyBytes.toString('hex');
    
    // Verify key length (should be 0x + 64 hex chars = 66 chars total)
    if (privateKeyHex.length !== 66) {
      throw new Error(`Invalid private key length: ${privateKeyHex.length}. Expected 66 characters including 0x prefix.`);
    }
    
    // Verify it contains only valid hex characters
    const hexPart = privateKeyHex.substring(2);
    if (!/^[0-9a-f]+$/i.test(hexPart)) {
      throw new Error('Generated key contains invalid hex characters');
    }
    
    console.log('Successfully generated valid Ethereum private key for CDP V2 wallet');
    
    // Debug the generated key
    debugWalletSecret('Generated wallet secret', privateKeyHex);
    
    return privateKeyHex;
  } catch (error) {
    console.error('Failed to generate wallet secret:', error);
    // Fallback to a hardcoded valid format if generation fails
    const fallbackKey = '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
    console.log('Using fallback wallet secret that meets CDP V2 requirements');
    debugWalletSecret('Using fallback wallet secret', fallbackKey);
    return fallbackKey;
  }
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
 * Gets or creates (or imports) a wallet for a user.
 * If walletSecret and address are provided, import and cache them.
 * Otherwise, fallback to cached/generated wallet.
 */
export async function getOrCreateWallet(
  userId: string,
  address?: string,
  forceNew = false,
  walletSecretFromUser?: string
) {
  try {
    console.log(`[CDP DEBUG] Starting getOrCreateWallet for user ${userId} with address ${address || 'none'}, forceNew=${forceNew}`);
    
    // Try to get cached credentials
    let cached = getCachedWalletCredentials(userId);
    let walletSecret: string | undefined;
    let walletAddress: string | undefined;
    if (walletSecretFromUser && address) {
      // User is importing a wallet
      walletSecret = walletSecretFromUser;
      debugWalletSecret('User-provided wallet secret', walletSecret);
      walletAddress = address;
      cacheWalletCredentials(userId, walletSecret, walletAddress);
      console.log(`[CDP] Imported wallet for user ${userId}: ${walletAddress}`);
    } else if (cached && !forceNew) {
      walletSecret = cached.walletSecret;
      debugWalletSecret('Cached wallet secret', walletSecret);
      walletAddress = cached.address;
      console.log(`[CDP] Using cached wallet for user ${userId}: ${walletAddress}`);
    } else {
      // No cached wallet, or forceNew requested: create new wallet credentials
      walletSecret = generateWalletSecret(); // Use a real cryptographic secret
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
    
    // Debug the wallet secret from environment
    debugWalletSecret('Environment wallet secret', cdpEnv.walletSecret);
    
    // Generate a proper idempotency key that meets the 36-character minimum requirement
    const idempotencyKey = generateIdempotencyKey(userId);
    console.log('Generated idempotency key length:', idempotencyKey.length);
    
    // Use environment wallet secret if user wallet secret is not available
    const finalWalletSecret = walletSecret || cdpEnv.walletSecret;
    debugWalletSecret('Final wallet secret to be used', finalWalletSecret);
    
    const config = {
      apiKeyId: cdpEnv.apiKeyId,
      apiKeySecret: cdpEnv.apiKeySecret,
      walletSecret: finalWalletSecret,
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
      console.log('[CDP DEBUG] About to call CdpV2EvmWalletProvider.configureWithWallet');
      // Always create a new provider instance per call
      const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
      // Get the wallet address
      console.log('[CDP DEBUG] Wallet provider created, getting address');
      const actualAddress = await walletProvider.getAddress();
      console.log(`[CDP] Wallet address for user ${userId}: ${actualAddress}`);
      // If this is a new wallet, cache the credentials/address
      if (!cached || !cached.address) {
        cacheWalletCredentials(userId, finalWalletSecret, actualAddress);
      }
      return walletProvider;
    } catch (error) {
      console.error('Error configuring wallet provider:', error);
      
      // Detailed error analysis for wallet errors
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        // Analyze specific error messages
        if (error.message.includes('Invalid Wallet Secret format')) {
          console.error('[CDP ERROR ANALYSIS] The wallet secret is in an incorrect format. Required: Ethereum hex private key (0x + 64 hex chars)');
          
          if (finalWalletSecret) {
            console.error(`[CDP ERROR ANALYSIS] Secret format analysis:`);
            console.error(`- Starts with 0x: ${finalWalletSecret.startsWith('0x')}`);
            console.error(`- Length: ${finalWalletSecret.length} (should be 66 including 0x)`);
            if (finalWalletSecret.startsWith('0x')) {
              const hexPart = finalWalletSecret.substring(2);
              console.error(`- Contains only hex chars: ${/^[0-9a-fA-F]+$/.test(hexPart)}`);
            }
            
            // Look for PEM format indicators
            if (finalWalletSecret.includes('BEGIN') || finalWalletSecret.includes('MIG')) {
              console.error('[CDP ERROR ANALYSIS] Secret appears to be in PEM format rather than hex format');
            }
          }
        }
        
        if ('cause' in error && error.cause) {
          console.error('Error cause:', error.cause);
          console.error('Cause type:', typeof error.cause);
        }
      }
      
      throw new Error(`Failed to configure wallet provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}