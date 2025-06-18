import { 
  AgentKit, 
  Action, 
  CdpV2EvmWalletProvider,
  erc20ActionProvider,
  erc721ActionProvider,
  walletActionProvider,
  WalletProvider
} from '@coinbase/agentkit';
import { z, ZodType, ZodTypeDef } from 'zod';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

// Ensure environment variables are loaded
loadServerEnvironment();

// Singleton instances
let agentKitInstance: AgentKit | null = null;
let defaultWalletProvider: WalletProvider | null = null;

// Map of user wallets for persistence
// Key is userId (typically phone number), value is the wallet provider
const userWallets: Map<string, WalletProvider> = new Map();

// Base Sepolia testnet configuration
const BASE_SEPOLIA_CONFIG = {
  networkId: "base-sepolia", // Base Sepolia testnet network ID for CDP
};

// Base Sepolia faucet URL
const BASE_SEPOLIA_FAUCET_URL = "https://faucet.base.org";

/**
 * Generates a unique idempotency key that meets CDP requirements (exactly 36 characters)
 * @returns A unique idempotency key
 */
function generateIdempotencyKey(): string {
  // Use uuid v4 which generates a 36-character string (including hyphens)
  // This is the exact length required by CDP
  return uuidv4();
}

/**
 * Get a WalletProvider for a specific user
 * This only returns an existing wallet provider or the default one
 * It will NOT create a new wallet for the user
 * @param userId User identifier (e.g., phone number)
 * @returns A wallet provider for the user or null if it doesn't exist
 */
export async function getUserWalletProvider(userId?: string): Promise<WalletProvider | null> {
  try {
    if (userId && userWallets.has(userId)) {
      // Return the user-specific wallet provider if it exists
      console.log(`[AgentKit] Using existing wallet provider for user ${userId}`);
      return userWallets.get(userId)!;
    }
    
    // Return the default wallet provider for system operations
    // or create one if needed
    if (!defaultWalletProvider) {
      try {
        console.log('[AgentKit] Creating default wallet provider...');
        defaultWalletProvider = await createDefaultWalletProvider();
        console.log('[AgentKit] Default wallet provider created successfully');
      } catch (error) {
        console.error('[AgentKit] Failed to create default wallet provider:', error);
        
        // Try one more time with a new idempotency key
        try {
          console.log('[AgentKit] Retrying default wallet provider creation...');
          defaultWalletProvider = await createDefaultWalletProvider();
          console.log('[AgentKit] Default wallet provider created successfully on retry');
        } catch (retryError) {
          console.error('[AgentKit] Failed to create default wallet provider on retry:', retryError);
          return null;
        }
      }
    }
    
    if (!defaultWalletProvider) {
      console.error('[AgentKit] Default wallet provider is null after initialization attempts');
      return null;
    }
    
    // Verify the wallet provider is working
    try {
      const address = await defaultWalletProvider.getAddress();
      console.log(`[AgentKit] Default wallet provider verified with address: ${address}`);
    } catch (verifyError) {
      console.error('[AgentKit] Failed to verify default wallet provider:', verifyError);
      defaultWalletProvider = null;
      return null;
    }
    
    return defaultWalletProvider;
  } catch (error) {
    console.error('[AgentKit] Unexpected error in getUserWalletProvider:', error);
    return null;
  }
}

/**
 * Registers a user's wallet provider for persistence
 * @param userId The user identifier
 * @param provider The wallet provider
 */
