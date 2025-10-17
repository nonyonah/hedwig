import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';
import { getTokenPricesBySymbol } from './tokenPriceService';
import { transactionStorage } from './transactionStorage';

loadServerEnvironment();
// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface EarningsFilter {
  walletAddress?: string; // For backward compatibility
  walletAddresses?: string[]; // Support multiple wallet addresses
  token?: string;
  network?: string;
  timeframe?: 'today' | 'yesterday' | 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime' | 'custom';
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
  category?: string; // earnings category filter
  includeInsights?: boolean; // whether to include insights in the response
}

export interface EarningsSummaryItem {
  token: string;
  network: string;
  total: number;
  count: number; // number of payments
  averageAmount: number;
  lastPayment?: string; // ISO date string
  fiatValue?: number; // USD equivalent
  fiatCurrency?: string;
  exchangeRate?: number; // rate used for conversion
  percentage?: number; // percentage of total earnings
  category?: string; // freelance, airdrop, staking, etc.
  source?: string; // source of earnings (payment_link, invoice, proposal, or combination)
}

export interface EarningsInsights {
  largestPayment: {
    amount: number;
    token: string;
    network: string;
    date: string;
    fiatValue?: number;
  };
  mostActiveNetwork: {
    network: string;
    count: number;
    totalAmount: number;
  };
  topToken: {
    token: string;
    totalAmount: number;
    percentage: number;
  };
  growthComparison?: {
    previousPeriod: number;
    currentPeriod: number;
    growthPercentage: number;
    trend: 'up' | 'down' | 'stable';
  };
  motivationalMessage: string;
}

export interface EarningsSummaryResponse {
  walletAddress?: string; // For backward compatibility
  walletAddresses?: string[]; // Multiple wallet addresses
  timeframe: string;
  totalEarnings: number;
  totalFiatValue?: number;
  totalPayments: number;
  earnings: EarningsSummaryItem[];
  period: {
    startDate: string;
    endDate: string;
  };
  insights?: EarningsInsights;
  offrampSummary?: {
    totalOfframped: number;
    remainingCrypto: number;
    offrampPercentage: number;
  };
}

export interface UserPreferences {
  userId: string;
  autoSummaryEnabled: boolean;
  summaryFrequency: 'monthly' | 'weekly' | 'disabled';
  preferredCurrency: string;
  includeTestnets: boolean;
  categories: {
    [key: string]: string[]; // category name -> array of keywords/patterns
  };
}

/**
 * Fetch completed transactions from permanent storage
 */
async function fetchCompletedTransactions(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    console.log('[fetchCompletedTransactions] Fetching completed transactions for wallets:', walletAddresses);

    // Get completed transactions for each wallet
    const allCompletedTransactions: any[] = [];

    // First, get user IDs from wallet addresses
    const { data: userWallets } = await supabase
      .from('wallets')
      .select('user_id, address')
      .in('address', walletAddresses);

    const userIds = userWallets ? Array.from(new Set(userWallets.map(w => w.user_id))) : [];

    for (const userId of userIds) {
      try {
        const transactions = await transactionStorage.getCompletedTransactionsByUserId(userId);

        // Filter by date range if specified
        let filteredTransactions = transactions;
        if (startDate || endDate) {
          filteredTransactions = transactions.filter(tx => {
            const txDate = tx.expiresAt || tx.createdAt;
            if (!txDate) return false;

            const txDateObj = new Date(txDate);
            if (startDate && txDateObj < new Date(startDate)) return false;
            if (endDate && txDateObj > new Date(endDate)) return false;

            return true;
          });
        }

        // Filter by token if specified
        if (filter.token) {
          filteredTransactions = filteredTransactions.filter(tx =>
            tx.tokenSymbol?.toUpperCase() === filter.token?.toUpperCase()
          );
        }

        // Filter by network if specified
        if (filter.network) {
          filteredTransactions = filteredTransactions.filter(tx =>
            tx.network === filter.network
          );
        }

        // Transform to earnings format
        const transformedTransactions = filteredTransactions.map(tx => ({
          id: tx.transactionId,
          amount: parseFloat(tx.amount) || 0,
          token: tx.tokenSymbol || 'Unknown',
          network: tx.network || 'Base',
          paid_at: tx.expiresAt || tx.createdAt, // Use expiresAt which contains completed_at
          transaction_hash: tx.transactionHash,
          payment_reason: tx.errorMessage || 'Completed Transaction',
          wallet_address: tx.toAddress, // Use the actual wallet address from transaction
          source: 'completed_transaction',
          category: 'transaction'
        }));

        allCompletedTransactions.push(...transformedTransactions);
      } catch (error) {
        console.error(`[fetchCompletedTransactions] Error fetching for user ${userId}:`, error);
      }
    }

    console.log(`[fetchCompletedTransactions] Found ${allCompletedTransactions.length} completed transactions`);
    return allCompletedTransactions;
  } catch (error) {
    console.error('[fetchCompletedTransactions] Error:', error);
    return [];
  }
}

/**
 * Get earnings summary for a wallet address with optional filtering
 */
/**
 * Get spending summary for a wallet address with optional filtering
 */
export async function getSpendingSummary(filter: EarningsFilter, includeInsights = false): Promise<EarningsSummaryResponse> {
  try {
    console.log('[getSpendingSummary] Fetching spending for:', filter);

    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      throw new Error('No wallet addresses provided');
    }

    // Calculate date range based on timeframe
    const { startDate, endDate } = getDateRange(filter.timeframe, filter.startDate, filter.endDate);

    // Fetch spending sources (withdrawals and offramp transactions)
    const [withdrawalTransactions, offrampTransactions] = await Promise.all([
      fetchWithdrawalTransactions(filter, startDate, endDate),
      fetchOfframpTransactions(filter, startDate, endDate)
    ]);

    console.log(`[getSpendingSummary] Found ${withdrawalTransactions.length} withdrawals, ${offrampTransactions.length} offramp transactions`);

    // Combine all spending sources
    const allSpending: any[] = [
      ...withdrawalTransactions.map(w => ({
        ...w,
        source: 'withdrawal' as const,
        paid_amount: Math.abs(parseFloat(String(w.amount))), // Positive amount for spending calculation
        title: 'Crypto Withdrawal',
        description: `Sent to: ${w.to_address || 'Unknown'}`
      })),
      ...offrampTransactions.map(o => ({
        ...o,
        source: 'offramp' as const,
        paid_amount: Math.abs(parseFloat(String(o.amount))), // Positive amount for spending calculation
        title: 'Crypto to Fiat Conversion',
        description: `Converted to ${o.fiat_currency || 'USD'}`
      }))
    ];

    if (allSpending.length === 0) {
      return {
        walletAddress: filter.walletAddress,
        walletAddresses: walletAddresses,
        timeframe: filter.timeframe || 'allTime',
        totalEarnings: 0, // This represents total spending
        totalFiatValue: 0,
        totalPayments: 0,
        earnings: [], // This represents spending breakdown
        period: {
          startDate: startDate || '',
          endDate: endDate || new Date().toISOString()
        }
      };
    }

    // Get unique tokens for price fetching
    const spendingTokens = allSpending.map(s => s.token);
    const uniqueTokens = Array.from(new Set(spendingTokens));

    let tokenPrices: { [key: string]: number } = {};

    try {
      const priceData = await getTokenPricesBySymbol(uniqueTokens);
      tokenPrices = priceData.reduce((acc, price) => {
        acc[price.symbol] = price.price;
        return acc;
      }, {} as { [key: string]: number });
    } catch (priceError) {
      console.warn('[getSpendingSummary] Could not fetch token prices:', priceError);
    }

    // Process spending data similar to earnings
    const spendingMap = new Map<string, {
      token: string;
      network: string;
      total: number;
      count: number;
      payments: any[];
      fiatValue: number;
      category?: string;
      sources: Set<string>;
    }>();

    let totalSpending = 0;
    let totalFiatValue = 0;

    for (const spending of allSpending) {
      const key = `${spending.token}-${spending.network}`;
      const amount = parseFloat(spending.paid_amount) || 0;

      // Calculate fiat value using token prices
      const tokenPrice = tokenPrices[spending.token] || 0;
      const isStablecoin = ['USDC', 'USDT', 'cUSD', 'DAI', 'BUSD', 'TUSD', 'FRAX'].includes(spending.token?.toUpperCase());
      const fiatValue = tokenPrice > 0 ? (tokenPrice * amount) : (isStablecoin ? amount : 0);

      totalSpending += fiatValue;
      totalFiatValue += fiatValue;

      if (spendingMap.has(key)) {
        const existing = spendingMap.get(key)!;
        existing.total += amount;
        existing.count += 1;
        existing.payments.push(spending);
        existing.fiatValue += fiatValue;
        existing.sources.add(spending.source);
      } else {
        spendingMap.set(key, {
          token: spending.token,
          network: spending.network,
          total: amount,
          count: 1,
          payments: [spending],
          fiatValue: fiatValue,
          category: spending.category || 'spending',
          sources: new Set([spending.source])
        });
      }
    }

    // Convert to final format
    const spendingBreakdown = Array.from(spendingMap.values()).map(item => {
      const lastItem = item.payments.sort((a, b) => {
        return new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime();
      })[0];

      return {
        token: item.token,
        network: item.network,
        total: Math.round(item.total * 100000000) / 100000000,
        count: item.count,
        averageAmount: Math.round((item.total / item.count) * 100000000) / 100000000,
        lastPayment: lastItem?.paid_at,
        fiatValue: Math.round(item.fiatValue * 100) / 100,
        fiatCurrency: 'USD',
        exchangeRate: tokenPrices[item.token] || 0,
        percentage: totalSpending > 0 ? Math.round((item.fiatValue / totalSpending) * 10000) / 100 : 0,
        category: item.category,
        source: Array.from(item.sources).join(', ')
      };
    });

    // Sort by total spending descending
    spendingBreakdown.sort((a, b) => b.total - a.total);

    const result: EarningsSummaryResponse = {
      walletAddress: filter.walletAddress,
      walletAddresses: walletAddresses,
      timeframe: filter.timeframe || 'allTime',
      totalEarnings: Math.round(totalSpending * 100) / 100, // This represents total spending
      totalFiatValue: Math.round(totalFiatValue * 100) / 100,
      totalPayments: allSpending.length,
      earnings: spendingBreakdown, // This represents spending breakdown
      period: {
        startDate: startDate || '',
        endDate: endDate || new Date().toISOString()
      }
    };

    return result;

  } catch (error) {
    console.error('[getSpendingSummary] Error:', error);
    throw error;
  }
}

