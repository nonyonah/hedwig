import { 
  AgentKit, 
  Action, 
  PrivyEvmWalletProvider,
  erc20ActionProvider,
  erc721ActionProvider,
  walletActionProvider,
  WalletProvider
} from '@coinbase/agentkit';
import { z, ZodType, ZodTypeDef } from 'zod';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getPrivyEnvironment } from './serverEnv';
import { randomUUID } from 'crypto';
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
  chainId: "84532", // Base Sepolia testnet chain ID (as string for Privy)
  rpcUrl: "https://sepolia.base.org", // Base Sepolia RPC URL
};

// Base Sepolia faucet URL
const BASE_SEPOLIA_FAUCET_URL = "https://faucet.base.org";

/**
 * Generates a unique idempotency key that meets CDP requirements (minimum 36 characters)
 * @returns A unique idempotency key
 */
function generateIdempotencyKey(): string {
  // Generate a UUID (36 characters) and combine with timestamp
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  // Ensure the key is truly unique and long enough
  return `${uuid}-agentkit-${timestamp}`;
}

/**
 * Get a WalletProvider for a specific user
 * This only returns an existing wallet provider or the default one
 * It will NOT create a new wallet for the user
 * @param userId User identifier (e.g., phone number)
 * @returns A wallet provider for the user or null if it doesn't exist
 */
export async function getUserWalletProvider(userId?: string): Promise<WalletProvider | null> {
  if (userId && userWallets.has(userId)) {
    // Return the user-specific wallet provider if it exists
    console.log(`[AgentKit] Using existing wallet provider for user ${userId}`);
    return userWallets.get(userId)!;
  }
  
  // Return the default wallet provider for system operations
  // or create one if needed
  if (!defaultWalletProvider) {
    try {
      defaultWalletProvider = await createDefaultWalletProvider();
    } catch (error) {
      console.error('Failed to create default wallet provider:', error);
      return null;
    }
  }
  
  return defaultWalletProvider;
}

/**
 * Register a user's wallet provider for persistence
 * @param userId User identifier (e.g., phone number)
 * @param provider The wallet provider to associate with this user
 */
export function registerUserWallet(userId: string, provider: WalletProvider): void {
  if (!userId) {
    console.error('[AgentKit] Cannot register wallet: Missing userId');
    return;
  }
  
  if (!provider) {
    console.error('[AgentKit] Cannot register wallet: Missing wallet provider');
    return;
  }
  
  // Store the wallet provider in the map
  userWallets.set(userId, provider);
  
  // Log registration success with cache stats
  console.log(`[AgentKit] Registered wallet provider for user ${userId}`);
  console.log(`[AgentKit] Current wallet registry contains ${userWallets.size} wallet(s)`);
  console.log(`[AgentKit] Registered users: ${Array.from(userWallets.keys()).join(', ')}`);
  
  // Verify the wallet is working - use an async IIFE to handle the promise
  (async () => {
    try {
      const address = await provider.getAddress();
      console.log(`[AgentKit] Verified wallet for user ${userId} with address ${address}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AgentKit] Warning: Registered wallet for ${userId} may not be valid: ${errorMessage}`);
    }
  })().catch(err => {
    console.error('[AgentKit] Unexpected error during wallet verification:', err);
  });
}

/**
 * Creates a default wallet provider that's only used for system operations
 * @returns A configured PrivyEvmWalletProvider instance
 */
async function createDefaultWalletProvider(): Promise<WalletProvider> {
  try {
    // Get environment variables for Privy configuration
    const { appId, appSecret } = getPrivyEnvironment();
    
    if (!appId || !appSecret) {
      throw new Error('Missing required Privy credentials (PRIVY_APP_ID or PRIVY_APP_SECRET)');
    }
    
    console.log('Privy environment loaded for default wallet provider:', {
      appId: appId ? appId.substring(0, Math.min(5, appId.length)) + '...' : 'MISSING',
      appSecret: appSecret ? 'PRESENT' : 'MISSING',
    });
    
    // Use a simple, fixed private key for the default wallet
    const privateKey = '0x' + '1'.repeat(64);
    
    const config = {
      appId,
      appSecret,
      privateKey,
      chainId: BASE_SEPOLIA_CONFIG.chainId,
      rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl
    };
    
    console.log('Initializing default wallet provider with config:', {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
    });
    
    const provider = await PrivyEvmWalletProvider.configureWithWallet(config);
    
    // Verify the wallet is working
    const address = await provider.getAddress();
    console.log(`Default wallet provider initialized with address: ${address}`);
    
    return provider;
  } catch (error) {
    console.error('Failed to initialize default wallet provider:', error);
    throw new Error(`Default wallet provider initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initializes and returns a singleton instance of AgentKit.
 * Uses environment variables for API key configuration.
 * @param userId Optional user ID to use their specific wallet
 */
export async function getAgentKit(userId?: string): Promise<AgentKit> {
  // If we already have an AgentKit instance and no specific user,
  // return the singleton instance
  if (agentKitInstance && !userId) {
    return agentKitInstance;
  }

  try {
    // Get the appropriate wallet provider for this user
    // or use the default wallet provider
    const walletProvider = await getUserWalletProvider(userId);
    
    if (!walletProvider) {
      throw new Error('Could not obtain a valid wallet provider');
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
    
    console.log('Initializing AgentKit with action providers:', 
      actionProviders.map(provider => provider.name));
    
    const newAgentKitInstance = await AgentKit.from({
      walletProvider,
      actionProviders,
    });
    
    // Verify AgentKit is working by getting available actions
    const actions = await newAgentKitInstance.getActions();
    console.log(`AgentKit initialized with ${actions.length} available actions` + 
      (userId ? ` for user ${userId}` : ' (default instance)'));
    
    // If this is the default instance (no userId), save it as singleton
    if (!userId) {
      agentKitInstance = newAgentKitInstance;
    }
    
    return newAgentKitInstance;
  } catch (error) {
    console.error('Failed to initialize AgentKit:', error);
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