export async function registerUserWallet(userId: string, provider: any): Promise<void> {
  try {
    if (!userId) {
      console.error('[AgentKit] Cannot register wallet: Missing userId');
      throw new Error('Missing userId for wallet registration');
    }
    
    if (!provider) {
      console.error('[AgentKit] Cannot register wallet: Missing provider');
      throw new Error('Missing provider for wallet registration');
    }
    
    console.log(`[AgentKit] Registering wallet for user ${userId}`);
    userWallets.set(userId, provider);
    
    // Log the current wallet registry state
    console.log(`[AgentKit] Wallet registry now contains ${userWallets.size} wallet(s)`);
    console.log(`[AgentKit] Registered users: ${Array.from(userWallets.keys()).join(', ')}`);
    
    // Verify the wallet was registered correctly
    console.log(`[AgentKit] Verifying wallet registration for user ${userId}`);
    const registeredProvider = userWallets.get(userId);
    if (!registeredProvider) {
      console.error(`[AgentKit] Failed to verify wallet registration for user ${userId}`);
      throw new Error(`Failed to register wallet for user ${userId}`);
    }
    
    // Verify the wallet address
    try {
      const address = await provider.getAddress();
      console.log(`[AgentKit] Successfully registered wallet for user ${userId} with address ${address}`);
      
      // Double-check by retrieving from the registry
      const registeredAddress = await registeredProvider.getAddress();
      if (address !== registeredAddress) {
        console.warn(`[AgentKit] Wallet address mismatch for user ${userId}: original=${address}, registered=${registeredAddress}`);
      } else {
        console.log(`[AgentKit] Wallet address verified for user ${userId}: ${address}`);
      }
    } catch (error) {
      console.error(`[AgentKit] Error verifying wallet address:`, error);
    }
  } catch (error) {
    console.error('[AgentKit] Error in registerUserWallet:', error);
    throw error;
  }
}

/**
 * Creates a default wallet provider that's only used for system operations
 * @returns A configured CdpV2EvmWalletProvider instance
 */