export async function getEarningsSummary(filter: EarningsFilter, includeInsights = false): Promise<EarningsSummaryResponse> {
  try {
    console.log('[getEarningsSummary] Fetching earnings for:', filter);

    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      throw new Error('No wallet addresses provided');
    }

    // Calculate date range based on timeframe
    const { startDate, endDate } = getDateRange(filter.timeframe, filter.startDate, filter.endDate);

    // Fetch all earnings sources including completed transactions from permanent storage
    console.log('[getEarningsSummary] About to fetch payment events for wallets:', walletAddresses);
    const [paymentLinks, invoices, proposals, paymentEvents, offrampTransactions, completedTransactions, withdrawalTransactions] = await Promise.all([
      fetchPaymentLinks(filter, startDate, endDate),
      fetchPaidInvoices(filter, startDate, endDate),
      fetchAcceptedProposals(filter, startDate, endDate),
      fetchPaymentEvents(filter, startDate, endDate),
      fetchOfframpTransactions(filter, startDate, endDate),
      fetchCompletedTransactions(filter, startDate, endDate),
      fetchWithdrawalTransactions(filter, startDate, endDate)
    ]);

    console.log(`[getEarningsSummary] Found ${paymentLinks.length} payment links, ${invoices.length} paid invoices, ${proposals.length} accepted proposals, ${paymentEvents.length} payment events, ${offrampTransactions.length} offramp transactions, ${completedTransactions.length} completed transactions, ${withdrawalTransactions.length} withdrawal transactions`);

    // Combine all earnings sources
    const allEarnings: any[] = [
      ...paymentLinks.map(p => ({ ...p, source: 'payment_link' as const })),
      ...invoices.map(i => ({
        ...i,
        source: 'invoice' as const,
        token: i.token || i.currency || 'USD', // Use token field first, then currency, then default to USD
        network: i.network || i.blockchain || 'base', // Use network field first, then blockchain, then default to base
        paid_amount: i.amount,
        paid_at: i.paid_at || i.created_at || new Date().toISOString(), // Use paid_at if available, fallback to created_at
        title: i.project_description || 'Invoice Payment',
        description: i.additional_notes || ''
      })),
      ...proposals.map(p => ({
        ...p,
        source: 'proposal' as const,
        token: p.token || p.currency || 'USD', // Use token field first, then currency, then default to USD
        network: p.network || 'base', // Use network field or default to base
        paid_amount: p.amount,
        paid_at: p.paid_at || p.created_at || new Date().toISOString(), // Use paid_at if available, fallback to created_at
        title: p.project_title || 'Proposal Payment',
        description: p.description || ''
      })),
      ...paymentEvents.map(e => ({
        ...e,
        source: 'payment_events' as const,
        paid_amount: e.amount,
        title: e.payment_reason || 'Direct Transfer',
        description: `Transaction: ${e.transaction_hash}`
      })),
      ...offrampTransactions.map(o => ({
        ...o,
        source: 'offramp' as const,
        token: o.token || 'USDC', // Ensure token is set, default to USDC for offramp
        network: o.network || 'base', // Ensure network is set, default to base
        paid_amount: o.amount,
        title: 'Crypto Withdrawal',
        description: `Offramp to ${o.fiat_currency || 'USD'}`
      })),
      ...completedTransactions.map(t => ({
        ...t,
        source: 'completed_transaction' as const,
        paid_amount: t.amount,
        title: t.errorMessage || 'Completed Transaction',
        description: `Transaction: ${t.transaction_hash || 'N/A'}`
      })),
      ...withdrawalTransactions.map(w => ({
        ...w,
        source: 'withdrawal' as const,
        paid_amount: -Math.abs(parseFloat(String(w.amount))), // Negative amount for withdrawals
        title: 'Crypto Withdrawal',
        description: `Sent to: ${w.to_address || 'Unknown'}`
      }))
    ];

    if (allEarnings.length === 0) {
      return {
        walletAddress: filter.walletAddress, // For backward compatibility
        walletAddresses: walletAddresses,
        timeframe: filter.timeframe || 'allTime',
        totalEarnings: 0,
        totalFiatValue: 0,
        totalPayments: 0,
        earnings: [],
        period: {
          startDate: startDate || '',
          endDate: endDate || new Date().toISOString()
        }
      };
    }

    // Get unique tokens for price fetching
    const paymentTokens = allEarnings.map(p => p.token).filter(token => token && token !== 'Unknown');
    const uniqueTokens = Array.from(new Set(paymentTokens));

    console.log('[getEarningsSummary] Token distribution:', paymentTokens.reduce((acc: any, token: string) => {
      acc[token] = (acc[token] || 0) + 1;
      return acc;
    }, {}));

    let tokenPrices: { [key: string]: number } = {};

    try {
      const priceData = await getTokenPricesBySymbol(uniqueTokens);
      tokenPrices = priceData.reduce((acc, price) => {
        acc[price.symbol] = price.price;
        return acc;
      }, {} as { [key: string]: number });
    } catch (priceError) {
      console.warn('[getEarningsSummary] Could not fetch token prices:', priceError);
    }

    // Categorize all earnings
    const categorizedEarnings = allEarnings.map(earning => ({
      ...earning,
      category: categorizePayment(earning)
    }));

    // Group and aggregate earnings by token and network
    const earningsMap = new Map<string, {
      token: string;
      network: string;
      total: number;
      count: number;
      payments: any[];
      fiatValue: number;
      category?: string;
      sources: Set<string>;
    }>();

    let totalEarnings = 0;
    let totalFiatValue = 0;

    // Define supported tokens based on actual supported chains (Base, Celo, Lisk, Solana)
    // Removed Ethereum, Polygon, BSC, and Arbitrum as they're not in the active supported networks
    const SUPPORTED_TOKENS = [
      // Stablecoins
      'USDC', 'USDT', 'cUSD', 'DAI',
      // Native tokens for supported chains
      'ETH', // Base uses ETH
      'SOL', // Solana native
      'CELO', // Celo native
      'LSK', // Lisk native
      // Other supported tokens
      'cNGN' // Nigerian Naira stablecoin on multiple chains
    ];

    // Process all earnings sources (not just stablecoins)
    const allValidEarnings = categorizedEarnings.filter(earning =>
      earning.token && earning.paid_amount && parseFloat(earning.paid_amount) > 0
    );

    // Process all valid earnings sources
    for (const earning of allValidEarnings) {
      const key = `${earning.token}-${earning.network}`;
      const amount = parseFloat(earning.paid_amount) || 0;

      // Calculate fiat value using token prices
      const tokenPrice = tokenPrices[earning.token] || 0;

      // For stablecoins, use 1:1 USD conversion if no price available, otherwise use actual price
      const isStablecoin = ['USDC', 'USDT', 'cUSD', 'DAI', 'BUSD', 'TUSD', 'FRAX'].includes(earning.token?.toUpperCase());
      const fiatValue = tokenPrice > 0 ? (tokenPrice * amount) : (isStablecoin ? amount : 0);

      // Use fiat value for totalEarnings to properly aggregate different tokens in USD
      totalEarnings += fiatValue;
      totalFiatValue += fiatValue;

      if (earningsMap.has(key)) {
        const existing = earningsMap.get(key)!;
        existing.total += amount;
        existing.count += 1;
        existing.payments.push(earning);
        existing.fiatValue += fiatValue;
        existing.sources.add(earning.source);
      } else {
        earningsMap.set(key, {
          token: earning.token,
          network: earning.network,
          total: amount,
          count: 1,
          payments: [earning],
          fiatValue: fiatValue,
          category: earning.category,
          sources: new Set([earning.source])
        });
      }
    }

    // No transaction processing - removed blockchain earnings tracking

    // Convert to final format with percentages
    const earnings: EarningsSummaryItem[] = Array.from(earningsMap.values()).map(item => {
      const lastItem = item.payments.sort((a, b) => {
        return new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime();
      })[0];

      return {
        token: item.token,
        network: item.network,
        total: Math.round(item.total * 100000000) / 100000000,
        count: item.count,
        averageAmount: Math.round((item.total / item.count) * 100000000) / 100000000,
        lastPayment: lastItem?.paid_at,
        fiatValue: Math.round(item.fiatValue * 100) / 100,
        fiatCurrency: 'USD',
        exchangeRate: tokenPrices[item.token] || 0,
        percentage: totalEarnings > 0 ? Math.round((item.fiatValue / totalEarnings) * 10000) / 100 : 0,
        category: item.category,
        source: Array.from(item.sources).join(', ') // Convert Set to comma-separated string
      };
    });

    // Sort by total earnings descending
    earnings.sort((a, b) => b.total - a.total);

    // Calculate offramp summary - only from actual offramp transactions
    const offrampEarnings = allValidEarnings.filter(e => e.source === 'offramp');
    const totalOfframped = offrampEarnings.reduce((sum, e) => {
      const amount = parseFloat(e.paid_amount) || 0;
      const tokenPrice = tokenPrices[e.token] || 0;
      const isStablecoin = ['USDC', 'USDT', 'cUSD', 'DAI', 'BUSD', 'TUSD', 'FRAX'].includes(e.token?.toUpperCase());
      const fiatValue = tokenPrice > 0 ? (tokenPrice * amount) : (isStablecoin ? amount : 0);
      return sum + fiatValue;
    }, 0);
    const remainingCrypto = totalEarnings - totalOfframped;
    const offrampPercentage = totalEarnings > 0 ? (totalOfframped / totalEarnings) * 100 : 0;

    const result: EarningsSummaryResponse = {
      walletAddress: filter.walletAddress, // For backward compatibility
      walletAddresses: walletAddresses,
      timeframe: filter.timeframe || 'allTime',
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalFiatValue: Math.round(totalFiatValue * 100) / 100,
      totalPayments: allValidEarnings.length, // Use all valid earnings count
      earnings,
      period: {
        startDate: startDate || '',
        endDate: endDate || new Date().toISOString()
      },
      offrampSummary: {
        totalOfframped: Math.round(totalOfframped * 100) / 100,
        remainingCrypto: Math.round(remainingCrypto * 100) / 100,
        offrampPercentage: Math.round(offrampPercentage * 100) / 100
      }
    };

    // Add insights if requested
    if (includeInsights && allValidEarnings.length > 0) {
      result.insights = await generateEarningsInsights(allValidEarnings, earnings, filter);
    }

    return result;

  } catch (error) {
    console.error('[getEarningsSummary] Error:', error);
    throw error;
  }
}

