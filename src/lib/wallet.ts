import { PrivyEvmWalletProvider } from '@coinbase/agentkit';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment, getPrivyEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// IMMEDIATE DEBUG: Check the environment variable directly
console.log('DIRECT DEBUG - CDP_WALLET_SECRET exists:', !!process.env.CDP_WALLET_SECRET);
// Remove the CDP wallet-specific check since we're switching to Privy
console.log('Changing wallet provider to PrivyEvmWalletProvider - no longer using CDP_WALLET_SECRET');

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * Direct wallet provider creation with explicit valid key
 * 
 * According to AgentKit documentation:
 * @see https://github.com/coinbase/agentkit/blob/main/typescript/agentkit/README.md
 * 
 * PrivyEvmWalletProvider requires an Ethereum private key and RPC configuration:
 * - The private key should be a standard Ethereum private key (32 bytes as hex with 0x prefix)
 */
export async function createDirectWalletProvider() {
  console.log('EMERGENCY: Creating direct PrivyEvmWalletProvider');
  
  try {
    // Get environment variables for Privy configuration
    const { appId, appSecret } = getPrivyEnvironment();
    
    // Validate Privy App ID format
    if (!appId || !appId.startsWith('cl') || appId.length < 20) {
      console.error('[Wallet ERROR] Invalid Privy App ID format:', appId);
      throw new Error('Invalid Privy App ID format');
    }
    
    // Generate a new private key
    const privateKey = generatePrivateKey();
    
    // Base Sepolia testnet configuration
    const config = {
      appId,
      appSecret,
      privateKey,
      chainId: BASE_SEPOLIA_CONFIG.chainId,
      rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl,
    };
    
    console.log('Creating direct PrivyEvmWalletProvider with config:', {
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      appId: config.appId ? config.appId.substring(0, 5) + '...' + config.appId.substring(config.appId.length - 5) : 'MISSING'
    });
    
    const provider = await PrivyEvmWalletProvider.configureWithWallet(config);
    console.log('Direct PrivyEvmWalletProvider created successfully');
    
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
const walletCredentialsCache = new Map<string, { privateKey: string; address: string }>();

// Helper to get wallet credentials for a user
export function getCachedWalletCredentials(userId: string) {
  return walletCredentialsCache.get(userId);
}

// Helper to set wallet credentials for a user
function cacheWalletCredentials(userId: string, privateKey: string, address: string) {
  walletCredentialsCache.set(userId, { privateKey, address });
}

/**
 * Generates a valid Ethereum private key
 * 
 * @returns A valid Ethereum private key in hex format with 0x prefix
 */
function generatePrivateKey(): string {
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
    
    console.log('Successfully generated valid Ethereum private key');
    
    // Debug the generated key
    debugWalletSecret('Generated private key', privateKeyHex);
    
    return privateKeyHex;
  } catch (error) {
    console.error('Failed to generate private key:', error);
    throw new Error('Failed to generate a valid private key');
  }
}

// Base Sepolia testnet configuration
const BASE_SEPOLIA_CONFIG = {
  chainId: "84532", // Base Sepolia testnet chain ID as string
  rpcUrl: "https://sepolia.base.org", // Base Sepolia RPC URL
};

/**
 * Gets or creates (or imports) a wallet for a user.
 * If privateKey and address are provided, import and cache them.
 * Otherwise, fallback to cached/generated wallet.
 */
export async function getOrCreateWallet(
  userId: string,
  address?: string,
  forceNew = false,
  privateKeyFromUser?: string
) {
  try {
    console.log(`[Wallet DEBUG] Starting getOrCreateWallet for user ${userId} with address ${address || 'none'}, forceNew=${forceNew}`);
    
    // Try to get cached credentials
    let cached = getCachedWalletCredentials(userId);
    let privateKey: string | undefined;
    let walletAddress: string | undefined;
    
    if (privateKeyFromUser && address) {
      // User is importing a wallet
      privateKey = privateKeyFromUser;
      debugWalletSecret('User-provided private key', privateKey);
      walletAddress = address;
      cacheWalletCredentials(userId, privateKey, walletAddress);
      console.log(`[Wallet] Imported wallet for user ${userId}: ${walletAddress}`);
    } else if (cached && !forceNew) {
      // Use cached wallet
      privateKey = cached.privateKey;
      debugWalletSecret('Cached private key', privateKey);
      walletAddress = cached.address;
      console.log(`[Wallet] Using cached wallet for user ${userId}: ${walletAddress}`);
    } else {
      // No cached wallet, or forceNew requested: create new wallet credentials
      privateKey = generatePrivateKey();
      walletAddress = undefined; // Let provider determine address
      console.log(`[Wallet] Creating new wallet for user ${userId}`);
    }

    // Initialize Privy wallet provider
    try {
      console.log('[Wallet DEBUG] About to create PrivyEvmWalletProvider');
      
      // Get environment values for Privy configuration
      const { appId, appSecret } = getPrivyEnvironment();
      
      // Validate Privy App ID format
      if (!appId || !appId.startsWith('cl') || appId.length < 20) {
        console.error('[Wallet ERROR] Invalid Privy App ID format:', appId);
        throw new Error('Invalid Privy App ID format');
      }
      
      console.log('[Wallet] Using Privy App ID:', appId.substring(0, 5) + '...' + appId.substring(appId.length - 5));
      
      const config = {
        appId,
        appSecret,
        privateKey,
        chainId: BASE_SEPOLIA_CONFIG.chainId,
        rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl,
      };
      
      console.log('Initializing PrivyEvmWalletProvider with config:', {
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        appId: config.appId ? config.appId.substring(0, 5) + '...' + config.appId.substring(config.appId.length - 5) : 'MISSING'
      });
      
      // Create new provider
      const walletProvider = await PrivyEvmWalletProvider.configureWithWallet(config);
      
      // Get the wallet address to verify it works
      console.log('[Wallet DEBUG] Wallet provider created, getting address');
      const actualAddress = await walletProvider.getAddress();
      console.log(`[Wallet] Wallet address for user ${userId}: ${actualAddress}`);
      
      // If this is a new wallet, cache the credentials/address
      if (!cached || !cached.address) {
        cacheWalletCredentials(userId, privateKey, actualAddress);
      }
      
      return walletProvider;
    } catch (error) {
      console.error('Error configuring wallet provider:', error);
      
      // Detailed error analysis for wallet errors
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        // Analyze specific error messages
        if (error.message.includes('Invalid private key')) {
          console.error('[Wallet ERROR ANALYSIS] The private key is invalid. Required: Ethereum hex private key (0x + 64 hex chars)');
          
          if (privateKey) {
            console.error(`[Wallet ERROR ANALYSIS] Private key format analysis:`);
            console.error(`- Starts with 0x: ${privateKey.startsWith('0x')}`);
            console.error(`- Length: ${privateKey.length} (should be 66 including 0x)`);
            if (privateKey.startsWith('0x')) {
              const hexPart = privateKey.substring(2);
              console.error(`- Contains only hex chars: ${/^[0-9a-fA-F]+$/.test(hexPart)}`);
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