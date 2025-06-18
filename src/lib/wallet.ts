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
    
    // Generate a proper idempotency key
    const idempotencyKey = generateWalletIdempotencyKey(userId);
    console.log(`Generated idempotency key for user ${userId}: ${idempotencyKey.substring(0, 8)}...${idempotencyKey.substring(idempotencyKey.length - 8)} (length: ${idempotencyKey.length})`);
    
    // Configuration for CDP wallet provider
    const config = {
      apiKeyId,
      apiKeySecret,
      walletSecret,
      networkId,
      idempotencyKey,
    };
    
    console.log('Creating CDP wallet provider with config:', {
      networkId: config.networkId,
      idempotencyKeyLength: config.idempotencyKey.length,
      apiKeyIdPrefix: config.apiKeyId.substring(0, 6) + '...',
    });
    
    // Create and initialize wallet provider with detailed error handling
    let provider;
    try {
      provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    } catch (error) {
      console.error('CDP wallet provider initialization error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('idempotency')) {
          // If there's an idempotency key issue, try with a new key
          console.log('Retrying with a new idempotency key due to idempotency error');
          config.idempotencyKey = generateWalletIdempotencyKey(userId + Date.now().toString());
          console.log(`New idempotency key: ${config.idempotencyKey.substring(0, 8)}...${config.idempotencyKey.substring(config.idempotencyKey.length - 8)} (length: ${config.idempotencyKey.length})`);
          provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
    
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
    // Temporarily bypass rate limiting
    let canCreate = true;
    try {
      canCreate = await shouldAllowWalletCreation(userId);
      if (!canCreate) {
        console.log(`[Wallet] Rate limit detected for user ${userId}, but proceeding with wallet creation anyway`);
        // Temporarily bypass rate limiting
        canCreate = true;
      }
    } catch (rateError) {
      console.error(`[Wallet] Error checking rate limit for user ${userId}:`, rateError);
      // Proceed with wallet creation even if rate limit check fails
      canCreate = true;
    }
    
    // Record the attempt - but continue even if this fails
    try {
      await recordWalletCreationAttempt(userId);
    } catch (recordError) {
      console.error(`[Wallet] Error recording wallet creation attempt for user ${userId}:`, recordError);
      // Continue with wallet creation even if recording fails
    }
    
    // Create new wallet
    const provider = await createDirectWalletProvider(userId);
    
    // Store wallet in database
    const address = await provider.getAddress();
    
    // Try to store wallet but continue even if this fails
    try {
      await storeWalletInDb(userId, address);
    } catch (storeError) {
      console.error(`[Wallet] Error storing wallet in database for user ${userId}:`, storeError);
      // Continue even if storing fails - the wallet was created successfully
    }
    
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
    // First, ensure the user exists and get their UUID
    let userUuid: string | null = null;
    
    try {
      // Try to get the user's UUID from the database
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', userId)
        .single();
      
      if (error) {
        console.error(`[Wallet] Error getting user UUID for ${userId}:`, error);
        
        // Try to create the user
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([{ phone_number: userId }])
          .select('id')
          .single();
        
        if (insertError) {
          console.error(`[Wallet] Error creating user for ${userId}:`, insertError);
        } else if (newUser) {
          console.log(`[Wallet] Created user for ${userId} with UUID ${newUser.id}`);
          userUuid = newUser.id;
        }
      } else if (data) {
        console.log(`[Wallet] Found user for ${userId} with UUID ${data.id}`);
        userUuid = data.id;
      }
    } catch (userError) {
      console.error(`[Wallet] Exception getting/creating user for ${userId}:`, userError);
    }
    
    // If we couldn't get a UUID, try using the walletDb functions
    if (!userUuid) {
      console.log(`[Wallet] Couldn't get UUID for ${userId}, using walletDb functions`);
      try {
        const { storeWalletInDb: robustStoreWallet } = await import('./walletDb');
        return await robustStoreWallet(userId, address);
      } catch (fallbackError) {
        console.error(`[Wallet] Error using walletDb functions:`, fallbackError);
        return false;
      }
    }
    
    // Now store the wallet using the UUID
    console.log(`[Wallet] Storing wallet for user ${userId} (UUID: ${userUuid}) with address ${address}`);
    const { error } = await supabase
      .from('wallets')
      .insert({
        user_id: userUuid,
        address: address,
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error(`[Wallet] Error storing wallet for user ${userId}:`, error);
      
      // Try using the walletDb functions as a fallback
      try {
        console.log(`[Wallet] Trying walletDb functions as fallback`);
        const { storeWalletInDb: robustStoreWallet } = await import('./walletDb');
        return await robustStoreWallet(userId, address);
      } catch (fallbackError) {
        console.error(`[Wallet] Error using walletDb functions:`, fallbackError);
        return false;
      }
    }
    
    console.log(`[Wallet] Wallet stored in DB for user ${userId} with address ${address}`);
    return true;
  } catch (error) {
    console.error(`[Wallet] Exception storing wallet in DB for user ${userId}:`, error);
    
    // Try using the walletDb function as a fallback
    try {
      console.log(`[Wallet] Attempting fallback wallet storage for user ${userId}`);
      const { storeWalletInDb: robustStoreWallet } = await import('./walletDb');
      const result = await robustStoreWallet(userId, address);
      return result;
    } catch (fallbackError) {
      console.error(`[Wallet] Fallback wallet storage failed:`, fallbackError);
      return false;
    }
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