/**
 * Fetch payment events from blockchain tracking (direct transfers)
 */
async function fetchPaymentEvents(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    // Build the query for direct transfers from payments table
    console.log('[fetchPaymentEvents] Querying payments table for wallets:', walletAddresses);
    // Convert wallet addresses to lowercase for case-insensitive matching
    const lowerCaseWallets = walletAddresses.map(addr => addr.toLowerCase());

    // Query both recipient_wallet and payer_wallet to catch all transactions
    let query = supabase
      .from('payments')
      .select('*')
      .or(`recipient_wallet.in.(${lowerCaseWallets.join(',')}),payer_wallet.in.(${lowerCaseWallets.join(',')})`);

    // Add time filtering
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Add token filtering
    if (filter.token) {
      query = query.eq('currency', filter.token.toUpperCase());
    }

    // Add network filtering
    if (filter.network) {
      query = query.eq('chain', filter.network);
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    const { data: payments, error } = await query;

    console.log('[fetchPaymentEvents] Query result - payments:', payments?.length || 0, 'records');
    console.log('[fetchPaymentEvents] Query error:', error);

    if (error) {
      console.error('[fetchPaymentEvents] Database error:', error);
      throw new Error(`Failed to fetch payment events: ${error.message}`);
    }

    // Transform payments to match earnings format
    return (payments || []).map(payment => ({
      id: payment.id,
      amount: parseFloat(payment.amount_paid) || 0,
      token: payment.currency || 'ETH', // Use ETH as default to match database schema
      network: payment.chain || 'base', // Use lowercase 'base' for consistency
      paid_at: payment.created_at,
      transaction_hash: payment.tx_hash,
      payment_reason: 'Direct Transfer',
      wallet_address: payment.recipient_wallet,
      payer_wallet_address: payment.payer_wallet,
      source: 'direct_transfer',
      category: 'direct_transfer'
    }));
  } catch (error) {
    console.error('[fetchPaymentEvents] Error:', error);
    return [];
  }
}

/**
 * Helper function to get token symbol from address
 */
function getTokenSymbol(tokenAddress: string): string {
  const tokens: { [key: string]: string } = {
    // Base Mainnet (Primary supported chain)
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'USDT',
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': 'USDbC',
    '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F': 'cNGN', // Base cNGN
    '0x0000000000000000000000000000000000000000': 'ETH', // Native ETH on Base
    // Celo Mainnet
    '0xcebA9300f2b948710d2653dD7B07f33A8B32118C': 'USDC', // Celo USDC
    '0x765DE816845861e75A25fCA122bb6898B8B1282a': 'cUSD', // Celo Dollar
    '0x471EcE3750Da237f93B8E339c536989b8978a438': 'CELO',
    '0x62492A644A588FD904270BeD06ad52B9abfEA1aE': 'cNGN', // Celo cNGN
    // Lisk Mainnet
    '0x05D032ac25d322df992303dCa074EE7392C117b9': 'USDT', // Lisk USDT
    '0x3e7eF8f50246f725885102E8238CBba33F276747': 'USDC', // Lisk USDC
    '0x6033F7f88332B8db6ad452B7C6d5bB643990aE3f': 'LSK',
    // Solana Mainnet
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC', // Solana USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT', // Solana USDT
    '11111111111111111111111111111111': 'SOL' // Native SOL
  };
  return tokens[tokenAddress] || 'Unknown';
}

/**
 * Fetch payment links from database
 */
async function fetchPaymentLinks(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    // Get user_ids from all wallet addresses
    const { data: userWallets, error: walletError } = await supabase
      .from('wallets')
      .select('user_id')
      .in('address', walletAddresses);

    if (walletError || !userWallets || userWallets.length === 0) {
      console.log('[fetchPaymentLinks] No users found for wallet addresses:', walletAddresses);
      return [];
    }

    const userIds = Array.from(new Set(userWallets.map(w => w.user_id))); // Remove duplicates

    // Build the query using created_by (user_id)
    let query = supabase
      .from('payment_links')
      .select('*')
      .in('created_by', userIds)
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .not('paid_amount', 'is', null);

    // Add time filtering
    if (startDate) {
      query = query.gte('paid_at', startDate);
    }
    if (endDate) {
      query = query.lte('paid_at', endDate);
    }

    // Add token filtering
    if (filter.token) {
      query = query.eq('token', filter.token.toUpperCase());
    }

    // Add network filtering
    if (filter.network) {
      query = query.eq('network', filter.network);
    }

    // Order by paid_at descending
    query = query.order('paid_at', { ascending: false });

    const { data: payments, error } = await query;

    if (error) {
      console.error('[fetchPaymentLinks] Database error:', error);
      throw new Error(`Failed to fetch payment links: ${error.message}`);
    }

    return payments || [];
  } catch (error) {
    console.error('[fetchPaymentLinks] Error:', error);
    return [];
  }
}

/**
 * Fetch paid invoices from database
 */
