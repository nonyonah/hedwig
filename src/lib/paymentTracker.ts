import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PaymentCompletionData {
  paymentLinkId: string;
  transactionHash: string;
  paidAmount: string;
  payerWalletAddress: string;
  blockNumber?: number;
  gasUsed?: string;
  gasPrice?: string;
}

/**
 * Mark a payment as completed and store payer information
 */
export async function markPaymentCompleted(data: PaymentCompletionData): Promise<boolean> {
  try {
    console.log('[markPaymentCompleted] Updating payment:', data);

    const { error } = await supabase
      .from('payment_links')
      .update({
        status: 'paid',
        transaction_hash: data.transactionHash,
        paid_amount: data.paidAmount,
        payer_wallet_address: data.payerWalletAddress.toLowerCase(),
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', data.paymentLinkId);

    if (error) {
      console.error('[markPaymentCompleted] Database error:', error);
      throw new Error(`Failed to update payment: ${error.message}`);
    }

    console.log('[markPaymentCompleted] Payment updated successfully');
    return true;

  } catch (error) {
    console.error('[markPaymentCompleted] Error:', error);
    throw error;
  }
}

/**
 * Get payment details by ID
 */
export async function getPaymentDetails(paymentLinkId: string) {
  try {
    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('id', paymentLinkId)
      .single();

    if (error) {
      console.error('[getPaymentDetails] Database error:', error);
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }

    return data;

  } catch (error) {
    console.error('[getPaymentDetails] Error:', error);
    throw error;
  }
}

/**
 * Get payment details by transaction hash
 */
export async function getPaymentByTransactionHash(transactionHash: string) {
  try {
    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('transaction_hash', transactionHash)
      .single();

    if (error) {
      console.error('[getPaymentByTransactionHash] Database error:', error);
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }

    return data;

  } catch (error) {
    console.error('[getPaymentByTransactionHash] Error:', error);
    throw error;
  }
}

/**
 * Get recent payments for a wallet (both received and sent)
 */
export async function getRecentPayments(walletAddress: string, limit: number = 10) {
  try {
    // Get payments received
    const { data: received, error: receivedError } = await supabase
      .from('payment_links')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(limit);

    if (receivedError) {
      console.error('[getRecentPayments] Error fetching received payments:', receivedError);
      throw new Error(`Failed to fetch received payments: ${receivedError.message}`);
    }

    // Get payments sent
    const { data: sent, error: sentError } = await supabase
      .from('payment_links')
      .select('*')
      .eq('payer_wallet_address', walletAddress.toLowerCase())
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(limit);

    if (sentError) {
      console.error('[getRecentPayments] Error fetching sent payments:', sentError);
      throw new Error(`Failed to fetch sent payments: ${sentError.message}`);
    }

    // Combine and sort by paid_at
    const allPayments = [
      ...(received || []).map(p => ({ ...p, type: 'received' })),
      ...(sent || []).map(p => ({ ...p, type: 'sent' }))
    ].sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
     .slice(0, limit);

    return allPayments;

  } catch (error) {
    console.error('[getRecentPayments] Error:', error);
    throw error;
  }
}

/**
 * Get payment statistics for a wallet
 */
export async function getPaymentStats(walletAddress: string) {
  try {
    // Get earnings stats
    const { data: earningsData, error: earningsError } = await supabase
      .from('payment_links')
      .select('paid_amount, token, network')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('status', 'paid')
      .not('paid_amount', 'is', null);

    if (earningsError) {
      console.error('[getPaymentStats] Error fetching earnings:', earningsError);
      throw new Error(`Failed to fetch earnings: ${earningsError.message}`);
    }

    // Get spending stats
    const { data: spendingData, error: spendingError } = await supabase
      .from('payment_links')
      .select('paid_amount, token, network')
      .eq('payer_wallet_address', walletAddress.toLowerCase())
      .eq('status', 'paid')
      .not('paid_amount', 'is', null);

    if (spendingError) {
      console.error('[getPaymentStats] Error fetching spending:', spendingError);
      throw new Error(`Failed to fetch spending: ${spendingError.message}`);
    }

    // Calculate totals
    const totalEarnings = (earningsData || []).reduce((sum, payment) => 
      sum + parseFloat(payment.paid_amount), 0);
    
    const totalSpending = (spendingData || []).reduce((sum, payment) => 
      sum + parseFloat(payment.paid_amount), 0);

    // Get unique tokens
    const earningsTokens = new Set((earningsData || []).map(p => p.token));
    const spendingTokens = new Set((spendingData || []).map(p => p.token));
    const allTokens = new Set([...earningsTokens, ...spendingTokens]);

    // Get unique networks
    const earningsNetworks = new Set((earningsData || []).map(p => p.network));
    const spendingNetworks = new Set((spendingData || []).map(p => p.network));
    const allNetworks = new Set([...earningsNetworks, ...spendingNetworks]);

    return {
      earnings: {
        total: Math.round(totalEarnings * 100000000) / 100000000,
        count: earningsData?.length || 0,
        tokens: Array.from(earningsTokens),
        networks: Array.from(earningsNetworks)
      },
      spending: {
        total: Math.round(totalSpending * 100000000) / 100000000,
        count: spendingData?.length || 0,
        tokens: Array.from(spendingTokens),
        networks: Array.from(spendingNetworks)
      },
      overall: {
        netEarnings: Math.round((totalEarnings - totalSpending) * 100000000) / 100000000,
        totalTransactions: (earningsData?.length || 0) + (spendingData?.length || 0),
        uniqueTokens: Array.from(allTokens),
        uniqueNetworks: Array.from(allNetworks)
      }
    };

  } catch (error) {
    console.error('[getPaymentStats] Error:', error);
    throw error;
  }
}