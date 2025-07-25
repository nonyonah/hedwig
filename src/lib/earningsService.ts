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
  walletAddress: string;
  token?: string;
  network?: string;
  timeframe?: 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime' | 'custom';
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
  source?: 'payment_link'; // source of earnings
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
  walletAddress: string;
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

    // Calculate date range based on timeframe
    const { startDate, endDate } = getDateRange(filter.timeframe, filter.startDate, filter.endDate);

    // Fetch payment links only
    const paymentLinksData = await fetchPaymentLinks(filter, startDate, endDate);

    const payments = paymentLinksData || [];

    console.log(`[getEarningsSummary] Found ${payments.length} payment links`);

    if (payments.length === 0) {
      return {
        walletAddress: filter.walletAddress,
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
    const paymentTokens = payments.map(p => p.token);
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

    // Categorize payments
    const categorizedPayments = payments.map(payment => ({
      ...payment,
      category: categorizePayment(payment),
      source: 'payment_link' as const
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
      source: 'payment_link';
    }>();

    let totalEarnings = 0;
    let totalFiatValue = 0;

    // Process payment links
    for (const payment of categorizedPayments) {
      const key = `${payment.token}-${payment.network}`;
      const amount = parseFloat(payment.paid_amount) || 0;
      const fiatValue = (tokenPrices[payment.token] || 0) * amount;
      
      totalEarnings += amount;
      totalFiatValue += fiatValue;

      if (earningsMap.has(key)) {
        const existing = earningsMap.get(key)!;
        existing.total += amount;
        existing.count += 1;
        existing.payments.push(payment);
        existing.fiatValue += fiatValue;
      } else {
        earningsMap.set(key, {
          token: payment.token,
          network: payment.network,
          total: amount,
          count: 1,
          payments: [payment],
          fiatValue: fiatValue,
          category: payment.category,
          source: 'payment_link'
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
        source: item.source
      };
    });

    // Sort by total earnings descending
    earnings.sort((a, b) => b.total - a.total);

    const result: EarningsSummaryResponse = {
    walletAddress: filter.walletAddress,
    timeframe: filter.timeframe || 'allTime',
    totalEarnings: Math.round(totalEarnings * 100000000) / 100000000,
    totalFiatValue: Math.round(totalFiatValue * 100) / 100,
    totalPayments: payments.length,
    earnings,
    period: {
      startDate: startDate || '',
      endDate: endDate || new Date().toISOString()
    }
  };

    // Add insights if requested
  if (includeInsights && payments.length > 0) {
    result.insights = await generateEarningsInsights(categorizedPayments, earnings, filter);
  }

    return result;

  } catch (error) {
    console.error('[getEarningsSummary] Error:', error);
    throw error;
  }
}

/**
 * Fetch payment links from database
 */
async function fetchPaymentLinks(filter: EarningsFilter, startDate: string | null, endDate: string | null) {
  try {
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
 * Generate insights for earnings data
 */
async function generateEarningsInsights(
  items: any[], // Payment links only
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

  if (growthComparison && growthComparison.growthPercentage > 0) {
    return `🚀 Amazing! You earned ${growthComparison.growthPercentage.toFixed(1)}% more than last period. Keep up the great work!`;
  }

  if (totalFiat > 1000) {
    return `💰 Impressive! You've earned over $${totalFiat.toFixed(0)} across ${totalPayments} payments. You're building real wealth!`;
  }

  if (totalPayments > 10) {
    return `🔥 You're on fire! ${totalPayments} payments shows consistent earning activity. Momentum is building!`;
  }

  if (earnings.length > 3) {
    return `🌟 Great diversification! Earning across ${earnings.length} different tokens shows smart portfolio management.`;
  }

  return `💪 Every step counts! You're building your crypto earnings steadily. Keep going!`;
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
    return `You haven't ${action} anything${timeframe !== 'allTime' ? ` in the ${timeframe}` : ''}.`;
  }

  const action = type === 'earnings' ? 'earned' : 'spent';
  const timeframeText = timeframe === 'allTime' ? 'all time' : timeframe.replace(/([A-Z])/g, ' $1').toLowerCase();
  
  let response = `💰 **${type.charAt(0).toUpperCase() + type.slice(1)} Summary**\n\n`;
  
  // Main summary with fiat value
  if (totalFiatValue && totalFiatValue > 0) {
    response += `You have ${action} **${totalEarnings} tokens** (≈ **$${totalFiatValue.toFixed(2)} USD**) across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}.\n\n`;
  } else {
    response += `You have ${action} **${totalEarnings} tokens** across ${totalPayments} payment${totalPayments > 1 ? 's' : ''} ${timeframeText}.\n\n`;
  }
  
  // Breakdown by token with percentages and categories
  response += `📊 **Breakdown by Token:**\n`;
  
  for (const earning of earnings) {
    const fiatText = earning.fiatValue ? ` (≈ $${earning.fiatValue.toFixed(2)})` : '';
    const percentageText = earning.percentage ? ` • ${earning.percentage}%` : '';
    const categoryText = earning.category && earning.category !== 'other' ? ` • ${earning.category}` : '';
    
    response += `• **${earning.total} ${earning.token}**${fiatText} on ${earning.network}\n`;
    response += `  ${earning.count} payment${earning.count > 1 ? 's' : ''} • avg: ${earning.averageAmount} ${earning.token}${percentageText}${categoryText}\n\n`;
  }

  // Add insights if available
  if (insights) {
    response += `🔍 **Insights:**\n`;
    
    if (insights.largestPayment) {
      const { amount, token, network, fiatValue } = insights.largestPayment;
      const fiatText = fiatValue ? ` ($${fiatValue.toFixed(2)})` : '';
      response += `• Largest payment: ${amount} ${token} on ${network}${fiatText}\n`;
    }
    
    if (insights.mostActiveNetwork) {
      const { network, count, totalAmount } = insights.mostActiveNetwork;
      response += `• Most active: ${network} (${count} payments, ${totalAmount.toFixed(4)} total)\n`;
    }
    
    if (insights.topToken) {
      const { token, percentage } = insights.topToken;
      response += `• Top token: ${token} (${percentage}% of total)\n`;
    }
    
    if (insights.growthComparison) {
      const { growthPercentage, trend } = insights.growthComparison;
      const trendEmoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
      response += `• Growth: ${growthPercentage > 0 ? '+' : ''}${growthPercentage.toFixed(1)}% vs last period ${trendEmoji}\n`;
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
  
  // Week patterns
  if (lowerQuery.includes('this week') || lowerQuery.includes('last 7 days') || 
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
  const networkPatterns = ['base', 'polygon', 'ethereum', 'optimism-sepolia', 'avalanche', 'bsc', 'solana', 'celo-alfajores'];
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