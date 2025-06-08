import { 
  AgentKit, 
  Action, 
  CdpV2EvmWalletProvider,
  erc20ActionProvider,
  erc721ActionProvider,
  walletActionProvider,
  farcasterActionProvider,
  twitterActionProvider
} from '@coinbase/agentkit';
import { z, ZodType, ZodTypeDef } from 'zod';

// Singleton instance
let agentKitInstance: AgentKit | null = null;
let walletProvider: CdpV2EvmWalletProvider | null = null;

// Environment variable validation
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
      walletProvider = await CdpV2EvmWalletProvider.configureWithWallet({
        apiKeyId: getRequiredEnvVar('CDP_API_KEY_ID'),
        apiKeySecret: getRequiredEnvVar('CDP_API_KEY_SECRET'),
        networkId: process.env.NETWORK_ID || 'base-sepolia',
      });
    }

    // Initialize AgentKit with the wallet provider and action providers
    agentKitInstance = await AgentKit.from({
      walletProvider,
      actionProviders: [
        // ERC20 token operations
        erc20ActionProvider(),
        
        // ERC721 (NFT) operations
        erc721ActionProvider(),
        
        // Basic wallet operations
        walletActionProvider()
      ],
    });
    
    return agentKitInstance;
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
export async function getAvailableAgentActions(): Promise<Action<ZodType<any, ZodTypeDef, any>>[]> {
  const agentKit = await getAgentKit();
  return agentKit.getActions();
}

/**
 * Finds an action by its human-readable name.
 * @param name The name of the action to find (e.g., 'get_wallet_balance').
 */
async function findAgentActionByName(name: string): Promise<Action<ZodType<any, ZodTypeDef, any>> | undefined> {
  const actions = await getAvailableAgentActions();
  return actions.find(a => a.name === name);
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
