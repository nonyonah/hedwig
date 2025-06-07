import { AgentKit, Action } from '@coinbase/agentkit'; 
import { z, ZodType, ZodTypeDef } from 'zod';

// Singleton AgentKit instance
let agentKitInstance: AgentKit | null = null;

/**
 * Initializes and returns a singleton instance of AgentKit.
 * Uses environment variables for API key configuration.
 */
export async function getAgentKit(): Promise<AgentKit> {
  if (agentKitInstance) {
    return agentKitInstance;
  }
  if (!process.env.CDP_API_KEY_NAME || !process.env.CDP_API_KEY_PRIVATE_KEY) {
    throw new Error('Missing required environment variables: CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY');
  }
  try {
    agentKitInstance = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
    });
    return agentKitInstance;
  } catch (error) {
    console.error('Failed to initialize AgentKit:', error);
    throw new Error(`AgentKit initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

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

// --- Action Wrapper Functions ---

export async function getWalletBalance(address?: string) {
  const action = await findAgentActionByName('get_wallet_balance');
  if (!action) {
    throw new Error('Action "get_wallet_balance" not found. Ensure it is registered in your agent configuration.');
  }
  const params: Record<string, any> = {};
  if (address) {
    params.address = address;
  }
  // Optionally validate params: action.schema.parse(params);
  return await action.invoke(params);
}

export async function transferNativeTokens(to: string, amount: string) {
  const action = await findAgentActionByName('transfer_native_token');
  if (!action) {
    throw new Error('Action "transfer_native_token" not found. Ensure it is registered in your agent configuration.');
  }
  // Optionally validate params: action.schema.parse({ to, amount });
  return await action.invoke({ to, amount });
}

export async function getTransactionDetails(txHash: string) {
  const action = await findAgentActionByName('get_transaction_details');
  if (!action) {
    throw new Error('Action "get_transaction_details" not found. Ensure it is registered in your agent configuration.');
  }
  // Optionally validate params: action.schema.parse({ txHash });
  return await action.invoke({ txHash });
}

export async function swapTokens(fromToken: string, toToken: string, amount: string) {
  const action = await findAgentActionByName('swap_token');
  if (!action) {
    throw new Error('Action "swap_token" not found. Ensure it is registered in your agent configuration.');
  }
  // Optionally validate params: action.schema.parse({ fromToken, toToken, amount });
  return await action.invoke({ fromToken, toToken, amount });
}

/**
 * Returns a URL to Thirdweb Pay for manual payment input.
 * This function does NOT interact with AgentKit.
 */
export function getThirdwebPayLink(): string {
  return 'https://thirdweb.com/pay';
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