async function fetchPaidInvoices(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    // Get user_ids from all wallet addresses
    const { data: userWallets, error: walletError } = await supabase
      .from('wallets')
      .select('user_id')
      .in('address', walletAddresses);

    if (walletError || !userWallets || userWallets.length === 0) {
      console.log('[fetchPaidInvoices] No users found for wallet addresses:', walletAddresses);
      return [];
    }

    const userIds = Array.from(new Set(userWallets.map(w => w.user_id))); // Remove duplicates

    // Build the query using user_id
    let query = supabase
      .from('invoices')
      .select('*')
      .in('user_id', userIds)
      .eq('status', 'paid')
      .not('amount', 'is', null);

    // Try to use paid_at for filtering, fallback to created_at
    let usePaidAt = true;
    try {
      // Test if paid_at column exists by trying to select it
      const testQuery = await supabase
        .from('invoices')
        .select('paid_at')
        .limit(1);

      if (testQuery.error && testQuery.error.message.includes('paid_at')) {
        usePaidAt = false;
      }
    } catch (e) {
      usePaidAt = false;
    }

    if (usePaidAt) {
      // Use paid_at for filtering
      query = query.not('paid_at', 'is', null);
      if (startDate) {
        query = query.gte('paid_at', startDate);
      }
      if (endDate) {
        query = query.lte('paid_at', endDate);
      }
      query = query.order('paid_at', { ascending: false });
    } else {
      // Fallback to created_at
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      query = query.order('created_at', { ascending: false });
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error('[fetchPaidInvoices] Database error:', error);
      throw new Error(`Failed to fetch paid invoices: ${error.message}`);
    }

    return invoices || [];
  } catch (error) {
    console.error('[fetchPaidInvoices] Error:', error);
    return [];
  }
}

/**
 * Fetch offramp transactions from database
 */
async function fetchOfframpTransactions(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    // Get user_ids from all wallet addresses
    const { data: userWallets, error: walletError } = await supabase
      .from('wallets')
      .select('user_id')
      .in('address', walletAddresses);

    if (walletError || !userWallets || userWallets.length === 0) {
      console.log('[fetchOfframpTransactions] No users found for wallet addresses:', walletAddresses);
      return [];
    }

    const userIds = Array.from(new Set(userWallets.map(w => w.user_id))); // Remove duplicates

    // Build the query for successful offramp transactions
    // Include multiple success statuses that indicate money was withdrawn
    let query = supabase
      .from('offramp_transactions')
      .select('*')
      .in('user_id', userIds)
      .in('status', ['completed', 'success', 'fulfilled', 'settled', 'delivered'])
      .not('amount', 'is', null);

    console.log('[fetchOfframpTransactions] Querying for user IDs:', userIds);

    // Add time filtering
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Add token filtering
    if (filter.token) {
      query = query.eq('token', filter.token.toUpperCase());
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    const { data: transactions, error } = await query;

    if (error) {
      console.error('[fetchOfframpTransactions] Database error:', error);
      throw new Error(`Failed to fetch offramp transactions: ${error.message}`);
    }

    console.log(`[fetchOfframpTransactions] Found ${transactions?.length || 0} offramp transactions`);

    // Transform offramp transactions to match earnings format
    const transformedTransactions = (transactions || []).map(tx => ({
      id: tx.id,
      amount: parseFloat(tx.amount) || 0,
      token: tx.token || 'USDC',
      network: 'base', // Offramp transactions are typically on Base
      paid_at: tx.created_at,
      fiat_amount: tx.fiat_amount,
      fiat_currency: tx.fiat_currency || 'USD',
      category: 'offramp',
      paycrest_order_id: tx.paycrest_order_id,
      status: tx.status
    }));

    console.log('[fetchOfframpTransactions] Sample transformed transaction:', transformedTransactions[0]);
    return transformedTransactions;
  } catch (error) {
    console.error('[fetchOfframpTransactions] Error:', error);
    return [];
  }
}

/**
 * Fetch accepted proposals from database
 */
async function fetchAcceptedProposals(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    // Get user_ids from all wallet addresses
    const { data: userWallets, error: walletError } = await supabase
      .from('wallets')
      .select('user_id')
      .in('address', walletAddresses);

    if (walletError || !userWallets || userWallets.length === 0) {
      console.log('[fetchAcceptedProposals] No users found for wallet addresses:', walletAddresses);
      return [];
    }

    const userIds = Array.from(new Set(userWallets.map(w => w.user_id))); // Remove duplicates

    // First try with paid_at column, fallback to created_at if it doesn't exist
    let query = supabase
      .from('proposals')
      .select('*')
      .in('user_identifier', userIds)
      .eq('status', 'accepted')
      .not('amount', 'is', null);

    // Try to use paid_at for filtering, fallback to created_at
    let usePaidAt = true;
    try {
      // Test if paid_at column exists by trying to select it
      const testQuery = await supabase
        .from('proposals')
        .select('paid_at')
        .limit(1);

      if (testQuery.error && testQuery.error.message.includes('paid_at')) {
        usePaidAt = false;
      }
    } catch (e) {
      usePaidAt = false;
    }

    if (usePaidAt) {
      // Use paid_at for filtering
      query = query.not('paid_at', 'is', null);
      if (startDate) {
        query = query.gte('paid_at', startDate);
      }
      if (endDate) {
        query = query.lte('paid_at', endDate);
      }
      query = query.order('paid_at', { ascending: false });
    } else {
      // Fallback to created_at
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      query = query.order('created_at', { ascending: false });
    }

    const { data: proposals, error } = await query;

    if (error) {
      console.error('[fetchAcceptedProposals] Database error:', error);
      throw new Error(`Failed to fetch accepted proposals: ${error.message}`);
    }

    return proposals || [];
  } catch (error) {
    console.error('[fetchAcceptedProposals] Error:', error);
    return [];
  }
}

/**
 * Fetch withdrawal transactions (outgoing payments) from database
 */
async function fetchWithdrawalTransactions(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Handle both single and multiple wallet addresses
    const walletAddresses = filter.walletAddresses || (filter.walletAddress ? [filter.walletAddress] : []);
    if (walletAddresses.length === 0) {
      return [];
    }

    console.log('[fetchWithdrawalTransactions] Querying for withdrawal transactions from wallets:', walletAddresses);

    // Query payments table for outgoing transactions (where user's wallet is the payer)
    const lowerCaseWallets = walletAddresses.map(addr => addr.toLowerCase());
    let query = supabase
      .from('payments')
      .select('*')
      .in('payer_wallet', lowerCaseWallets)
      .eq('payment_type', 'direct_transfer');

    // Add time filtering
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Add token filtering
    if (filter.token) {
      query = query.eq('currency', filter.token.toUpperCase());
    }

    // Add network filtering
    if (filter.network) {
      query = query.eq('chain', filter.network);
    }

    // Order by created_at descending
    query = query.order('created_at', { ascending: false });

    const { data: withdrawals, error } = await query;

    if (error) {
      console.error('[fetchWithdrawalTransactions] Database error:', error);
      return [];
    }

    // Transform withdrawals to match earnings format
    return (withdrawals || []).map(withdrawal => ({
      id: withdrawal.id,
      amount: parseFloat(withdrawal.amount_paid) || 0,
      token: withdrawal.currency || 'ETH', // Use ETH as default to match database schema
      network: withdrawal.chain || 'base', // Use lowercase 'base' for consistency
      paid_at: withdrawal.created_at,
      transaction_hash: withdrawal.tx_hash,
      payment_reason: 'Withdrawal',
      wallet_address: withdrawal.payer_wallet,
      to_address: withdrawal.recipient_wallet,
      source: 'withdrawal',
      category: 'withdrawal'
    }));
  } catch (error) {
    console.error('[fetchWithdrawalTransactions] Error:', error);
    return [];
  }
}

/**
 * Categorize a payment based on metadata and patterns
 */
function categorizePayment(payment: any): string {
  const description = (payment.description || '').toLowerCase();
  const title = (payment.title || '').toLowerCase();
  const amount = parseFloat(payment.paid_amount) || 0;

  // Airdrop patterns
  if (description.includes('airdrop') || title.includes('airdrop') ||
    description.includes('claim') || title.includes('claim')) {
    return 'airdrop';
  }

  // Staking patterns
  if (description.includes('staking') || title.includes('staking') ||
    description.includes('reward') || title.includes('reward') ||
    description.includes('yield') || title.includes('yield')) {
    return 'staking';
  }

  // Freelance/work patterns
  if (description.includes('freelance') || title.includes('freelance') ||
    description.includes('project') || title.includes('project') ||
    description.includes('work') || title.includes('work') ||
    description.includes('service') || title.includes('service') ||
    description.includes('consulting') || title.includes('consulting')) {
    return 'freelance';
  }

  // Trading patterns
  if (description.includes('trading') || title.includes('trading') ||
    description.includes('profit') || title.includes('profit') ||
    description.includes('arbitrage') || title.includes('arbitrage')) {
    return 'trading';
  }

  // DeFi patterns
  if (description.includes('defi') || title.includes('defi') ||
    description.includes('liquidity') || title.includes('liquidity') ||
    description.includes('farming') || title.includes('farming') ||
    description.includes('pool') || title.includes('pool')) {
    return 'defi';
  }

  // NFT patterns
  if (description.includes('nft') || title.includes('nft') ||
    description.includes('collectible') || title.includes('collectible') ||
    description.includes('art') || title.includes('art')) {
    return 'nft';
  }

  // Gaming patterns
  if (description.includes('gaming') || title.includes('gaming') ||
    description.includes('game') || title.includes('game') ||
    description.includes('play') || title.includes('play')) {
    return 'gaming';
  }

  // Large amounts might be investments or major sales
  if (amount > 1000) {
    return 'investment';
  }

  // Default category
  return 'other';
}

