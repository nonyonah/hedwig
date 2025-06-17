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

// Singleton instance
let agentKitInstance: AgentKit | null = null;
let walletProvider: WalletProvider | null = null;

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
 * Creates a new PrivyEvmWalletProvider
 * @returns A configured PrivyEvmWalletProvider instance
 */
async function createWalletProvider(): Promise<WalletProvider> {
  try {
    // Get environment variables for Privy configuration
    const { appId, appSecret } = getPrivyEnvironment();
    
    if (!appId || !appSecret) {
      throw new Error('Missing required Privy credentials (PRIVY_APP_ID or PRIVY_APP_SECRET)');
    }
    
    console.log('Privy environment loaded for AgentKit:', {
      appId: appId ? appId.substring(0, Math.min(5, appId.length)) + '...' : 'MISSING',
      appSecret: appSecret ? 'PRESENT' : 'MISSING',
    });
    
    // Use a simple, fixed private key for development
    const privateKey = '0x' + '1'.repeat(64);
    
    const config = {
      appId,
      appSecret,
      privateKey,
      chainId: BASE_SEPOLIA_CONFIG.chainId,
      rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl
    };
    
    console.log('Initializing AgentKit wallet with config:', {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
    });
    
    const provider = await PrivyEvmWalletProvider.configureWithWallet(config);
    
    // Verify the wallet is working
    const address = await provider.getAddress();
    console.log(`AgentKit wallet provider initialized with address: ${address}`);
    
    return provider;
  } catch (error) {
    console.error('Failed to initialize Privy wallet provider:', error);
    throw new Error(`Privy wallet provider initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initializes and returns a singleton instance of AgentKit.
 * Uses environment variables for API key configuration.
 */
export async function getAgentKit(): Promise<AgentKit> {
  if (agentKitInstance) {
    return agentKitInstance;
  }

  try {
    // Initialize wallet provider first if not already done
    if (!walletProvider) {
      try {
        walletProvider = await createWalletProvider();
      } catch (walletError) {
        console.error('Failed to create regular wallet provider, trying direct method:', walletError);
        try {
          // Import the direct wallet provider function
          const { createDirectWalletProvider } = await import('./wallet');
          console.log('FALLBACK: Using direct wallet provider with hardcoded values');
          walletProvider = await createDirectWalletProvider();
          console.log('Successfully created direct wallet provider');
        } catch (directError) {
          console.error('Both wallet initialization methods failed:', directError);
          throw new Error(`All wallet provider creation methods failed: ${directError instanceof Error ? directError.message : String(directError)}`);
        }
      }
    }

    // Initialize AgentKit with the wallet provider and action providers
    try {
      const actionProviders = [
        // ERC20 token operations
        erc20ActionProvider(),
        
        // ERC721 (NFT) operations
        erc721ActionProvider(),
        
        // Basic wallet operations
        walletActionProvider()
        
        // Note: We're not using the custom faucet action provider due to TypeScript issues
        // Instead, we'll extend the wallet actions in future when the AgentKit API is clearer
      ];
      
      console.log('Initializing AgentKit with action providers:', 
        actionProviders.map(provider => provider.name));
      
      // AgentKit.from expects walletProvider to be non-null
      if (!walletProvider) {
        throw new Error('Wallet provider is null. Cannot initialize AgentKit.');
      }
      
      agentKitInstance = await AgentKit.from({
        walletProvider,
        actionProviders,
      });
      
      // Verify AgentKit is working by getting available actions
      const actions = await agentKitInstance.getActions();
      console.log(`AgentKit initialized with ${actions.length} available actions`);
      
      // TODO: After initialization, find a way to add custom actions
      console.log("Note: Custom faucet actions will be implemented in a future update");
      
      return agentKitInstance;
    } catch (agentKitError) {
      console.error('Failed to initialize AgentKit:', agentKitError);
      throw new Error(`AgentKit initialization failed: ${agentKitError instanceof Error ? agentKitError.message : String(agentKitError)}`);
    }
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
