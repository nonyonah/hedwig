import { randomUUID } from 'crypto';
import { CdpV2EvmWalletProvider, WalletProvider } from '@coinbase/agentkit';
import { registerUserWallet } from './agentkit';
import { getCdpEnvironment } from './serverEnv';
import { supabase } from './supabaseClient';
import { shouldAllowWalletCreation, recordWalletCreationAttempt } from '@/pages/api/_walletUtils';
import { formatTokenBalance } from './utils';
import { v4 as uuidv4 } from 'uuid';

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

// List of supported tokens with their contract addresses by chain
export const SUPPORTED_TOKENS = {
  base: {
    ETH: { address: 'native', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    USDT: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 6, symbol: 'USDT', name: 'Tether USD' },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI', name: 'Dai Stablecoin' }
  },
  optimism: {
    ETH: { address: 'native', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6, symbol: 'USDT', name: 'Tether USD' },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, symbol: 'DAI', name: 'Dai Stablecoin' }
  }
};

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
    
    // Check if the wallet already exists in the database first
    const existingWallet = await getWalletFromDb(userId);
    if (existingWallet) {
      console.log(`Wallet already exists in DB for user ${userId} with address ${existingWallet.address}`);
      console.log(`Using existing wallet instead of creating a new one`);
      
      // Use the existing wallet configuration
      const config = {
        apiKeyId,
        apiKeySecret,
        walletSecret,
        networkId,
        address: existingWallet.address,
      };
      
      try {
        // Create provider with existing wallet
        const provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
        
        // Verify the wallet is working
        const address = await provider.getAddress();
        console.log(`Provider created for existing wallet ${userId} with address: ${address}`);
        
        // Verify the address matches what we have in the database
        if (address.toLowerCase() !== existingWallet.address.toLowerCase()) {
          console.error(`Address mismatch for user ${userId}! DB: ${existingWallet.address}, Provider: ${address}`);
          throw new Error('Wallet address mismatch - possible wallet recreation issue');
        }
        
        // Cache the provider for future use
        walletCache.set(userId, provider);
        
        // Register with AgentKit
        await registerUserWallet(userId, provider);
        
        return provider;
      } catch (error) {
        console.error(`Error creating provider for existing wallet: ${error}`);
        throw error;
      }
    }
    
    // If no existing wallet, create a new one with a standard UUID v4 idempotency key
    let idempotencyKey = uuidv4();
    console.log(`[CDP] Generated idempotency key for wallet creation: ${idempotencyKey.substring(0, 8)}... (length: ${idempotencyKey.length})`);
    
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
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        console.log(`Attempting to create wallet (attempt ${retryCount + 1}/${maxRetries + 1})`);
        provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
        break; // Success, exit the retry loop
      } catch (error) {
        console.error(`CDP wallet provider initialization error (attempt ${retryCount + 1}):`, error);
        
        if (error instanceof Error && error.message.includes('idempotency')) {
          if (retryCount < maxRetries) {
            retryCount++;
            // Generate a new UUID v4 idempotency key
            config.idempotencyKey = uuidv4();
            console.log(`Retrying with new idempotency key: ${config.idempotencyKey.substring(0, 8)}... (length: ${config.idempotencyKey.length})`);
            continue; // Retry with new key
          }
        }
        // If not an idempotency error or max retries reached, rethrow
        throw error;
      }
    }

    if (!provider) {
      throw new Error('Failed to create wallet provider after multiple attempts');
    }
    
    // Verify the wallet is working
    const address = await provider.getAddress();
    console.log(`Wallet created successfully for ${userId} with address: ${address}`);
    
    // Store the wallet address in the database immediately
    try {
      await storeWalletInDb(userId, address);
      console.log(`Wallet address ${address} stored in database for user ${userId}`);
    } catch (storeError) {
      console.error(`Error storing wallet address in database: ${storeError}`);
      // Continue even if storing fails - we'll try again later
    }
    
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
    console.log(`[CDP] Checking if user ${userId} has a wallet in database`);
    
    // First, find the user's UUID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', userId)
      .single();
    
    if (userError || !user) {
      console.log(`[CDP] User ${userId} not found in database`);
      return false;
    }
    
    const userUuid = user.id;
    console.log(`[CDP] Found user ${userId} with UUID ${userUuid}`);
    
    // Now check if there's a wallet for this user
    const { data, error } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userUuid)
      .maybeSingle();
    
    if (error) {
      console.error(`[CDP] Error checking wallet:`, error);
      return false;
    }
    
    const hasWallet = !!data;
    console.log(`[CDP] User ${userId} ${hasWallet ? 'has' : 'does not have'} a wallet in database`);
    
    return hasWallet;
  } catch (error) {
    console.error(`[CDP] Exception checking wallet in DB:`, error);
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
    if (!walletData || !walletData.address) {
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
    
    console.log(`Creating CDP wallet provider with existing address: ${walletData.address.substring(0, 8)}...`);
    
    // Configuration for CDP wallet provider with existing wallet
    const config = {
      apiKeyId,
      apiKeySecret,
      walletSecret,
      networkId,
      address: walletData.address,
    };
    
    // Create provider with existing wallet
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
    console.error(`Error getting wallet provider for user ${userId}:`, error);
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
    console.log(`[CDP] Getting or creating wallet for user: ${userId}`);
    
    // First, check if wallet exists in the database
    const walletExists = await userHasWalletInDb(userId);
    
    if (walletExists) {
      console.log(`[CDP] Wallet exists in database for user: ${userId}, retrieving it`);
      
      // Try to get the existing wallet provider
      const existingProvider = await getWalletProvider(userId);
      
      if (existingProvider) {
        console.log(`[CDP] Successfully retrieved existing wallet provider for user: ${userId}`);
        
        // Verify the wallet provider works
        try {
          const address = await existingProvider.getAddress();
          console.log(`[CDP] Verified existing wallet with address: ${address}`);
          return { provider: existingProvider, created: false };
        } catch (verifyError) {
          console.error(`[CDP] Error verifying existing wallet provider:`, verifyError);
          console.log(`[CDP] Will attempt to recreate wallet provider`);
          // Continue to wallet creation
        }
      } else {
        console.warn(`[CDP] Failed to retrieve existing wallet provider despite wallet existing in DB`);
        // Continue to wallet creation
      }
    }
    
    // Record the attempt - but continue even if this fails
    try {
      await recordWalletCreationAttempt(userId);
    } catch (recordError) {
      console.error(`[CDP] Error recording wallet creation attempt:`, recordError);
      // Continue with wallet creation even if recording fails
    }
    
    // Create or retrieve wallet using our enhanced provider function
    console.log(`[CDP] Creating wallet provider for user: ${userId}`);
    const provider = await createDirectWalletProvider(userId);
    
    // Get the wallet address
    const address = await provider.getAddress();
    console.log(`[CDP] Got wallet with address ${address} for user: ${userId}`);
    
    // Check if this wallet already exists in the database
    const existingWallet = await getWalletFromDb(userId);
    let isNewWallet = true;
    
    if (existingWallet) {
      if (existingWallet.address.toLowerCase() === address.toLowerCase()) {
        console.log(`[CDP] Wallet address ${address} already exists in database`);
        isNewWallet = false;
      } else {
        console.warn(`[CDP] Different wallet address found in database. DB: ${existingWallet.address}, New: ${address}`);
        // Update the wallet address in the database
        try {
          await storeWalletInDb(userId, address);
          console.log(`[CDP] Updated wallet address in database for user: ${userId}`);
        } catch (updateError) {
          console.error(`[CDP] Error updating wallet address in database:`, updateError);
        }
      }
    }
    
    // Store wallet in database if it's new
    if (isNewWallet) {
      try {
        await storeWalletInDb(userId, address);
        console.log(`[CDP] New wallet address ${address} stored in database`);
      } catch (storeError) {
        console.error(`[CDP] Error storing wallet in database:`, storeError);
        // Continue even if storing fails - the wallet was created successfully
      }
    }
    
    return { provider, created: isNewWallet };
  } catch (error) {
    console.error(`[CDP] Failed to get or create wallet:`, error);
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

/**
 * Gets the wallet balance and token balances for a user
 * @param userId Unique identifier for the user
 * @returns Object containing wallet address, native balance, and token balances
 */
export async function getWalletBalances(userId: string): Promise<{
  address: string;
  network: string;
  nativeBalance: string;
  tokens: Array<{
    symbol: string;
    name: string;
    balance: string;
    formattedBalance: string;
  }>;
} | null> {
  try {
    // Get wallet provider
    const provider = await getWalletProvider(userId);
    if (!provider) {
      console.log(`No wallet provider found for user ${userId}`);
      return null;
    }

    // Get wallet address
    const address = await provider.getAddress();
    
    // Get network ID from environment
    const { networkId } = getCdpEnvironment();
    const network = networkId === 'base-mainnet' || networkId === 'base-sepolia'
      ? 'base'
      : networkId === 'optimism-mainnet'
      ? 'optimism'
      : 'unknown';
    // Add log to confirm invocation and show networkId/network
    console.log(`[CDP] getWalletBalances called for user ${userId} with networkId: ${networkId}, mapped network: ${network}`);
    
    // Get native balance
    const nativeBalanceRaw = await provider.getBalance();
    const nativeBalance = nativeBalanceRaw.toString();
    
    // Get token balances for supported tokens on this network
    const tokens = [];
    if (network in SUPPORTED_TOKENS) {
      const networkTokens = SUPPORTED_TOKENS[network as keyof typeof SUPPORTED_TOKENS];
      
      for (const [symbol, tokenInfo] of Object.entries(networkTokens)) {
        if (symbol === 'ETH') continue; // Skip ETH as we already have native balance
        
        try {
          const balance = await provider.getBalance();
          const balanceStr = balance.toString();
          const formattedBalance = formatTokenBalance(balanceStr, tokenInfo.decimals);
          tokens.push({
            symbol,
            name: tokenInfo.name,
            balance: balanceStr,
            formattedBalance
          });
        } catch (error) {
          console.error(`Error getting balance for ${symbol}:`, error);
        }
      }
    }
    
    // Add logging here
    console.log(`[CDP] getWalletBalances for user ${userId}:`, {
      address,
      network,
      nativeBalance,
      tokens
    });
    return {
      address,
      network,
      nativeBalance,
      tokens
    };
  } catch (error) {
    console.error(`Error getting wallet balances for user ${userId}:`, error);
    return null;
  }
}