/**
 * Get business statistics for a user (includes all invoices and proposals regardless of payment status)
 */
export async function getBusinessStats(userId: string) {
  try {
    // Get all invoices for the user
    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select('status, amount, currency')
      .eq('user_id', userId);

    // Get all proposals for the user
    const { data: proposals, error: proposalError } = await supabase
      .from('proposals')
      .select('status, amount, currency')
      .eq('user_id', userId);

    // Get all payment links for the user
    const { data: paymentLinks, error: paymentLinkError } = await supabase
      .from('payment_links')
      .select('status, amount, token')
      .eq('created_by', userId);

    if (invoiceError) {
      console.error('[getBusinessStats] Invoice error:', invoiceError);
    }
    if (proposalError) {
      console.error('[getBusinessStats] Proposal error:', proposalError);
    }
    if (paymentLinkError) {
      console.error('[getBusinessStats] Payment link error:', paymentLinkError);
    }

    const allInvoices = invoices || [];
    const allProposals = proposals || [];
    const allPaymentLinks = paymentLinks || [];

    // Calculate invoice stats
    const invoiceStats = {
      total: allInvoices.length,
      paid: allInvoices.filter(i => i.status === 'paid').length,
      pending: allInvoices.filter(i => ['sent', 'pending'].includes(i.status)).length,
      draft: allInvoices.filter(i => i.status === 'draft').length,
      overdue: allInvoices.filter(i => i.status === 'overdue').length,
      revenue: allInvoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => {
          const amount = parseFloat(i.amount) || 0;
          return sum + (i.currency === 'USD' ? amount : amount * 0.0012); // Simple conversion for non-USD
        }, 0)
    };

    // Calculate proposal stats
    const proposalStats = {
      total: allProposals.length,
      accepted: allProposals.filter(p => p.status === 'accepted').length,
      pending: allProposals.filter(p => ['sent', 'pending'].includes(p.status)).length,
      draft: allProposals.filter(p => p.status === 'draft').length,
      rejected: allProposals.filter(p => p.status === 'rejected').length,
      value: allProposals.reduce((sum, p) => {
        const amount = parseFloat(p.amount) || 0;
        return sum + (p.currency === 'USD' ? amount : amount * 0.0012); // Simple conversion for non-USD
      }, 0),
      revenue: allProposals
        .filter(p => p.status === 'accepted')
        .reduce((sum, p) => {
          const amount = parseFloat(p.amount) || 0;
          return sum + (p.currency === 'USD' ? amount : amount * 0.0012); // Simple conversion for non-USD
        }, 0)
    };

    // Calculate payment link stats
    const paymentLinkStats = {
      total: allPaymentLinks.length,
      paid: allPaymentLinks.filter(p => p.status === 'paid').length,
      pending: allPaymentLinks.filter(p => ['sent', 'pending', 'active'].includes(p.status)).length,
      draft: allPaymentLinks.filter(p => p.status === 'draft').length,
      expired: allPaymentLinks.filter(p => p.status === 'expired').length,
      revenue: allPaymentLinks
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => {
          const amount = parseFloat(p.amount) || 0;
          return sum + (p.token === 'USDC' ? amount : amount * 0.0012); // Simple conversion for non-USDC
        }, 0)
    };

    return {
      invoices: invoiceStats,
      proposals: proposalStats,
      paymentLinks: paymentLinkStats,
      totalRevenue: invoiceStats.revenue + proposalStats.revenue + paymentLinkStats.revenue
    };

  } catch (error) {
    console.error('[getBusinessStats] Error:', error);
    throw error;
  }
}

/**
 * Generate insights for earnings data
 */
async function generateEarningsInsights(
  items: any[], // All earnings sources
  earnings: EarningsSummaryItem[],
  filter: EarningsFilter
): Promise<EarningsInsights> {
  // Find largest payment
  const largestItem = items.reduce((max, item) => {
    const amount = parseFloat(item.paid_amount) || 0;
    const maxAmount = parseFloat(max.paid_amount) || 0;

    return amount > maxAmount ? item : max;
  }, items[0]);

  // Find most active network
  const networkCounts = items.reduce((acc, item) => {
    acc[item.network] = (acc[item.network] || 0) + 1;
    return acc;
  }, {} as { [key: string]: number });

  const mostActiveNetworkName = Object.keys(networkCounts).reduce((a, b) =>
    networkCounts[a] > networkCounts[b] ? a : b
  );

  const mostActiveNetworkData = earnings
    .filter(e => e.network === mostActiveNetworkName)
    .reduce((acc, e) => ({
      network: mostActiveNetworkName,
      count: acc.count + e.count,
      totalAmount: acc.totalAmount + e.total
    }), { network: mostActiveNetworkName, count: 0, totalAmount: 0 });

  // Find top token
  const topToken = earnings[0]; // Already sorted by total descending

  // Generate growth comparison if possible
  let growthComparison;
  try {
    growthComparison = await calculateGrowthComparison(filter);
  } catch (error) {
    console.warn('[generateEarningsInsights] Could not calculate growth comparison:', error);
  }

  // Generate motivational message
  const motivationalMessage = generateMotivationalMessage(earnings, growthComparison);

  // Calculate largest payment details
  let largestAmount = 0;
  let largestToken = '';
  let largestDate = '';
  let largestFiatValue = 0;

  // Payment link
  largestAmount = parseFloat(largestItem.paid_amount) || 0;
  largestToken = largestItem.token;
  largestDate = largestItem.paid_at;

  // Calculate fiat value if we have token prices
  try {
    const priceData = await getTokenPricesBySymbol([largestToken]);
    if (priceData.length > 0) {
      largestFiatValue = largestAmount * priceData[0].price;
    }
  } catch (error) {
    console.warn('[generateEarningsInsights] Could not get price for largest payment');
  }

  return {
    largestPayment: {
      amount: largestAmount,
      token: largestToken,
      network: largestItem.network,
      date: largestDate,
      fiatValue: largestFiatValue
    },
    mostActiveNetwork: mostActiveNetworkData,
    topToken: {
      token: topToken.token,
      totalAmount: topToken.total,
      percentage: topToken.percentage || 0
    },
    growthComparison,
    motivationalMessage
  };
}

/**
 * Calculate growth comparison with previous period
 */
async function calculateGrowthComparison(filter: EarningsFilter): Promise<EarningsInsights['growthComparison']> {
  if (!filter.timeframe || filter.timeframe === 'allTime') {
    return undefined;
  }

  // Calculate previous period dates
  const { startDate, endDate } = getDateRange(filter.timeframe, filter.startDate, filter.endDate);
  if (!startDate || !endDate) return undefined;

  const currentStart = new Date(startDate);
  const currentEnd = new Date(endDate);
  const periodLength = currentEnd.getTime() - currentStart.getTime();

  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodLength);

  // Get previous period earnings
  const previousFilter: EarningsFilter = {
    ...filter,
    startDate: previousStart.toISOString(),
    endDate: previousEnd.toISOString()
  };

  try {
    const previousEarnings = await getEarningsSummary(previousFilter, false);
    const currentTotal = await getEarningsSummary(filter, false);

    const growthPercentage = previousEarnings.totalFiatValue && previousEarnings.totalFiatValue > 0
      ? ((currentTotal.totalFiatValue || 0) - previousEarnings.totalFiatValue) / previousEarnings.totalFiatValue * 100
      : 0;

    return {
      previousPeriod: previousEarnings.totalFiatValue || 0,
      currentPeriod: currentTotal.totalFiatValue || 0,
      growthPercentage: Math.round(growthPercentage * 100) / 100,
      trend: growthPercentage > 5 ? 'up' : growthPercentage < -5 ? 'down' : 'stable'
    };
  } catch (error) {
    console.warn('[calculateGrowthComparison] Error:', error);
    return undefined;
  }
}

/**
 * Generate motivational message based on earnings data
 */
