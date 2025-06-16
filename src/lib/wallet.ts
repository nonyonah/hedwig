import { PrivyEvmWalletProvider } from '@coinbase/agentkit';
import { loadServerEnvironment, getPrivyEnvironment } from './serverEnv';
import crypto from 'crypto';

// IMMEDIATE DEBUG: Check the environment variable directly
console.log('DIRECT DEBUG - CDP_WALLET_SECRET exists:', !!process.env.CDP_WALLET_SECRET);
// Remove the CDP wallet-specific check since we're switching to Privy
console.log('Changing wallet provider to PrivyEvmWalletProvider - no longer using CDP_WALLET_SECRET');

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * Direct wallet provider creation for emergency fallback
 */
export async function createDirectWalletProvider() {
  console.log('EMERGENCY: Creating direct PrivyEvmWalletProvider');
  
  try {
    // Get environment variables for Privy configuration
    const { appId, appSecret } = getPrivyEnvironment();
    
    // Basic check for Privy App ID
    if (!appId) {
      console.error('[Wallet ERROR] Missing Privy App ID');
      throw new Error('Missing Privy App ID');
    }
    
    // Generate a simple private key (just for development)
    const privateKey = '0x' + '1'.repeat(64);
    
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
      appId: config.appId ? config.appId.substring(0, 3) + '...' : 'MISSING'
    });
    
    const provider = await PrivyEvmWalletProvider.configureWithWallet(config);
    console.log('Direct PrivyEvmWalletProvider created successfully');
    
    return provider;
  } catch (error) {
    console.error('ERROR in createDirectWalletProvider:', error);
    throw error;
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
 * Generates a simple Ethereum private key
 * 
 * @returns A valid Ethereum private key in hex format with 0x prefix
 */
function generatePrivateKey(): string {
  // Always use a fixed development private key for simplicity
  // In production, we'd use a proper key management system
  return '0x' + '1'.repeat(64);
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
      walletAddress = address;
      cacheWalletCredentials(userId, privateKey, walletAddress);
      console.log(`[Wallet] Imported wallet for user ${userId}: ${walletAddress}`);
    } else if (cached && !forceNew) {
      // Use cached wallet
      privateKey = cached.privateKey;
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
      
      // Basic check for Privy App ID
      if (!appId) {
        console.error('[Wallet ERROR] Missing Privy App ID');
        throw new Error('Missing Privy App ID');
      }
      
      console.log('[Wallet] Using Privy App ID:', appId.substring(0, Math.min(5, appId.length)) + '...');
      
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
        appId: config.appId ? config.appId.substring(0, 3) + '...' : 'MISSING'
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
      }
      
      throw new Error(`Failed to configure wallet provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}