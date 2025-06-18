import { PrivyEvmWalletProvider } from '@coinbase/agentkit';
import { loadServerEnvironment, getPrivyEnvironment } from './serverEnv';
import crypto from 'crypto';

// IMMEDIATE DEBUG: Check the environment variable directly
console.log('DIRECT DEBUG - CDP_WALLET_SECRET exists:', !!process.env.CDP_WALLET_SECRET);
// Remove the CDP wallet-specific check since we're switching to Privy
console.log('Changing wallet provider to PrivyEvmWalletProvider - no longer using CDP_WALLET_SECRET');

// Ensure environment variables are loaded
loadServerEnvironment();

// Track when we last attempted to create a wallet for a user
// This helps prevent duplicate wallet creation attempts
const lastWalletCreationAttempt = new Map<string, number>();
const WALLET_CREATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if we should allow a new wallet creation attempt
 * Prevents rapid successive wallet creations for the same user
 * @param userId The user ID
 * @param forceBypass Whether to force bypass the cooldown check
 * @returns True if a new wallet creation is allowed, false otherwise
 */
function shouldAllowWalletCreation(userId: string, forceBypass = false): boolean {
  if (forceBypass) {
    console.log(`[Wallet] Bypassing wallet creation cooldown for user ${userId} due to force flag`);
    return true;
  }
  
  const lastAttempt = lastWalletCreationAttempt.get(userId);
  if (!lastAttempt) {
    return true;
  }
  
  const now = Date.now();
  const timeSinceLastAttempt = now - lastAttempt;
  
  if (timeSinceLastAttempt < WALLET_CREATION_COOLDOWN_MS) {
    console.log(`[Wallet] Blocking wallet creation for user ${userId} - last attempt was ${timeSinceLastAttempt/1000} seconds ago`);
    return false;
  }
  
  return true;
}

/**
 * Records a wallet creation attempt
 * @param userId The user ID
 */
function recordWalletCreationAttempt(userId: string): void {
  lastWalletCreationAttempt.set(userId, Date.now());
  console.log(`[Wallet] Recorded wallet creation attempt for user ${userId}`);
}

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

// Wallet credentials cache - use a consistent cache across the app
// This will persist wallets for the duration of the server instance
const walletCredentialsCache = new Map<string, { privateKey: string; address: string }>();

/**
 * Gets cached wallet credentials for a user.
 * @param userId The user identifier
 * @returns The cached credentials or undefined if not found
 */
export function getCachedWalletCredentials(userId: string) {
  console.log(`[Wallet] Checking cached credentials for user ${userId}`);
  const credentials = walletCredentialsCache.get(userId);
  
  if (credentials) {
    console.log(`[Wallet] Found cached credentials for user ${userId}`);
    return credentials;
  } else {
    console.log(`[Wallet] No cached credentials found for user ${userId}`);
    return undefined;
  }
}

/**
 * Caches wallet credentials for a user.
 * @param userId The user identifier
 * @param privateKey The wallet private key
 * @param address The wallet address
 */
export function cacheWalletCredentials(userId: string, privateKey: string, address: string) {
  console.log(`[Wallet] Caching credentials for user ${userId} with address ${address}`);
  walletCredentialsCache.set(userId, { privateKey, address });
  
  // Print cache stats for debugging
  console.log(`[Wallet] Cache now contains ${walletCredentialsCache.size} wallet(s)`);
  
  // Print all cached user IDs for debugging
  console.log(`[Wallet] Cached users: ${Array.from(walletCredentialsCache.keys()).join(', ')}`);
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
 * @param userId The user identifier
 * @param address Optional wallet address for lookup
 * @param forceNew Whether to force creation of a new wallet
 * @param privateKeyFromUser Optional private key provided by the user
 * @returns The wallet provider
 */
export async function getOrCreateWallet(
  userId: string,
  address?: string,
  forceNew = false,
  privateKeyFromUser?: string
) {
  try {
    console.log(`[Wallet DEBUG] Starting getOrCreateWallet for user ${userId} with address ${address || 'none'}, forceNew=${forceNew}`);
    
    // Check if we're allowed to create a new wallet (prevents duplicate creation)
    if (forceNew && !shouldAllowWalletCreation(userId, false)) {
      console.log(`[Wallet] Blocking duplicate wallet creation for user ${userId} - using cached wallet instead`);
      // Override forceNew to false to use existing wallet
      forceNew = false;
    }
    
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
    } else if (forceNew) {
      // Record this creation attempt to prevent duplicates
      recordWalletCreationAttempt(userId);
      
      // Only create a new wallet when explicitly requested with forceNew=true
      console.log(`[Wallet] Force creating new wallet for user ${userId} as requested`);
      
      privateKey = generatePrivateKey();
      walletAddress = undefined; // Let provider determine address
      
      // Log the private key format for debugging (safe version)
      const safePrivateKey = privateKey.substring(0, 6) + '...' + privateKey.substring(privateKey.length - 4);
      console.log(`[Wallet] Generated new private key for ${userId}: ${safePrivateKey}, format: ${privateKey.startsWith('0x') ? 'hex with 0x' : 'not hex format'}`);
    } else {
      // No existing wallet and not requesting to create one - throw error
      console.error(`[Wallet] No wallet found for ${userId} and forceNew=false`);
      throw new Error(`No wallet found for user ${userId}. Please create one first with '/wallet create'.`);
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
      
      // IMPORTANT: Log all wallet creation parameters for debugging
      console.log('[Wallet DEBUG] Wallet creation parameters:', {
        userId,
        hasAddress: !!address,
        forceNew,
        hasPrivateKey: !!privateKey,
        hasPrivateKeyFromUser: !!privateKeyFromUser,
        hasCachedWallet: !!cached,
        privateKeyFormat: privateKey ? (privateKey.startsWith('0x') ? 'hex with 0x' : 'not hex format') : 'none',
        privateKeyLength: privateKey ? privateKey.length : 0
      });
      
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
        appId: config.appId ? config.appId.substring(0, 3) + '...' : 'MISSING',
        hasPrivateKey: !!config.privateKey
      });
      
      // Create new provider
      console.log('[Wallet DEBUG] Calling PrivyEvmWalletProvider.configureWithWallet');
      const walletProvider = await PrivyEvmWalletProvider.configureWithWallet(config);
      console.log('[Wallet DEBUG] PrivyEvmWalletProvider created successfully');
      
      // Get the wallet address to verify it works
      console.log('[Wallet DEBUG] Wallet provider created, getting address');
      const actualAddress = await walletProvider.getAddress();
      console.log(`[Wallet] Wallet address for user ${userId}: ${actualAddress}`);
      
      // Always cache the credentials to ensure we store the wallet
      cacheWalletCredentials(userId, privateKey, actualAddress);
      console.log(`[Wallet] Cached wallet for user ${userId} with address ${actualAddress}`);
      
    return walletProvider;
    } catch (error) {
      console.error('Error configuring wallet provider:', error);
      
      // Detailed error analysis for wallet errors
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      throw new Error(`Failed to configure wallet provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}