function generateMotivationalMessage(earnings: EarningsSummaryItem[], growthComparison?: EarningsInsights['growthComparison']): string {
  const totalFiat = earnings.reduce((sum, e) => sum + (e.fiatValue || 0), 0);
  const totalPayments = earnings.reduce((sum, e) => sum + e.count, 0);
  const hasMultipleNetworks = new Set(earnings.map(e => e.network)).size > 1;
  const hasUSDC = earnings.some(e => e.token === 'USDC');

  // Growth-based messages (most exciting!)
  if (growthComparison && growthComparison.growthPercentage > 50) {
    return `🚀 HODL up! You earned ${growthComparison.growthPercentage.toFixed(1)}% more than last period. That's some serious number-go-up energy! 📈`;
  }
  if (growthComparison && growthComparison.growthPercentage > 20) {
    return `🎯 Bullish! ${growthComparison.growthPercentage.toFixed(1)}% growth vs last period. Your wallet is definitely not rekt! 💪`;
  }
  if (growthComparison && growthComparison.growthPercentage > 0) {
    return `📊 Green candles! Up ${growthComparison.growthPercentage.toFixed(1)}% from last period. Slow and steady wins the race! 🐢💚`;
  }

  // High-value achievements
  if (totalFiat > 10000) {
    return `🏆 Whale alert! Over $${totalFiat.toFixed(0)} earned across ${totalPayments} payments. You're basically a crypto legend now! 🐋`;
  }
  if (totalFiat > 5000) {
    return `💎 Diamond hands paying off! $${totalFiat.toFixed(0)} earned shows you're building serious wealth. Keep stacking! 💎🙌`;
  }
  if (totalFiat > 1000) {
    return `🌟 Four-digit club! $${totalFiat.toFixed(0)} across ${totalPayments} payments. Your portfolio is looking mighty fine! ✨`;
  }

  // Activity-based messages
  if (totalPayments > 25) {
    return `🔥 Payment machine! ${totalPayments} transactions means you're absolutely crushing it. This is the gwei! ⚡`;
  }
  if (totalPayments > 10) {
    return `🎮 Combo streak! ${totalPayments} payments shows consistent earning. You've unlocked the 'Crypto Earner' achievement! 🏅`;
  }

  // Diversification messages
  if (hasMultipleNetworks && earnings.length > 3) {
    return `🌐 Multi-chain master! Earning across ${earnings.length} tokens on multiple networks. You're basically DeFi royalty! 👑`;
  }
  if (earnings.length > 3) {
    return `🎨 Portfolio artist! ${earnings.length} different tokens shows you're painting a beautiful diversification masterpiece! 🖼️`;
  }

  // Network-specific fun
  if (hasUSDC && hasMultipleNetworks) {
    return `🏦 Stablecoin strategist! USDC across multiple networks shows you know how to play it smart. Big brain energy! 🧠`;
  }

  // Encouraging messages for smaller amounts
  if (totalPayments > 1) {
    return `🌱 Growing strong! ${totalPayments} payments means you're building momentum. Rome wasn't built in a day, but they were laying bricks every hour! 🧱`;
  }

  // Default encouraging message
  return `🚀 Every satoshi counts! You're on the path to financial freedom, one transaction at a time. LFG! 🌙`;
}

/**
 * Calculate date range based on timeframe
 */
function getDateRange(timeframe?: string, startDate?: string, endDate?: string): { startDate: string | null, endDate: string | null } {
  if (startDate && endDate) {
    return { startDate, endDate };
  }

  const now = new Date();
  const endDateTime = endDate ? new Date(endDate) : now;
  let startDateTime: Date | null = null;

  switch (timeframe) {
    case 'today':
      startDateTime = new Date(now);
      startDateTime.setHours(0, 0, 0, 0); // Start of today
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999); // End of today
      return {
        startDate: startDateTime.toISOString(),
        endDate: endOfToday.toISOString()
      };
    case 'yesterday':
      startDateTime = new Date(now);
      startDateTime.setDate(startDateTime.getDate() - 1);
      startDateTime.setHours(0, 0, 0, 0); // Start of yesterday
      const endOfYesterday = new Date(now);
      endOfYesterday.setDate(endOfYesterday.getDate() - 1);
      endOfYesterday.setHours(23, 59, 59, 999); // End of yesterday
      return {
        startDate: startDateTime.toISOString(),
        endDate: endOfYesterday.toISOString()
      };
    case 'last7days':
      startDateTime = new Date(endDateTime);
      startDateTime.setDate(startDateTime.getDate() - 7);
      break;
    case 'lastMonth':
      startDateTime = new Date(endDateTime);
      startDateTime.setMonth(startDateTime.getMonth() - 1);
      break;
    case 'last3months':
      startDateTime = new Date(endDateTime);
      startDateTime.setMonth(startDateTime.getMonth() - 3);
      break;
    case 'lastYear':
      startDateTime = new Date(endDateTime);
      startDateTime.setFullYear(startDateTime.getFullYear() - 1);
      break;
    case 'custom':
      // For custom timeframes, startDate and endDate should be provided
      return { startDate: startDate || null, endDate: endDate || null };
    case 'allTime':
    default:
      startDateTime = null;
      break;
  }

  return {
    startDate: startDateTime ? startDateTime.toISOString() : null,
    endDate: endDateTime.toISOString()
  };
}

/**
 * Format chain names for display
 */
function formatChainName(network: string): string {
  const chainMap: { [key: string]: string } = {
    'base': 'Base',
    'base-mainnet': 'Base',
    'base mainnet': 'Base',
    'ethereum': 'Ethereum',
    'ethereum-mainnet': 'Ethereum',
    'polygon': 'Polygon',
    'polygon-mainnet': 'Polygon',
    'optimism': 'Optimism',
    'optimism-mainnet': 'Optimism',
    'arbitrum': 'Arbitrum',
    'arbitrum-one': 'Arbitrum',
    'arbitrum-mainnet': 'Arbitrum',
    'avalanche': 'Avalanche',
    'avalanche-mainnet': 'Avalanche',
    'bsc': 'BSC',
    'binance': 'BSC',
    'binance-smart-chain': 'BSC',
    'celo': 'Celo',
    'celo-mainnet': 'Celo',
    'lisk': 'Lisk',
    'lisk-mainnet': 'Lisk',
    'solana': 'Solana',
    'solana-mainnet': 'Solana'
  };

  const normalized = network.toLowerCase().trim();
  return chainMap[normalized] || network.charAt(0).toUpperCase() + network.slice(1).toLowerCase();
}

/**
 * Enhanced format earnings summary for natural language response
 */
