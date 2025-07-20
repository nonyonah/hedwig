import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface EarningsFilter {
  walletAddress: string;
  token?: string;
  network?: string;
  timeframe?: 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime';
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

export interface EarningsSummaryItem {
  token: string;
  network: string;
  total: number;
  count: number; // number of payments
  averageAmount: number;
  lastPayment?: string; // ISO date string
}

export interface EarningsSummaryResponse {
  walletAddress: string;
  timeframe: string;
  totalEarnings: number;
  totalPayments: number;
  earnings: EarningsSummaryItem[];
  period: {
    startDate: string;
    endDate: string;
  };
}

/**
 * Get earnings summary for a wallet address with optional filtering
 */
export async function getEarningsSummary(filter: EarningsFilter): Promise<EarningsSummaryResponse> {
  try {
    console.log('[getEarningsSummary] Fetching earnings for:', filter);

    // Calculate date range based on timeframe
    const { startDate, endDate } = getDateRange(filter.timeframe, filter.startDate, filter.endDate);

    // Build the query
    let query = supabase
      .from('payment_links')
      .select('*')
      .eq('wallet_address', filter.walletAddress)
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
      console.error('[getEarningsSummary] Database error:', error);
      throw new Error(`Failed to fetch earnings: ${error.message}`);
    }

    if (!payments || payments.length === 0) {
      return {
        walletAddress: filter.walletAddress,
        timeframe: filter.timeframe || 'allTime',
        totalEarnings: 0,
        totalPayments: 0,
        earnings: [],
        period: {
          startDate: startDate || '',
          endDate: endDate || new Date().toISOString()
        }
      };
    }

    // Group and aggregate earnings by token and network
    const earningsMap = new Map<string, {
      token: string;
      network: string;
      total: number;
      count: number;
      payments: any[];
    }>();

    let totalEarnings = 0;

    for (const payment of payments) {
      const key = `${payment.token}-${payment.network}`;
      const amount = parseFloat(payment.paid_amount) || 0;
      
      totalEarnings += amount;

      if (earningsMap.has(key)) {
        const existing = earningsMap.get(key)!;
        existing.total += amount;
        existing.count += 1;
        existing.payments.push(payment);
      } else {
        earningsMap.set(key, {
          token: payment.token,
          network: payment.network,
          total: amount,
          count: 1,
          payments: [payment]
        });
      }
    }

    // Convert to final format
    const earnings: EarningsSummaryItem[] = Array.from(earningsMap.values()).map(item => ({
      token: item.token,
      network: item.network,
      total: Math.round(item.total * 100000000) / 100000000, // Round to 8 decimal places
      count: item.count,
      averageAmount: Math.round((item.total / item.count) * 100000000) / 100000000,
      lastPayment: item.payments[0]?.paid_at // Most recent payment (already sorted)
    }));

    // Sort by total earnings descending
    earnings.sort((a, b) => b.total - a.total);

    return {
      walletAddress: filter.walletAddress,
      timeframe: filter.timeframe || 'allTime',
      totalEarnings: Math.round(totalEarnings * 100000000) / 100000000,
      totalPayments: payments.length,
      earnings,
      period: {
        startDate: startDate || '',
        endDate: endDate || new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('[getEarningsSummary] Error:', error);
    throw error;
  }
}

/**
 * Get earnings summary for payments made by a wallet (spending summary)
 */
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
 * Format earnings summary for natural language response
 */
export function formatEarningsForAgent(summary: EarningsSummaryResponse, type: 'earnings' | 'spending' = 'earnings'): string {
  const { walletAddress, timeframe, totalEarnings, totalPayments, earnings, period } = summary;
  
  if (totalPayments === 0) {
    const action = type === 'earnings' ? 'earned' : 'spent';
    return `You haven't ${action} anything${timeframe !== 'allTime' ? ` in the ${timeframe}` : ''}.`;
  }

  const action = type === 'earnings' ? 'earned' : 'spent';
  const timeframeText = timeframe === 'allTime' ? 'all time' : timeframe.replace(/([A-Z])/g, ' $1').toLowerCase();
  
  let response = `You have ${action} a total of ${totalEarnings} tokens across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}.\n\n`;
  
  response += `Breakdown by token:\n`;
  
  for (const earning of earnings) {
    response += `• ${earning.total} ${earning.token} on ${earning.network} (${earning.count} payment${earning.count > 1 ? 's' : ''}, avg: ${earning.averageAmount} ${earning.token})\n`;
  }

  if (period.startDate) {
    const start = new Date(period.startDate).toLocaleDateString();
    const end = new Date(period.endDate).toLocaleDateString();
    response += `\nPeriod: ${start} to ${end}`;
  }

  return response;
}

/**
 * Parse natural language queries for earnings
 */
export function parseEarningsQuery(query: string): EarningsFilter | null {
  const lowerQuery = query.toLowerCase();
  
  // Extract wallet address if mentioned (basic pattern)
  const walletMatch = lowerQuery.match(/0x[a-f0-9]{40}/i);
  
  // Extract timeframe
  let timeframe: EarningsFilter['timeframe'] = 'allTime';
  if (lowerQuery.includes('this week') || lowerQuery.includes('last 7 days') || lowerQuery.includes('past week')) {
    timeframe = 'last7days';
  } else if (lowerQuery.includes('this month') || lowerQuery.includes('last month') || lowerQuery.includes('past month')) {
    timeframe = 'lastMonth';
  } else if (lowerQuery.includes('last 3 months') || lowerQuery.includes('past 3 months')) {
    timeframe = 'last3months';
  } else if (lowerQuery.includes('this year') || lowerQuery.includes('last year') || lowerQuery.includes('past year')) {
    timeframe = 'lastYear';
  }

  // Extract token
  let token: string | undefined;
  const tokenPatterns = ['usdc', 'usdt', 'dai', 'eth', 'matic', 'weth'];
  for (const tokenPattern of tokenPatterns) {
    if (lowerQuery.includes(tokenPattern)) {
      token = tokenPattern.toUpperCase();
      break;
    }
  }

  // Extract network
  let network: string | undefined;
  const networkPatterns = ['base', 'polygon', 'ethereum', 'arbitrum', 'optimism'];
  for (const networkPattern of networkPatterns) {
    if (lowerQuery.includes(networkPattern)) {
      network = networkPattern.charAt(0).toUpperCase() + networkPattern.slice(1);
      break;
    }
  }

  // If no wallet address is found in query, return null (caller should provide it)
  if (!walletMatch) {
    return {
      walletAddress: '', // Will be filled by caller
      timeframe,
      token,
      network
    };
  }

  return {
    walletAddress: walletMatch[0],
    timeframe,
    token,
    network
  };
}