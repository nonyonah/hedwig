import { randomUUID } from 'crypto';
import { CdpV2EvmWalletProvider, WalletProvider } from '@coinbase/agentkit';
import { registerUserWallet } from './agentkit';
import { getCdpEnvironment } from './serverEnv';
import { supabase } from './supabaseClient';
import { shouldAllowWalletCreation, recordWalletCreationAttempt } from '@/pages/api/_walletUtils';

// Cache for storing wallet providers by user ID
const walletCache: Map<string, WalletProvider> = new Map();

/**
 * Generates a UUID v4 key for wallet creation (exactly 36 characters)
 * @param userId Unique identifier for the user (not used in key generation)
 * @returns A standard UUID v4 string (36 characters)
 */
export function generateWalletIdempotencyKey(userId: string): string {
  try {
    // Generate a standard UUID v4 using Node's crypto module (36 characters)
    const uuid = randomUUID();
    console.log(`Generated idempotency key for user ${userId}: ${uuid}`);
    return uuid;
  } catch (error) {
    // Fallback in case randomUUID fails (shouldn't happen in Node environment)
    console.error(`Error generating UUID, falling back to manual implementation:`, error);
    const fallbackUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    console.log(`Generated fallback idempotency key for user ${userId}: ${fallbackUuid}`);
    return fallbackUuid;
  }
}

/**
 * Creates a direct wallet provider for a specific user
 * @param userId Unique identifier for the user
 * @returns A configured CdpV2EvmWalletProvider instance
 */
export async function createDirectWalletProvider(userId: string): Promise<WalletProvider> {
  try {
    console.log(`Creating direct wallet provider for user: ${userId}`);
    
    // Get required CDP environment variables
    const { apiKeyId, apiKeySecret, walletSecret, networkId } = getCdpEnvironment();
    
    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      throw new Error('Missing required CDP credentials for wallet creation');
    }
    
    // Configuration for CDP wallet provider
    const config = {
      apiKeyId,
      apiKeySecret,
      walletSecret,
      networkId,
      idempotencyKey: generateWalletIdempotencyKey(userId),
    };
    
    console.log('Creating CDP wallet provider with config:', {
      networkId: config.networkId,
      idempotencyKey: config.idempotencyKey,
    });
    
    // Create and initialize wallet provider
    const provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    
    // Verify the wallet is working
    const address = await provider.getAddress();
    console.log(`Wallet created successfully for ${userId} with address: ${address}`);
    
    // Cache the provider for future use
    walletCache.set(userId, provider);
    
    // Register with AgentKit
    await registerUserWallet(userId, provider);
    
    return provider;
  } catch (error) {
    console.error(`Failed to create wallet for user ${userId}:`, error);
    throw new Error(`Wallet creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Checks if a user has a wallet in the database
 * @param userId Unique identifier for the user
 * @returns Boolean indicating if the user has a wallet
 */
export async function userHasWalletInDb(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error(`Error checking wallet for user ${userId}:`, error);
      return false;
    }
    
    return !!data;
  } catch (error) {
    console.error(`Exception checking wallet in DB for user ${userId}:`, error);
    return false;
  }
}

/**
 * Gets a wallet provider for a user, either from cache or database
 * @param userId Unique identifier for the user
 * @returns The wallet provider or null if none exists
 */
export async function getWalletProvider(userId: string): Promise<WalletProvider | null> {
  try {
    console.log(`Getting wallet provider for user: ${userId}`);
    
    // Check cache first
    if (walletCache.has(userId)) {
      console.log(`Found wallet in cache for user: ${userId}`);
      return walletCache.get(userId)!;
    }
    
    // Check database if wallet exists
    const walletExists = await userHasWalletInDb(userId);
    if (!walletExists) {
      console.log(`No wallet found in database for user: ${userId}`);
      return null;
    }
    
    // Get wallet from database and recreate provider
    const walletData = await getWalletFromDb(userId);
    if (!walletData) {
      console.log(`Failed to retrieve wallet data for user: ${userId}`);
      return null;
    }
    
    // Create new provider with existing wallet
    console.log(`Creating provider with existing wallet for user: ${userId}`);
    
    // Get required CDP environment variables
    const { apiKeyId, apiKeySecret, walletSecret, networkId } = getCdpEnvironment();
    
    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      throw new Error('Missing required CDP credentials for wallet retrieval');
    }
    
    // Configuration for CDP wallet provider with existing wallet
    const config = {
      apiKeyId,
      apiKeySecret,
      walletSecret,
      networkId,
      address: walletData.address, // For existing wallet, pass address directly
    };
    
    console.log(`Creating CDP wallet provider with existing address: ${walletData.address.substring(0, 8)}...`);
    
    // Create and initialize wallet provider
    const provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    
    // Verify the wallet is working
    const address = await provider.getAddress();
    console.log(`Provider created for existing wallet ${userId} with address: ${address}`);
    
    // Cache the provider for future use
    walletCache.set(userId, provider);
    
    // Register with AgentKit
    await registerUserWallet(userId, provider);
    
    return provider;
  } catch (error) {
    console.error(`Failed to get wallet provider for user ${userId}:`, error);
    return null;
  }
}

/**
 * Gets or creates a wallet for a user
 * @param userId Unique identifier for the user
 * @returns The wallet provider and a boolean indicating if it was newly created
 */
export async function getOrCreateWallet(userId: string): Promise<{ provider: WalletProvider; created: boolean }> {
  try {
    // Check if wallet exists
    const existingProvider = await getWalletProvider(userId);
    if (existingProvider) {
      return { provider: existingProvider, created: false };
    }
    
    // Check if we should allow wallet creation based on cooldown
    const canCreate = await shouldAllowWalletCreation(userId);
    if (!canCreate) {
      throw new Error('Wallet creation currently rate-limited for this user');
    }
    
    // Record the attempt
    await recordWalletCreationAttempt(userId);
    
    // Create new wallet
    const provider = await createDirectWalletProvider(userId);
    
    // Store wallet in database
    const address = await provider.getAddress();
    await storeWalletInDb(userId, address);
    
    return { provider, created: true };
  } catch (error) {
    console.error(`Failed to get or create wallet for user ${userId}:`, error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Stores a wallet address in the database
 * @param userId Unique identifier for the user
 * @param address Wallet address to store
 * @returns True if successful, false otherwise
 */
export async function storeWalletInDb(userId: string, address: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        address: address,
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error(`Error storing wallet for user ${userId}:`, error);
      return false;
    }
    
    console.log(`Wallet stored in DB for user ${userId} with address ${address}`);
    return true;
  } catch (error) {
    console.error(`Exception storing wallet in DB for user ${userId}:`, error);
    return false;
  }
}

/**
 * Retrieves a wallet from the database
 * @param userId Unique identifier for the user
 * @returns Wallet data or null if not found
 */
export async function getWalletFromDb(userId: string): Promise<{ address: string } | null> {
  try {
    const { data, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      console.error(`Error retrieving wallet for user ${userId}:`, error);
      return null;
    }
    
    if (!data) {
      console.log(`No wallet found in database for user ${userId}`);
      return null;
    }
    
    return { address: data.address };
  } catch (error) {
    console.error(`Exception retrieving wallet from DB for user ${userId}:`, error);
    return null;
  }
}