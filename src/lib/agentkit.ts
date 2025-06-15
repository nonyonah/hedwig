import { 
  AgentKit, 
  Action, 
  CdpV2EvmWalletProvider,
  erc20ActionProvider,
  erc721ActionProvider,
  walletActionProvider
} from '@coinbase/agentkit';
import { z, ZodType, ZodTypeDef } from 'zod';
import { getRequiredEnvVar } from './envUtils';
import { loadServerEnvironment, getCdpEnvironment } from './serverEnv';
import { randomUUID } from 'crypto';

// Ensure environment variables are loaded
loadServerEnvironment();

// Singleton instance
let agentKitInstance: AgentKit | null = null;
let walletProvider: CdpV2EvmWalletProvider | null = null;

// Base Sepolia testnet configuration
const BASE_SEPOLIA_CONFIG = {
  chainId: 84532, // Base Sepolia testnet chain ID
  rpcUrl: "https://sepolia.base.org", // Base Sepolia RPC URL
};

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
 * Creates a new CDP wallet provider
 * @returns A configured CDP wallet provider
 */
async function createWalletProvider(): Promise<CdpV2EvmWalletProvider> {
  const cdpEnv = getCdpEnvironment();
  console.log('CDP environment loaded for AgentKit:', {
    apiKeyId: cdpEnv.apiKeyId ? 'PRESENT' : 'MISSING',
    apiKeySecret: cdpEnv.apiKeySecret ? 'PRESENT' : 'MISSING',
    walletSecret: cdpEnv.walletSecret ? 'PRESENT' : 'MISSING',
    networkId: cdpEnv.networkId
  });
  
  // Generate a proper idempotency key for wallet configuration
  const idempotencyKey = generateIdempotencyKey();
  console.log('AgentKit wallet idempotency key length:', idempotencyKey.length);
  
  const config = {
    apiKeyId: cdpEnv.apiKeyId,
    apiKeySecret: cdpEnv.apiKeySecret,
    walletSecret: cdpEnv.walletSecret,
    networkId: cdpEnv.networkId,
    idempotencyKey,
    walletType: 'v2',
    walletConfig: {
      // Explicitly set Base Sepolia testnet configuration
      chainId: BASE_SEPOLIA_CONFIG.chainId,
      rpcUrl: BASE_SEPOLIA_CONFIG.rpcUrl,
    }
  };
  
  console.log('Initializing AgentKit wallet with config:', {
    networkId: config.networkId,
    chainId: config.walletConfig.chainId,
    rpcUrl: config.walletConfig.rpcUrl,
  });
  
  try {
    const provider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    
    // Verify the wallet is working
    const address = await provider.getAddress();
    console.log(`AgentKit wallet provider initialized with address: ${address}`);
    
    return provider;
  } catch (error) {
    console.error('Failed to initialize CDP wallet provider:', error);
    throw new Error(`CDP wallet provider initialization failed: ${error instanceof Error ? error.message : String(error)}`);
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
      ];
      
      console.log('Initializing AgentKit with action providers:', 
        actionProviders.map(provider => provider.name));
      
      agentKitInstance = await AgentKit.from({
        walletProvider,
        actionProviders,
      });
      
      // Verify AgentKit is working by getting available actions
      const actions = await agentKitInstance.getActions();
      console.log(`AgentKit initialized with ${actions.length} available actions`);
      
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
