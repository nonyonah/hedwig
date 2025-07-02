import { PrivyTransactionHandler } from './privyTransactionHandler';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Handles incoming transaction requests and integrates with the MultiChainTransactionHandler
 */
export async function handleTransaction(
  userId: string,
  transactionData: any,
  options: {
    chain?: string;
    token?: string;
    amount?: string | number;
    recipient?: string;
    isExecute?: boolean;
  } = {}
) {
  try {
    console.log(`[TransactionHandler] Processing transaction for user ${userId}`);
    
    // Determine chain from options or transaction data
    const chain = options.chain || transactionData.chain || 'base';
    
    console.log(`[TransactionHandler] Using chain: ${chain}`);
    
    // Get wallet for the specified chain
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address, privy_wallet_id')
      .eq('user_id', userId)
      .eq('chain', chain)
      .single();
    
    if (error || !wallet) {
      console.error(`[TransactionHandler] Error fetching wallet:`, error);
      throw new Error(`Wallet not found for chain ${chain}`);
    }
    
    console.log(`[TransactionHandler] Found wallet:`, wallet);
    
    // Only execute transaction if isExecute is true
    if (!options.isExecute) {
      return { text: 'Transaction not confirmed. Please confirm to proceed.' };
    }
    
    // Prepare transaction data for Privy
    const to = options.recipient || transactionData.recipient || transactionData.to;
    const amount = options.amount || transactionData.amount || '0';
    // Convert amount to hex (wei)
    let value = amount;
    if (typeof value === 'number' || (typeof value === 'string' && !value.startsWith('0x'))) {
      const amountValue = typeof value === 'number' ? value : parseFloat(value);
      const amountInWei = Math.floor(amountValue * 1e18);
      value = '0x' + amountInWei.toString(16);
    }
    const txData = {
      to,
      value,
      data: transactionData.data || '0x',
      from: wallet.address,
    };
    
    // Send transaction using Privy
    const privyHandler = new PrivyTransactionHandler();
    const result = await privyHandler.sendTransaction(wallet.privy_wallet_id, txData);
    
    // Record transaction in database
    await recordTransaction(userId, wallet.address, result, chain, txData);
    
    return result;
  } catch (error) {
    console.error('[TransactionHandler] Transaction failed:', error);
    throw error;
  }
}

/**
 * Record transaction in the database
 */
async function recordTransaction(
  userId: string, 
  walletAddress: string, 
  result: any, 
  chain: string,
  txData: any
) {
  try {
    const txHash = result.hash;
    const explorerUrl = result.explorerUrl;
    
    await supabase.from('transactions').insert([{
      user_id: userId,
      wallet_address: walletAddress,
      tx_hash: txHash,
      explorer_url: explorerUrl,
      chain: chain,
      status: 'completed',
      metadata: {
        ...txData,
        timestamp: new Date().toISOString()
      }
    }]);
    
    console.log(`[TransactionHandler] Transaction recorded in database: ${txHash}`);
  } catch (error) {
    console.error('[TransactionHandler] Failed to record transaction:', error);
    // Don't throw here, as the transaction itself was successful
  }
} 