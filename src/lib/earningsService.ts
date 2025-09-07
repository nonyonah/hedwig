import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';
import { getTokenPricesBySymbol } from './tokenPriceService';

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
 * Get earnings summary for a wallet address with optional filtering
 */
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

    // Fetch all earnings sources
    const [paymentLinks, invoices, proposals, paymentEvents, offrampTransactions] = await Promise.all([
      fetchPaymentLinks(filter, startDate, endDate),
      fetchPaidInvoices(filter, startDate, endDate),
      fetchAcceptedProposals(filter, startDate, endDate),
      fetchPaymentEvents(filter, startDate, endDate),
      fetchOfframpTransactions(filter, startDate, endDate)
    ]);

    console.log(`[getEarningsSummary] Found ${paymentLinks.length} payment links, ${invoices.length} paid invoices, ${proposals.length} accepted proposals, ${paymentEvents.length} payment events, ${offrampTransactions.length} offramp transactions`);

    // Combine all earnings sources
    const allEarnings = [
      ...paymentLinks.map(p => ({ ...p, source: 'payment_link' as const })),
      ...invoices.map(i => ({ 
        ...i, 
        source: 'invoice' as const,
        token: i.currency || 'USD', // Invoices are typically in USD
        network: i.blockchain || 'unknown',
        paid_amount: i.amount,
        paid_at: i.paid_at || i.created_at || new Date().toISOString(), // Use paid_at if available, fallback to created_at
        title: i.project_description || 'Invoice Payment',
        description: i.additional_notes || ''
      })),
      ...proposals.map(p => ({ 
        ...p, 
        source: 'proposal' as const,
        token: p.currency || 'USD', // Proposals have currency field
        network: 'unknown', // Proposals don't specify network
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
        paid_amount: o.amount,
        title: 'Crypto Withdrawal',
        description: `Offramp to ${o.fiat_currency || 'USD'}`
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
    const paymentTokens = allEarnings.map(p => p.token);
    const uniqueTokens = [...new Set(paymentTokens)];
    
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

    // Process all earnings sources
    for (const earning of categorizedEarnings) {
      const key = `${earning.token}-${earning.network}`;
      const amount = parseFloat(earning.paid_amount) || 0;
      const fiatValue = (tokenPrices[earning.token] || 0) * amount;
      
      totalEarnings += amount;
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
        percentage: totalEarnings > 0 ? Math.round((item.total / totalEarnings) * 10000) / 100 : 0,
        category: item.category,
        source: Array.from(item.sources).join(', ') // Convert Set to comma-separated string
      };
    });

    // Sort by total earnings descending
    earnings.sort((a, b) => b.total - a.total);

    const result: EarningsSummaryResponse = {
    walletAddress: filter.walletAddress, // For backward compatibility
    walletAddresses: walletAddresses,
    timeframe: filter.timeframe || 'allTime',
    totalEarnings: Math.round(totalEarnings * 100000000) / 100000000,
    totalFiatValue: Math.round(totalFiatValue * 100) / 100,
    totalPayments: allEarnings.length,
    earnings,
    period: {
      startDate: startDate || '',
      endDate: endDate || new Date().toISOString()
    }
  };

    // Add insights if requested
  if (includeInsights && allEarnings.length > 0) {
    result.insights = await generateEarningsInsights(categorizedEarnings, earnings, filter);
  }

    return result;

  } catch (error) {
    console.error('[getEarningsSummary] Error:', error);
    throw error;
  }
}

/**
 * Fetch payment events from blockchain tracking
 */