export function formatEarningsForAgent(summary: EarningsSummaryResponse, type: 'earnings' | 'spending' = 'earnings'): string {
  const { walletAddress, timeframe, totalEarnings, totalFiatValue, totalPayments, earnings, period, insights } = summary;

  if (totalPayments === 0) {
    const action = type === 'earnings' ? 'earned' : 'spent';
    const emptyEmoji = type === 'earnings' ? '🦉' : '💸';
    const encouragement = type === 'earnings'
      ? "Time to start earning! Create some payment links or send out invoices. Your crypto journey awaits! 🚀"
      : "Your wallet is staying nice and cozy! No spending means more HODLing. 💎🙌";
    return `${emptyEmoji} You haven't ${action} anything${timeframe !== 'allTime' ? ` in the ${timeframe}` : ''}. ${encouragement}`;
  }

  const action = type === 'earnings' ? 'earned' : 'spent';
  const timeframeText = timeframe === 'allTime' ? 'all time' : timeframe.replace(/([A-Z])/g, ' $1').toLowerCase();
  const headerEmoji = type === 'earnings' ? '💰' : '💸';

  let response = `${headerEmoji} **${type.charAt(0).toUpperCase() + type.slice(1)} Summary**\n\n`;

  // Main summary with fiat value and fun language
  if (totalFiatValue && totalFiatValue > 0) {
    const fiatFormatted = totalFiatValue >= 1000 ? `$${(totalFiatValue / 1000).toFixed(1)}k` : `$${totalFiatValue.toFixed(2)}`;
    response += `You've ${action} **${fiatFormatted} USD** across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}. `;
    if (type === 'earnings') {
      response += totalFiatValue > 1000 ? "That's some serious bag building! 💪\n\n" : "Nice work stacking those sats! 📈\n\n";
    } else {
      response += "Hope it was worth it! 😄\n\n";
    }
  } else {
    response += `You've ${action} tokens across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}. Keep building! 🔨\n\n`;
  }

  // Payment source breakdown
  const sourceBreakdown = new Map<string, { count: number; value: number; tokens: Set<string> }>();
  earnings.forEach(earning => {
    if (earning.source) {
      const sources = earning.source.split(', ');
      sources.forEach(source => {
        if (!sourceBreakdown.has(source)) {
          sourceBreakdown.set(source, { count: 0, value: 0, tokens: new Set() });
        }
        const breakdown = sourceBreakdown.get(source)!;
        breakdown.count += earning.count;
        breakdown.value += earning.fiatValue || 0;
        breakdown.tokens.add(earning.token);
      });
    }
  });

  if (sourceBreakdown.size > 1) {
    response += `📊 **Payment Sources:**\n`;
    Array.from(sourceBreakdown.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .forEach(([source, data]) => {
        const sourceEmoji = source === 'payment_link' ? '🔗' : source === 'invoice' ? '📄' : source === 'payment_events' ? '💸' : source === 'proposal' ? '📋' : '💰';
        const sourceName = source === 'payment_link' ? 'Payment Links' :
          source === 'invoice' ? 'Invoices' :
            source === 'payment_events' ? 'Direct Transfers' :
              source === 'proposal' ? 'Proposals' :
                source === 'offramp' ? 'Crypto Withdrawals' : source;
        const valueText = data.value > 0 ? ` ($${data.value.toFixed(2)})` : '';
        const tokenCount = data.tokens.size;
        const tokenText = tokenCount > 1 ? ` across ${tokenCount} tokens` : '';
        response += `${sourceEmoji} **${sourceName}:** ${data.count} payment${data.count > 1 ? 's' : ''}${valueText}${tokenText}\n`;
      });
    response += '\n';
  }

  // Token breakdown with blockchain info
  const tokenSummary = new Map<string, { total: number; networks: Set<string>; fiatValue: number; count: number }>();
  earnings.forEach(earning => {
    if (!tokenSummary.has(earning.token)) {
      tokenSummary.set(earning.token, { total: 0, networks: new Set(), fiatValue: 0, count: 0 });
    }
    const summary = tokenSummary.get(earning.token)!;
    summary.total += earning.total;
    summary.networks.add(earning.network);
    summary.fiatValue += earning.fiatValue || 0;
    summary.count += earning.count;
  });

  response += `🪙 **Token Summary:**\n`;
  Array.from(tokenSummary.entries())
    .sort((a, b) => b[1].fiatValue - a[1].fiatValue)
    .forEach(([token, data], index) => {
      const tokenEmoji = token === 'USDC' ? '💵' : token === 'USDT' ? '💰' : token === 'cUSD' ? '💵' : token === 'CELO' ? '🟡' : token === 'LSK' ? '🔵' : '🪙';
      const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
      const fiatText = data.fiatValue > 0 ? ` ($${data.fiatValue.toFixed(2)})` : '';
      const networkCount = data.networks.size;
      const networkText = networkCount > 1 ? ` across ${networkCount} blockchain${networkCount > 1 ? 's' : ''}` : ` on ${formatChainName(Array.from(data.networks)[0])}`;

      response += `${rankEmoji} **${data.total.toFixed(8)} ${token}** ${tokenEmoji}${fiatText}${networkText}\n`;
      response += `  ${data.count} payment${data.count > 1 ? 's' : ''}\n\n`;
    });

  // Detailed breakdown if multiple networks per token
  const multiNetworkTokens = Array.from(tokenSummary.entries()).filter(([_, data]) => data.networks.size > 1);
  if (multiNetworkTokens.length > 0) {
    response += `⛓️ **Network Breakdown:**\n`;
    multiNetworkTokens.forEach(([token, _]) => {
      const tokenEarnings = earnings.filter(e => e.token === token);
      tokenEarnings.forEach(earning => {
        const fiatText = earning.fiatValue ? ` ($${earning.fiatValue.toFixed(2)})` : '';
        response += `• **${earning.total} ${token}** on ${formatChainName(earning.network)}${fiatText}\n`;
      });
    });
    response += '\n';
  }

  // Add insights if available with fun language
  if (insights) {
    response += `🔍 **Fun Facts:**\n`;

    if (insights.largestPayment) {
      const { amount, token, network, fiatValue } = insights.largestPayment;
      const fiatText = fiatValue ? ` ($${fiatValue.toFixed(2)})` : '';
      const bigPaymentEmoji = fiatValue && fiatValue > 1000 ? '🐋' : fiatValue && fiatValue > 100 ? '🦈' : '🐟';
      response += `${bigPaymentEmoji} Biggest splash: **${amount} ${token}** on ${formatChainName(network)}${fiatText}\n`;
    }

    if (insights.mostActiveNetwork) {
      const { network, count, totalAmount } = insights.mostActiveNetwork;
      const networkEmoji = network.toLowerCase().includes('polygon') ? '🟣' : network.toLowerCase().includes('ethereum') ? '💎' : network.toLowerCase().includes('base') ? '🔵' : '⛓️';
      response += `${networkEmoji} Network champion: **${formatChainName(network)}** (${count} payments, ${totalAmount.toFixed(4)} total)\n`;
    }

    if (insights.topToken) {
      const { token, percentage } = insights.topToken;
      const tokenEmoji = token === 'USDC' ? '👑' : token === 'USDT' ? '🏆' : token === 'cUSD' ? '👑' : token === 'CELO' ? '🟡' : token === 'LSK' ? '🔵' : '🪙';
      response += `${tokenEmoji} Token MVP: **${token}** (${percentage}% of portfolio)\n`;
    }

    if (insights.growthComparison) {
      const { growthPercentage, trend } = insights.growthComparison;
      const trendEmoji = trend === 'up' ? '🚀' : trend === 'down' ? '📉' : '🔄';
      const trendText = trend === 'up' ? 'crushing it with a' : trend === 'down' ? 'taking a breather with a' : 'staying steady with';
      response += `${trendEmoji} Momentum check: You're ${trendText} ${Math.abs(growthPercentage)}% ${trend === 'up' ? 'boost' : trend === 'down' ? 'dip' : 'hold'} vs last period\n`;
    }

    response += `\n${insights.motivationalMessage}\n`;
  }

  if (period.startDate) {
    const start = new Date(period.startDate).toLocaleDateString();
    const end = new Date(period.endDate).toLocaleDateString();
    response += `\n📅 Period: ${start} to ${end}`;
  }

  return response;
}

/**
 * Enhanced parse natural language queries for earnings with better date parsing
 */
export function parseEarningsQuery(query: string): EarningsFilter | null {
  const lowerQuery = query.toLowerCase();

  // Extract wallet address if mentioned (basic pattern)
  const walletMatch = lowerQuery.match(/0x[a-f0-9]{40}/i);

  // Extract timeframe with more patterns
  let timeframe: EarningsFilter['timeframe'] = 'allTime';
  let startDate: string | undefined;
  let endDate: string | undefined;

  // Today/Yesterday patterns
  if (lowerQuery.includes('today') || lowerQuery.includes('this day')) {
    timeframe = 'today';
  }
  else if (lowerQuery.includes('yesterday')) {
    timeframe = 'yesterday';
  }
  // Week patterns
  else if (lowerQuery.includes('this week') || lowerQuery.includes('last 7 days') ||
    lowerQuery.includes('past week') || lowerQuery.includes('last week')) {
    timeframe = 'last7days';
  }
  // Month patterns
  else if (lowerQuery.includes('this month') || lowerQuery.includes('last month') ||
    lowerQuery.includes('past month')) {
    timeframe = 'lastMonth';
  }
  // Quarter patterns
  else if (lowerQuery.includes('last 3 months') || lowerQuery.includes('past 3 months') ||
    lowerQuery.includes('this quarter') || lowerQuery.includes('last quarter')) {
    timeframe = 'last3months';
  }
  // Year patterns
  else if (lowerQuery.includes('this year') || lowerQuery.includes('last year') ||
    lowerQuery.includes('past year')) {
    timeframe = 'lastYear';
  }
  // Custom date range patterns
  else if (lowerQuery.includes('from') && lowerQuery.includes('to')) {
    timeframe = 'custom';
    // Try to extract dates (basic pattern matching)
    const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)/gi;
    const dates = lowerQuery.match(datePattern);
    if (dates && dates.length >= 2) {
      try {
        startDate = new Date(dates[0]).toISOString();
        endDate = new Date(dates[1]).toISOString();
      } catch (e) {
        console.warn('Could not parse custom dates:', dates);
      }
    }
  }

  // Extract token with more patterns
  let token: string | undefined;
  const tokenPatterns = ['usdc', 'usdt', 'dai', 'cusd', 'celo', 'lsk', 'matic', 'btc', 'sol', 'avax', 'link'];
  for (const tokenPattern of tokenPatterns) {
    if (lowerQuery.includes(tokenPattern)) {
      token = tokenPattern.toUpperCase();
      break;
    }
  }

  // Extract network with more patterns
  let network: string | undefined;
  const networkPatterns = ['base', 'polygon', 'ethereum', 'optimism', 'avalanche', 'bsc', 'solana', 'celo', 'lisk'];
  // DISABLED NETWORKS: BEP20 and Asset Chain patterns are defined but not active
  // Additional patterns when enabled: 'bsc-testnet', 'asset-chain', 'asset-chain-testnet'
  for (const networkPattern of networkPatterns) {
    if (lowerQuery.includes(networkPattern)) {
      network = networkPattern.charAt(0).toUpperCase() + networkPattern.slice(1);
      break;
    }
  }

  // Extract category
  let category: string | undefined;
  const categoryPatterns = ['freelance', 'airdrop', 'staking', 'trading', 'defi', 'nft', 'gaming', 'investment'];
  for (const categoryPattern of categoryPatterns) {
    if (lowerQuery.includes(categoryPattern)) {
      category = categoryPattern;
      break;
    }
  }

  return {
    walletAddress: walletMatch ? walletMatch[0] : '',
    timeframe,
    startDate,
    endDate,
    token,
    network,
    category
  };
}

// Enhanced Natural Language Processing for Earnings

