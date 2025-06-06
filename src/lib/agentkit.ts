import { AgentKit } from '@coinbase/agentkit';
import { z } from 'zod';

// Configure AgentKit
export const configureAgentKit = async (walletAddress?: string) => {
  try {
    const agentKit = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
      networkId: process.env.NETWORK_ID || 'base-sepolia',
    });

    return agentKit;
  } catch (error) {
    console.error('Error configuring AgentKit:', error);
    throw error;
  }
};

// Get wallet balance
export async function getWalletBalance(address: string) {
  try {
    const agentKit = await configureAgentKit();
    const wallet = agentKit.wallet;
    const balance = await wallet.getBalance();
    return balance;
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    throw error;
  }
}

// Get wallet details
export async function getWalletDetails() {
  try {
    const agentKit = await configureAgentKit();
    const wallet = agentKit.wallet;
    const address = wallet.address;
    return { address };
  } catch (error) {
    console.error('Error getting wallet details:', error);
    throw error;
  }
}

// Transfer native tokens
export async function transferNativeTokens(to: string, amount: string) {
  try {
    const agentKit = await configureAgentKit();
    const wallet = agentKit.wallet;
    const tx = await wallet.transfer(to, amount);
    const receipt = await tx.wait();
    return { 
      txHash: receipt.transactionHash,
      status: receipt.status === 1 ? 'success' : 'failed'
    };
  } catch (error) {
    console.error('Error transferring native tokens:', error);
    throw error;
  }
}

// Get transaction details
export async function getTransactionDetails(txHash: string) {
  try {
    const agentKit = await configureAgentKit();
    const provider = agentKit.wallet.provider;
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      gasUsed: receipt?.gasUsed.toString(),
      status: receipt?.status === 1 ? 'success' : 'failed',
      blockNumber: tx.blockNumber,
    };
  } catch (error) {
    console.error('Error getting transaction details:', error);
    throw error;
  }
}

// Swap tokens
export async function swapTokens(fromToken: string, toToken: string, amount: string) {
  try {
    const agentKit = await configureAgentKit();
    // This is a placeholder for the actual swap implementation
    // In a real implementation, you would use the CDP SDK to perform the swap
    return {
      status: 'success',
      fromToken,
      toToken,
      amount,
      txHash: '0x...' // Placeholder
    };
  } catch (error) {
    console.error('Error swapping tokens:', error);
    throw error;
  }
}

// Create payment link
export async function createPaymentLink(amount: string, currency: string, description?: string) {
  try {
    // Generate a unique payment ID
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // In a real implementation, you would store this in a database
    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${paymentId}?amount=${amount}&currency=${currency}${description ? `&description=${encodeURIComponent(description)}` : ''}`;
    
    return {
      paymentId,
      paymentLink,
      amount,
      currency,
      description: description || '',
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
