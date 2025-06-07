import { AgentKit } from '@coinbase/agentkit';
import { z } from 'zod';

// Singleton AgentKit instance
let agentKitInstance: AgentKit | null = null;

// Get or initialize AgentKit using the recommended static method
export async function getAgentKit(): Promise<AgentKit> {
  if (agentKitInstance) return agentKitInstance;
  if (!process.env.CDP_API_KEY_NAME || !process.env.CDP_API_KEY_PRIVATE_KEY) {
    throw new Error('Missing required environment variables: CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY');
  }
  agentKitInstance = await AgentKit.from({
    cdpApiKeyName: process.env.CDP_API_KEY_NAME!,
    cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY!,
  });
  return agentKitInstance;
}

// List all available agent actions
export async function getAvailableActions() {
  const agentKit = await getAgentKit();
  return agentKit.getActions();
}

// Execute an agent action by actionName and params
export async function runAgentAction(actionName: string, params: Record<string, any>) {
  const agentKit = await getAgentKit();
  return agentKit.runAction({ actionName, params });
}

// Utility: Find an action by name
export async function findActionByName(name: string) {
  const actions = await getAvailableActions();
  return actions.find(a => a.actionName === name);
}

// Example: Get wallet balance (using a matching action)
export async function getWalletBalance(address?: string) {
  const action = await findActionByName('get_wallet_balance');
  if (!action) throw new Error('No get_wallet_balance action found');
  const params: Record<string, any> = {};
  if (address) params.address = address;
  return runAgentAction(action.actionName, params);
}

// Example: Transfer native tokens (using a matching action)
export async function transferNativeTokens(to: string, amount: string) {
  const action = await findActionByName('transfer_native_token');
  if (!action) throw new Error('No transfer_native_token action found');
  return runAgentAction(action.actionName, { to, amount });
}

// Example: Get transaction details
export async function getTransactionDetails(txHash: string) {
  const action = await findActionByName('get_transaction_details');
  if (!action) throw new Error('No get_transaction_details action found');
  return runAgentAction(action.actionName, { txHash });
}

// Example: Swap tokens
export async function swapTokens(fromToken: string, toToken: string, amount: string) {
  const action = await findActionByName('swap_token');
  if (!action) throw new Error('No swap_token action found');
  return runAgentAction(action.actionName, { fromToken, toToken, amount });
}

// Example: Create payment link (if supported by agent)
export async function createPaymentLink(amount: string, currency: string, description?: string) {
  const action = await findActionByName('create_payment_link');
  if (!action) throw new Error('No create_payment_link action found');
  return runAgentAction(action.actionName, { amount, currency, description });
}


// Create payment link
export async function createPaymentLink(amount: string, currency: string, description?: string) {
  try {
    const agentKit = await configureAgentKit();
    const wallet = await getWallet();
    
    // Generate a unique payment ID
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Create a payment request
    const paymentRequest = await agentKit.createPaymentRequest({
      amount,
      currency,
      description: description || 'Payment request',
      metadata: {
        paymentId,
        timestamp: new Date().toISOString(),
      },
    });
    
    // In a real implementation, you would store this in a database
    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${paymentId}`;
    
    return {
      paymentId,
      paymentLink,
      paymentRequestId: paymentRequest.id,
      amount,
      currency,
      description: description || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error creating payment link:', error);
    throw error;
  }
}

// Define custom action schemas
export const WalletBalanceSchema = z.object({
  address: z.string().describe('The wallet address to check balance for')
});

export const TransferSchema = z.object({
  to: z.string().describe('The recipient address'),
  amount: z.string().describe('The amount to transfer')
});

export const SwapSchema = z.object({
  fromToken: z.string().describe('The token to swap from'),
  toToken: z.string().describe('The token to swap to'),
  amount: z.string().describe('The amount to swap')
});

export const TransactionDetailsSchema = z.object({
  txHash: z.string().describe('The transaction hash to get details for')
});

export const PaymentLinkSchema = z.object({
  amount: z.string().describe('The amount to be paid'),
  currency: z.string().describe('The currency for the payment (e.g., ETH, USDC)'),
  description: z.string().optional().describe('A description for the payment')
});
