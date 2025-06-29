import { MultiChainTransactionHandler } from './multiChainHandler';
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
  } = {}
) {
  try {
    console.log(`[TransactionHandler] Processing transaction for user ${userId}`);
    
    // Determine chain from options or transaction data
    const chain = options.chain || 
      (transactionData.chain || 
      (transactionData.network && transactionData.network.toLowerCase().includes('sol') ? 'solana' : 'ethereum'));
    
    console.log(`[TransactionHandler] Using chain: ${chain}`);
    
    // Get wallet for the specified chain
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('address, privy_wallet_id')
      .eq('user_id', userId)
      .eq('chain', chain.toLowerCase().includes('sol') ? 'solana' : 'evm')
      .single();
    
    if (error || !wallet) {
      console.error(`[TransactionHandler] Error fetching wallet:`, error);
      throw new Error(`Wallet not found for chain ${chain}`);
    }
    
    console.log(`[TransactionHandler] Found wallet:`, wallet);
    
    // Initialize the multi-chain handler
    const transactionHandler = new MultiChainTransactionHandler();
    
    // Format transaction data based on the chain
    let formattedTxData = formatTransactionData(transactionData, options, chain, wallet.address);

    // For Solana, ensure senderAddress is included
    if (chain.toLowerCase().includes('sol')) {
      formattedTxData.senderAddress = wallet.address;
    }
    
    // Send the transaction
    const result = await transactionHandler.sendTransaction(
      wallet.privy_wallet_id,
      formattedTxData,
      { chain }
    );
    
    console.log(`[TransactionHandler] Transaction result:`, result);
    
    // Record transaction in database
    await recordTransaction(userId, wallet.address, result, chain, formattedTxData);
    
    return result;
  } catch (error) {
    console.error('[TransactionHandler] Transaction failed:', error);
    throw error;
  }
}

/**
 * Format transaction data based on chain and input parameters
 */
function formatTransactionData(
  transactionData: any, 
  options: any, 
  chain: string,
  walletAddress: string
) {
  // If it's already a properly formatted transaction, return as is
  if (
    (chain.toLowerCase().includes('sol') && (transactionData.transaction || transactionData.instructions)) ||
    (!chain.toLowerCase().includes('sol') && transactionData.to && transactionData.value)
  ) {
    return transactionData;
  }
  
  // For Solana
  if (chain.toLowerCase().includes('sol')) {
    return {
      recipient: options.recipient || transactionData.recipient || transactionData.to,
      amount: options.amount || transactionData.amount || '0'
    };
  } 
  // For Ethereum
  else {
    const amount = options.amount || transactionData.amount || '0';
    let value = amount;
    
    // Convert to hex if it's a number
    if (typeof amount === 'number' || !amount.startsWith('0x')) {
      const amountValue = typeof amount === 'number' ? amount : parseFloat(amount);
      const amountInWei = Math.floor(amountValue * 1e18);
      value = '0x' + amountInWei.toString(16);
    }
    
    return {
      to: options.recipient || transactionData.recipient || transactionData.to,
      value,
      from: walletAddress
    };
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
    const txHash = result.hash || result.signature;
    const explorerUrl = result.explorerUrl;
    
    await supabase.from('transactions').insert([{
      user_id: userId,
      wallet_address: walletAddress,
      tx_hash: txHash,
      explorer_url: explorerUrl,
      chain: chain.toLowerCase().includes('sol') ? 'solana' : 'ethereum',
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