import { TimePeriodExtractor, TimePeriod } from './timePeriodExtractor';

export interface EnhancedEarningsFilter extends EarningsFilter {
  naturalQuery?: string;
  extractedTimeframe?: string;
  comparisonPeriod?: boolean;
  includeInsights?: boolean;
}

export interface UserData {
  name?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  telegramUsername?: string;
}

/**
 * Process natural language earnings query and return earnings data
 */
export async function getEarningsForNaturalQuery(
  query: string,
  walletAddresses: string[],
  userData?: UserData
): Promise<EarningsSummaryResponse> {
  const { EarningsErrorHandler } = await import('./earningsErrorHandler');

  try {
    // Validate inputs
    EarningsErrorHandler.validateQuery(query);
    EarningsErrorHandler.validateWalletAddresses(walletAddresses);

    console.log('[getEarningsForNaturalQuery] Processing query:', query);

    // Extract time period from query with error handling
    let timePeriod;
    try {
      timePeriod = TimePeriodExtractor.extractFromQuery(query);
      console.log('[getEarningsForNaturalQuery] Extracted time period:', timePeriod);
    } catch (error) {
      throw EarningsErrorHandler.handleTimePeriodError(query);
    }

    // Build enhanced filter
    const filter: EnhancedEarningsFilter = {
      walletAddresses,
      naturalQuery: query,
      includeInsights: true
    };

    // Apply time period if extracted
    if (timePeriod) {
      filter.timeframe = timePeriod.timeframe as any;
      filter.startDate = timePeriod.startDate;
      filter.endDate = timePeriod.endDate;
      filter.extractedTimeframe = timePeriod.displayName;
    } else {
      // Default to current month if no time period specified
      const defaultPeriod = TimePeriodExtractor.parseRelativeTime('this month');
      if (defaultPeriod) {
        filter.timeframe = defaultPeriod.timeframe as any;
        filter.startDate = defaultPeriod.startDate;
        filter.endDate = defaultPeriod.endDate;
        filter.extractedTimeframe = defaultPeriod.displayName;
      }
    }

    // Extract token and network from query
    const queryLower = query.toLowerCase();

    // Token extraction
    const tokenPatterns = [
      { pattern: /\busdc\b/i, token: 'USDC' },
      { pattern: /\busdt\b/i, token: 'USDT' },
      { pattern: /\beth\b/i, token: 'ETH' },
      { pattern: /\bsol\b/i, token: 'SOL' },
      { pattern: /\bcusd\b/i, token: 'CUSD' },
      { pattern: /\bcelo\b/i, token: 'CELO' }
    ];

    for (const { pattern, token } of tokenPatterns) {
      if (pattern.test(query)) {
        filter.token = token;
        break;
      }
    }

    // Network extraction
    const networkPatterns = [
      { pattern: /\bon\s+base\b/i, network: 'base' },
      { pattern: /\bon\s+ethereum\b/i, network: 'ethereum' },
      { pattern: /\bon\s+polygon\b/i, network: 'polygon' },
      { pattern: /\bon\s+solana\b/i, network: 'solana' },
      { pattern: /\bon\s+celo\b/i, network: 'celo' },
      { pattern: /\bon\s+lisk\b/i, network: 'lisk' },
      { pattern: /\bbase\s+earnings\b/i, network: 'base' },
      { pattern: /\bethereum\s+earnings\b/i, network: 'ethereum' },
      { pattern: /\bsolana\s+earnings\b/i, network: 'solana' }
    ];

    for (const { pattern, network } of networkPatterns) {
      if (pattern.test(query)) {
        filter.network = network;
        break;
      }
    }

    console.log('[getEarningsForNaturalQuery] Final filter:', filter);

    // Get earnings using existing service with retry logic
    const earnings = await EarningsErrorHandler.withRetry(async () => {
      try {
        return await getEarningsSummary(filter, true);
      } catch (error) {
        if (error instanceof Error && error.message.includes('database')) {
          throw EarningsErrorHandler.handleDatabaseError(error);
        }
        throw error;
      }
    });

    // Check if we got any data
    if (earnings.totalEarnings === 0 && earnings.totalPayments === 0) {
      // This might be legitimate (no earnings) or an error, let's check
      console.log('[getEarningsForNaturalQuery] No earnings data found');
    }

    // Enhance response with natural language context
    if (timePeriod) {
      earnings.period = {
        startDate: timePeriod.startDate,
        endDate: timePeriod.endDate
      };
    }

    return earnings;

  } catch (error) {
    console.error('[getEarningsForNaturalQuery] Error:', error);

    // Re-throw EarningsError as-is
    if (error instanceof Error && error.name === 'EarningsError') {
      throw error;
    }

    // Wrap other errors
    throw EarningsErrorHandler.handleGenericError(
      error instanceof Error ? error : new Error(String(error)),
      'processing natural language query'
    );
  }
}

/**
 * Generate earnings PDF for natural language query
 */
export async function generateEarningsPdfForQuery(
  query: string,
  walletAddresses: string[],
  userData?: UserData
): Promise<Buffer> {
  try {
    console.log('[generateEarningsPdfForQuery] Processing query:', query);

    // Get earnings data using natural query processing
    const earningsData = await getEarningsForNaturalQuery(query, walletAddresses, userData);

    // Import PDF generator
    const { generateEarningsPDF } = await import('../modules/pdf-generator-earnings');

    // Transform earnings data for PDF generation
    const pdfData = {
      ...earningsData,
      userData
    };

    console.log('[generateEarningsPdfForQuery] Generating PDF with data:', {
      totalEarnings: pdfData.totalEarnings,
      totalPayments: pdfData.totalPayments,
      timeframe: pdfData.timeframe,
      period: pdfData.period
    });

    // Generate PDF
    const pdfBuffer = await generateEarningsPDF(pdfData);

    return pdfBuffer;

  } catch (error) {
    console.error('[generateEarningsPdfForQuery] Error:', error);
    throw error;
  }
}

/**
 * Get enhanced earnings summary with better natural language support
 */
export async function getEnhancedEarningsSummary(
  filter: EnhancedEarningsFilter
): Promise<EarningsSummaryResponse & { naturalLanguageContext?: string }> {
  try {
    // Get base earnings data
    const earnings = await getEarningsSummary(filter, filter.includeInsights);

    // Add natural language context
    let naturalLanguageContext = '';

    if (filter.extractedTimeframe) {
      naturalLanguageContext = `Earnings for ${filter.extractedTimeframe}`;
    } else if (filter.timeframe) {
      naturalLanguageContext = `Earnings for ${TimePeriodExtractor.getTimeframeDescription(filter.timeframe)}`;
    }

    if (filter.token) {
      naturalLanguageContext += ` in ${filter.token}`;
    }

    if (filter.network) {
      naturalLanguageContext += ` on ${filter.network}`;
    }

    return {
      ...earnings,
      naturalLanguageContext
    };

  } catch (error) {
    console.error('[getEnhancedEarningsSummary] Error:', error);
    throw error;
  }
}

/**
 * Format earnings response for natural language display
 */
export function formatEarningsForNaturalLanguage(
  earnings: EarningsSummaryResponse,
  query: string,
  format: 'telegram' | 'web' | 'api' = 'telegram'
): string {
  const { EarningsResponseFormatter } = require('./earningsResponseFormatter');

  const formatted = EarningsResponseFormatter.formatEarningsResponse(
    earnings,
    query,
    {
      includeBreakdown: true,
      includeInsights: true,
      includeSuggestions: true,
      format
    }
  );

  // Combine all parts into a single response
  let response = formatted.message;

  if (formatted.summary) {
    response += `\n\n${formatted.summary}`;
  }

  if (formatted.breakdown) {
    response += `\n\n${formatted.breakdown}`;
  }

  if (formatted.insights) {
    response += `\n\n${formatted.insights}`;
  }

  if (formatted.suggestions) {
    response += `\n\n${formatted.suggestions}`;
  }

  return response.trim();
}

/**
 * Enhanced date range calculation with TimePeriodExtractor integration
 */
export function getEnhancedDateRange(
  timeframe?: string,
  startDate?: string,
  endDate?: string,
  naturalQuery?: string
): { startDate: string | null; endDate: string | null } {
  // If natural query is provided, try to extract time period
  if (naturalQuery) {
    const timePeriod = TimePeriodExtractor.extractFromQuery(naturalQuery);
    if (timePeriod) {
      return {
        startDate: timePeriod.startDate,
        endDate: timePeriod.endDate
      };
    }
  }

  // If timeframe is provided, convert it to time period
  if (timeframe) {
    const timePeriod = TimePeriodExtractor.timeframeToTimePeriod(timeframe);
    if (timePeriod) {
      return {
        startDate: timePeriod.startDate,
        endDate: timePeriod.endDate
      };
    }
  }

  // Fall back to existing getDateRange function
  return getDateRange(timeframe, startDate, endDate);
}