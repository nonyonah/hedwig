import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';

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
    
    // Use cdp_wallet_id for CDP transactions
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
    
    // Prepare transaction data for CDP
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
    };
    
    // Send transaction using CDP
    const result = await sendCDPTransaction({
      address: wallet.privy_wallet_id,
      transaction: txData,
      network: 'base-sepolia',
    });
    
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

async function sendCDPTransaction({
  address,
  transaction,
  network = 'base-sepolia',
}: {
  address: string; // cdp_wallet_id
  transaction: { to: string; value: string; data?: string };
  network?: string;
}): Promise<{ hash: string; explorerUrl: string }> {
  console.log(`[sendCDPTransaction] Sending transaction to ${transaction.to} from ${address} on ${network}`);
  try {
    const apiKey = process.env.CDP_API_KEY;
    const walletSecret = process.env.CDP_WALLET_SECRET;
    const baseUrl = process.env.CDP_API_URL || 'https://api.cdp.coinbase.com';
    if (!apiKey || !walletSecret) {
      throw new Error('CDP_API_KEY or CDP_WALLET_SECRET not configured');
    }
    // Generate the wallet authorization token
    const walletToken = generateWalletAuthToken(walletSecret, address);
    // Set up the API request
    const response = await fetch(
      `${baseUrl}/platform/v2/evm/accounts/${address}/send/transaction`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Wallet-Auth': walletToken,
        },
        body: JSON.stringify({
          network,
          transaction,
        }),
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sendCDPTransaction] Error: ${response.status} ${errorText}`);
      throw new Error(`CDP API error: ${errorText}`);
    }
    const data = await response.json();
    console.log(`[sendCDPTransaction] Transaction sent: ${data.transactionHash}`);
    return {
      hash: data.transactionHash,
      explorerUrl: `https://sepolia.basescan.org/tx/${data.transactionHash}`,
    };
  } catch (error) {
    console.error('[sendCDPTransaction] Error:', error);
    throw error;
  }
}

function generateWalletAuthToken(walletSecret: string, address: string): string {
  const payload = {
    sub: address.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    scope: 'write:transactions',
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const signature = crypto
    .createHmac('sha256', walletSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
} 