async function fetchPaymentEvents(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
    // Build the query for payment events
    let query = supabase
      .from('payment_events')
      .select('*')
      .eq('freelancer', filter.walletAddress)
      .eq('processed', true);

    // Add time filtering
    if (startDate) {
      query = query.gte('timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    // Add token filtering (need to map token addresses to symbols)
    if (filter.token) {
      // Map common token symbols to addresses for filtering
      const tokenAddresses: { [key: string]: string } = {
        'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        'USDbC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'
      };
      const tokenAddress = tokenAddresses[filter.token.toUpperCase()];
      if (tokenAddress) {
        query = query.eq('token', tokenAddress);
      }
    }

    // Order by timestamp descending
    query = query.order('timestamp', { ascending: false });

    const { data: events, error } = await query;

    if (error) {
      console.error('[fetchPaymentEvents] Database error:', error);
      throw new Error(`Failed to fetch payment events: ${error.message}`);
    }

    // Transform payment events to match earnings format
    return (events || []).map(event => ({
      id: event.id,
      amount: parseFloat(event.amount), // Amount is already in token units, no conversion needed
      token: getTokenSymbol(event.token),
      network: 'Base', // Payment events are on Base network
      paid_at: event.timestamp,
      transaction_hash: event.transaction_hash,
      payment_reason: `Direct transfer - Invoice ${event.invoice_id}`,
      wallet_address: event.freelancer,
      payer_wallet_address: event.payer,
      source: 'payment_events',
      category: 'freelance'
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
    // Base
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'USDT',
    '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': 'USDbC',
    // Ethereum
    '0xA0b86a33E6441b8C4505E2c52C6b6046d5b0b6e6': 'USDC',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT',
    // BSC
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'USDC',
    '0x55d398326f99059fF775485246999027B3197955': 'USDT',
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': 'WBNB',
    // Arbitrum One
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT',
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1': 'WETH',
    // Celo
    '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': 'USDT',
    '0x471EcE3750Da237f93B8E339c536989b8978a438': 'CELO',
    // Lisk
    '0x6033F7f88332B8db6ad452B7C6d5bB643990aE3f': 'LSK'
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

    const userIds = [...new Set(userWallets.map(w => w.user_id))]; // Remove duplicates

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

    const userIds = [...new Set(userWallets.map(w => w.user_id))]; // Remove duplicates

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
    // First get the user_id from the wallet address
    const { data: userWallets, error: walletError } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('address', filter.walletAddress)
      .limit(1);

    if (walletError || !userWallets || userWallets.length === 0) {
      console.log('[fetchOfframpTransactions] No user found for wallet address:', filter.walletAddress);
      return [];
    }

    const userId = userWallets[0].user_id;

    // Build the query for completed offramp transactions
    let query = supabase
      .from('offramp_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .not('amount', 'is', null);

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

    // Transform offramp transactions to match earnings format
    return (transactions || []).map(tx => ({
      id: tx.id,
      amount: parseFloat(tx.amount) || 0,
      token: tx.token || 'USDC',
      network: 'Base', // Offramp transactions are typically on Base
      paid_at: tx.created_at,
      fiat_amount: tx.fiat_amount,
      fiat_currency: tx.fiat_currency || 'USD',
      category: 'offramp'
    }));
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

    const userIds = [...new Set(userWallets.map(w => w.user_id))]; // Remove duplicates

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
export async function getSpendingSummary(filter: EarningsFilter): Promise<EarningsSummaryResponse> {
  try {
    console.log('[getSpendingSummary] Fetching spending for:', filter);

    // Calculate date range based on timeframe
    const { startDate, endDate } = getDateRange(filter.timeframe, filter.startDate, filter.endDate);

    // Build the query for payments made by this wallet
    let query = supabase
      .from('payment_links')
      .select('*')
      .eq('payer_wallet_address', filter.walletAddress)
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
      console.error('[getSpendingSummary] Database error:', error);
      throw new Error(`Failed to fetch spending: ${error.message}`);
    }

    if (!payments || payments.length === 0) {
      return {
        walletAddress: filter.walletAddress,
        timeframe: filter.timeframe || 'allTime',
        totalEarnings: 0, // This represents total spending in this context
        totalPayments: 0,
        earnings: [], // This represents spending breakdown in this context
        period: {
          startDate: startDate || '',
          endDate: endDate || new Date().toISOString()
        }
      };
    }

    // Group and aggregate spending by token and network
    const spendingMap = new Map<string, {
      token: string;
      network: string;
      total: number;
      count: number;
      payments: any[];
    }>();

    let totalSpending = 0;

    for (const payment of payments) {
      const key = `${payment.token}-${payment.network}`;
      const amount = parseFloat(payment.paid_amount) || 0;
      
      totalSpending += amount;

      if (spendingMap.has(key)) {
        const existing = spendingMap.get(key)!;
        existing.total += amount;
        existing.count += 1;
        existing.payments.push(payment);
      } else {
        spendingMap.set(key, {
          token: payment.token,
          network: payment.network,
          total: amount,
          count: 1,
          payments: [payment]
        });
      }
    }

    // Convert to final format
    const spending: EarningsSummaryItem[] = Array.from(spendingMap.values()).map(item => ({
      token: item.token,
      network: item.network,
      total: Math.round(item.total * 100000000) / 100000000,
      count: item.count,
      averageAmount: Math.round((item.total / item.count) * 100000000) / 100000000,
      lastPayment: item.payments[0]?.paid_at
    }));

    // Sort by total spending descending
    spending.sort((a, b) => b.total - a.total);

    return {
      walletAddress: filter.walletAddress,
      timeframe: filter.timeframe || 'allTime',
      totalEarnings: Math.round(totalSpending * 100000000) / 100000000,
      totalPayments: payments.length,
      earnings: spending,
      period: {
        startDate: startDate || '',
        endDate: endDate || new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('[getSpendingSummary] Error:', error);
    throw error;
  }
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
    const fiatFormatted = totalFiatValue >= 1000 ? `$${(totalFiatValue/1000).toFixed(1)}k` : `$${totalFiatValue.toFixed(2)}`;
    response += `You've ${action} **${totalEarnings} tokens** (≈ **${fiatFormatted} USD**) across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}. `;
    if (type === 'earnings') {
      response += totalFiatValue > 1000 ? "That's some serious bag building! 💪\n\n" : "Nice work stacking those sats! 📈\n\n";
    } else {
      response += "Hope it was worth it! 😄\n\n";
    }
  } else {
    response += `You've ${action} **${totalEarnings} tokens** across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}. Keep building! 🔨\n\n`;
  }
  
  // Breakdown by token with fun formatting and emojis
  response += `🪙 **Token Breakdown:**\n`;
  
  for (const [index, earning] of earnings.entries()) {
    const fiatText = earning.fiatValue ? ` (≈ $${earning.fiatValue.toFixed(2)})` : '';
    const percentageText = earning.percentage ? ` • ${earning.percentage}%` : '';
    const categoryText = earning.category && earning.category !== 'other' ? ` • ${earning.category}` : '';
    const tokenEmoji = earning.token === 'USDC' ? '💵' : earning.token === 'ETH' ? '💎' : earning.token === 'USDT' ? '💰' : '🪙';
    const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
    
    response += `${rankEmoji} **${earning.total} ${earning.token}** ${tokenEmoji}${fiatText} on ${earning.network}\n`;
    response += `  ${earning.count} payment${earning.count > 1 ? 's' : ''} • avg: ${earning.averageAmount} ${earning.token}${percentageText}${categoryText}\n\n`;
  }

  // Add insights if available with fun language
  if (insights) {
    response += `🔍 **Fun Facts:**\n`;
    
    if (insights.largestPayment) {
      const { amount, token, network, fiatValue } = insights.largestPayment;
      const fiatText = fiatValue ? ` ($${fiatValue.toFixed(2)})` : '';
      const bigPaymentEmoji = fiatValue && fiatValue > 1000 ? '🐋' : fiatValue && fiatValue > 100 ? '🦈' : '🐟';
      response += `${bigPaymentEmoji} Biggest splash: **${amount} ${token}** on ${network}${fiatText}\n`;
    }
    
    if (insights.mostActiveNetwork) {
      const { network, count, totalAmount } = insights.mostActiveNetwork;
      const networkEmoji = network.toLowerCase().includes('polygon') ? '🟣' : network.toLowerCase().includes('ethereum') ? '💎' : network.toLowerCase().includes('base') ? '🔵' : '⛓️';
      response += `${networkEmoji} Network champion: **${network}** (${count} payments, ${totalAmount.toFixed(4)} total)\n`;
    }
    
    if (insights.topToken) {
      const { token, percentage } = insights.topToken;
      const tokenEmoji = token === 'USDC' ? '👑' : token === 'ETH' ? '💎' : token === 'USDT' ? '🏆' : '🪙';
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
  const tokenPatterns = ['usdc', 'usdt', 'dai', 'eth', 'matic', 'weth', 'btc', 'sol', 'avax', 'link'];
  for (const tokenPattern of tokenPatterns) {
    if (lowerQuery.includes(tokenPattern)) {
      token = tokenPattern.toUpperCase();
      break;
    }
  }

  // Extract network with more patterns
  let network: string | undefined;
  const networkPatterns = ['base', 'polygon', 'ethereum', 'optimism', 'avalanche', 'bsc', 'solana', 'celo'];
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