async function createDefaultWalletProvider(): Promise<WalletProvider> {
  try {
    // Get required CDP environment variables
    const { apiKeyId, apiKeySecret, walletSecret, networkId } = getCdpEnvironment();
    
    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      console.error('[AgentKit] Missing required CDP credentials');
      throw new Error('Missing required CDP credentials (CDP_API_KEY_ID, CDP_API_KEY_SECRET, or CDP_WALLET_SECRET)');
    }
    
    console.log('[AgentKit] CDP environment loaded for default wallet provider:', {
      apiKeyId: apiKeyId ? apiKeyId.substring(0, Math.min(5, apiKeyId.length)) + '...' : 'MISSING',
      apiKeySecret: apiKeySecret ? 'PRESENT' : 'MISSING',
      walletSecret: walletSecret ? 'PRESENT' : 'MISSING',
      networkId: networkId || 'MISSING'
    });
    
    // Generate a proper idempotency key that meets the exact 36-character requirement
    const idempotencyKey = generateIdempotencyKey();
    console.log(`[AgentKit] Generated idempotency key for default wallet: ${idempotencyKey} (length: 36)`);
    
    // Configuration for CDP wallet provider
    const config = {
      apiKeyId,
      apiKeySecret,
      walletSecret,
      networkId: networkId || BASE_SEPOLIA_CONFIG.networkId, // Ensure we have a fallback
      idempotencyKey,
    };
    
    console.log('[AgentKit] Initializing default CDP wallet provider with config:', {
      networkId: config.networkId,
      idempotencyKey: config.idempotencyKey,
      apiKeyIdPrefix: apiKeyId.substring(0, 6) + '...',
    });
    
    // Create and initialize wallet provider with detailed error handling
    let provider;
    try {
      provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    } catch (error) {
      console.error('[AgentKit] CDP default wallet provider initialization error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('idempotency')) {
          // If there's an idempotency key issue, try with a new key
          console.log('[AgentKit] Retrying with a new idempotency key due to idempotency error');
          config.idempotencyKey = generateIdempotencyKey();
          console.log(`[AgentKit] New idempotency key: ${config.idempotencyKey} (length: 36)`);
          provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
    
    if (!provider) {
      console.error('[AgentKit] Provider is null after initialization');
      throw new Error('Failed to initialize wallet provider: provider is null');
    }
    
    // Verify the wallet is working
    try {
      const address = await provider.getAddress();
      console.log(`[AgentKit] Default CDP wallet provider initialized with address: ${address}`);
    } catch (addressError) {
      console.error('[AgentKit] Failed to get wallet address:', addressError);
      throw new Error(`Wallet provider initialization failed: could not get wallet address: ${addressError instanceof Error ? addressError.message : String(addressError)}`);
    }
    
    return provider;
  } catch (error) {
    console.error('[AgentKit] Failed to initialize default wallet provider:', error);
    throw new Error(`Default wallet provider initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initializes and returns a singleton instance of AgentKit.
 * Uses environment variables for API key configuration.
 * @param userId Optional user ID to use their specific wallet
 */
export async function getAgentKit(userId?: string): Promise<AgentKit> {
  try {
    // If we already have an AgentKit instance and no specific user,
    // return the singleton instance
    if (agentKitInstance && !userId) {
      console.log('[AgentKit] Using existing AgentKit instance');
      return agentKitInstance;
    }

    console.log(`[AgentKit] Initializing AgentKit${userId ? ` for user ${userId}` : ''}`);

    // Get the appropriate wallet provider for this user
    // or use the default wallet provider
    console.log(`[AgentKit] Getting wallet provider${userId ? ` for user ${userId}` : ''}`);
    const walletProvider = await getUserWalletProvider(userId);
    
    if (!walletProvider) {
      console.error('[AgentKit] Failed to obtain a valid wallet provider');
      throw new Error('Could not obtain a valid wallet provider');
    }

    // Verify the wallet provider is functional
    try {
      const address = await walletProvider.getAddress();
      console.log(`[AgentKit] Wallet provider verified with address: ${address}`);
    } catch (error) {
      console.error('[AgentKit] Wallet provider verification failed:', error);
      throw new Error(`Wallet provider verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Initialize AgentKit with the wallet provider and action providers
    const actionProviders = [
      // ERC20 token operations
      erc20ActionProvider(),
      
      // ERC721 (NFT) operations
      erc721ActionProvider(),
      
      // Basic wallet operations
      walletActionProvider()
    
      // Note: We're not using the custom faucet action provider due to TypeScript issues
    ];
    
    console.log('[AgentKit] Initializing AgentKit with action providers:', 
      actionProviders.map(provider => provider.name));
    
    let newAgentKitInstance: AgentKit;
    try {
      newAgentKitInstance = await AgentKit.from({
        walletProvider,
        actionProviders,
      });
    } catch (error) {
      console.error('[AgentKit] Failed to initialize AgentKit instance:', error);
      throw new Error(`AgentKit initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    if (!newAgentKitInstance) {
      console.error('[AgentKit] AgentKit instance is null after initialization');
      throw new Error('AgentKit initialization failed: instance is null');
    }
    
    // Verify AgentKit is working by getting available actions
    try {
      const actions = await newAgentKitInstance.getActions();
      console.log(`[AgentKit] AgentKit initialized with ${actions.length} available actions` + 
        (userId ? ` for user ${userId}` : ' (default instance)'));
    } catch (error) {
      console.error('[AgentKit] Failed to get actions from AgentKit:', error);
      throw new Error(`AgentKit verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // If this is the default instance (no userId), save it as singleton
    if (!userId) {
      agentKitInstance = newAgentKitInstance;
    }
    
    return newAgentKitInstance;
  } catch (error) {
    console.error('[AgentKit] Failed to initialize AgentKit:', error);
    throw new Error(`AgentKit initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Action Handlers
 */

/**
 * Fetches the list of available actions from AgentKit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAvailableAgentActions(): Promise<Action<ZodType<any, ZodTypeDef, any>>[]> {
  const agentKit = await getAgentKit();
  return agentKit.getActions();
}


// --- Zod Schemas for Action Inputs (as defined in your project) ---
// These should match the input schemas of your registered agent actions.

export const WalletBalanceSchema = z.object({
  address: z.string().describe('The wallet address to check balance for (optional, defaults to agent wallet)')
});

export const TransferSchema = z.object({
  to: z.string().describe('The recipient address'),
  amount: z.string().describe('The amount to transfer (in native token units, e.g., wei for ETH)')
});

export const SwapSchema = z.object({
  fromToken: z.string().describe('The contract address of the token to swap from'),
  toToken: z.string().describe('The contract address of the token to swap to'),
  amount: z.string().describe('The amount of fromToken to swap (in its smallest unit)')
});

export const TransactionDetailsSchema = z.object({
  txHash: z.string().describe('The transaction hash to get details for')
});

// Schema for faucet request
export const FaucetRequestSchema = z.object({
  address: z.string().optional().describe('The wallet address to receive funds (defaults to user wallet)')
});
