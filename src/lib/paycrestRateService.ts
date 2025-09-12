/**
 * Paycrest Exchange Rate Service
 * Replaces all existing exchange rate fetching logic with Paycrest API
 * Provides caching, error handling, and consistent rate formatting
 */

import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;

if (!PAYCREST_API_KEY) {
  console.warn('PAYCREST_API_KEY is not set. Exchange rate fetching will not work properly.');
}

// Cache interface
interface RateCache {
  rate: number;
  timestamp: number;
  expiresAt: number;
}

// Rate response interface
export interface PaycrestRate {
  fromToken: string;
  toToken: string;
  amount: number;
  rate: number;
  total: number;
  source: 'Paycrest';
  timestamp: string;
  cached?: boolean;
}

// Error interface
export interface RateError {
  message: string;
  code?: string;
  details?: any;
}

// Supported tokens and currencies
const SUPPORTED_TOKENS = ['USDC', 'USDT', 'ETH'] as const;
const SUPPORTED_CURRENCIES = ['NGN', 'KES', 'USD'] as const;

type SupportedToken = typeof SUPPORTED_TOKENS[number];
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

// Rate cache - stores rates for 2 minutes
const rateCache = new Map<string, RateCache>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds

/**
 * Generate cache key for rate lookup
 */
function getCacheKey(fromToken: string, toToken: string, amount: number): string {
  return `${fromToken.toUpperCase()}_${toToken.toUpperCase()}_${amount}`;
}

/**
 * Check if rate is cached and still valid
 */
function getCachedRate(fromToken: string, toToken: string, amount: number): PaycrestRate | null {
  const cacheKey = getCacheKey(fromToken, toToken, amount);
  const cached = rateCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expiresAt) {
    return {
      fromToken: fromToken.toUpperCase(),
      toToken: toToken.toUpperCase(),
      amount,
      rate: cached.rate,
      total: cached.rate * amount,
      source: 'Paycrest',
      timestamp: new Date(cached.timestamp).toISOString(),
      cached: true
    };
  }
  
  // Remove expired cache entry
  if (cached) {
    rateCache.delete(cacheKey);
  }
  
  return null;
}

/**
 * Cache a rate for future use
 */
function cacheRate(fromToken: string, toToken: string, amount: number, rate: number): void {
  const cacheKey = getCacheKey(fromToken, toToken, amount);
  const now = Date.now();
  
  rateCache.set(cacheKey, {
    rate,
    timestamp: now,
    expiresAt: now + CACHE_DURATION
  });
}

/**
 * Validate if token/currency is supported
 */
export function isSupportedToken(token: string): token is SupportedToken {
  return SUPPORTED_TOKENS.includes(token.toUpperCase() as SupportedToken);
}

export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(currency.toUpperCase() as SupportedCurrency);
}

/**
 * Fetch exchange rate from Paycrest API
 */
async function fetchRateFromPaycrest(
  fromToken: string,
  toCurrency: string,
  amount: number,
  network: string = 'base'
): Promise<number> {
  if (!PAYCREST_API_KEY) {
    throw new Error('Paycrest API key not configured');
  }

  const url = `${PAYCREST_API_BASE_URL}/rates/${fromToken.toUpperCase()}/${amount}/${toCurrency.toUpperCase()}?network=${network}`;
  
  console.log('[PaycrestRateService] Fetching rate from:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'API-Key': PAYCREST_API_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    let errorMessage = `Rate fetch failed: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Use default error message if JSON parsing fails
    }
    
    if (response.status === 400) {
      throw new Error(`Rate validation failed: ${errorMessage}`);
    } else if (response.status === 404) {
      throw new Error('No provider available for this token/currency combination');
    } else {
      throw new Error(errorMessage);
    }
  }
  
  const data = await response.json();
  console.log('[PaycrestRateService] Rate response:', data);
  
  // Parse rate from response
  const rateValue = parseFloat(data.data);
  if (isNaN(rateValue) || rateValue <= 0) {
    throw new Error('Invalid rate received from Paycrest API');
  }
  
  return rateValue;
}

/**
 * Get exchange rate with caching
 */
export async function getExchangeRate(
  fromToken: string,
  toCurrency: string,
  amount: number = 1,
  network: string = 'base'
): Promise<PaycrestRate> {
  // Validate inputs
  if (!isSupportedToken(fromToken)) {
    throw new Error(`Unsupported token: ${fromToken}. Supported tokens: ${SUPPORTED_TOKENS.join(', ')}`);
  }
  
  if (!isSupportedCurrency(toCurrency)) {
    throw new Error(`Unsupported currency: ${toCurrency}. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }
  
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  // Check cache first
  const cachedRate = getCachedRate(fromToken, toCurrency, amount);
  if (cachedRate) {
    console.log('[PaycrestRateService] Using cached rate');
    return cachedRate;
  }
  
  try {
    // Fetch fresh rate from Paycrest
    const rate = await fetchRateFromPaycrest(fromToken, toCurrency, amount, network);
    
    // Cache the rate
    cacheRate(fromToken, toCurrency, amount, rate);
    
    return {
      fromToken: fromToken.toUpperCase(),
      toToken: toCurrency.toUpperCase(),
      amount,
      rate,
      total: rate * amount,
      source: 'Paycrest',
      timestamp: new Date().toISOString(),
      cached: false
    };
  } catch (error) {
    console.error('[PaycrestRateService] Error fetching rate:', error);
    throw error;
  }
}

/**
 * Get simple rate (rate per unit) for display purposes
 */
export async function getSimpleRate(
  fromToken: string,
  toCurrency: string,
  network: string = 'base'
): Promise<number> {
  const rateData = await getExchangeRate(fromToken, toCurrency, 1, network);
  return rateData.rate;
}

/**
 * Format rate for user display
 */
export function formatRateDisplay(rateData: PaycrestRate): string {
  const { fromToken, toToken, amount, rate, total, cached } = rateData;
  
  // Format currency symbols
  const formatCurrency = (code: string) => {
    switch (code.toUpperCase()) {
      case 'NGN': return '₦';
      case 'KES': return 'KSh';
      case 'USD': return '$';
      default: return code;
    }
  };
  
  const fromSymbol = fromToken;
  const toSymbol = formatCurrency(toToken);
  
  if (amount === 1) {
    return `💱 **Exchange Rate**\n\n` +
           `1 ${fromSymbol} = ${toSymbol}${rate.toLocaleString()} (Paycrest live rate)${cached ? ' (cached)' : ''}`;
  } else {
    return `💱 **Exchange Rate**\n\n` +
           `${amount} ${fromSymbol} = ${toSymbol}${total.toLocaleString()}\n` +
           `Rate: 1 ${fromSymbol} = ${toSymbol}${rate.toLocaleString()} (Paycrest live rate)${cached ? ' (cached)' : ''}`;
  }
}

/**
 * Handle user exchange rate queries
 */
export async function handleRateQuery(query: string): Promise<string> {
  try {
    // Parse query for rate request
    const rateRequest = parseRateQuery(query);
    
    if (!rateRequest) {
      return `❌ **Invalid Request**\n\n` +
             `I couldn't understand your rate request. Please try formats like:\n\n` +
             `• "What's USDC to NGN?"\n` +
             `• "USDC → NGN rate"\n` +
             `• "Exchange rate USDC NGN"\n` +
             `• "100 USDC in NGN"\n\n` +
             `Supported tokens: ${SUPPORTED_TOKENS.join(', ')}\n` +
             `Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`;
    }
    
    const rateData = await getExchangeRate(
      rateRequest.fromToken,
      rateRequest.toCurrency,
      rateRequest.amount
    );
    
    return formatRateDisplay(rateData);
    
  } catch (error) {
    console.error('[PaycrestRateService] Error handling rate query:', error);
    
    if (error instanceof Error) {
      return `❌ **Rate Fetch Failed**\n\n${error.message}`;
    }
    
    return `❌ **Rate Fetch Failed**\n\nUnable to fetch rate at the moment, please try again shortly.`;
  }
}

/**
 * Parse user query for rate information
 */
interface RateQuery {
  fromToken: string;
  toCurrency: string;
  amount: number;
}

function parseRateQuery(query: string): RateQuery | null {
  const text = query.toLowerCase().trim();
  
  // Extract tokens and currencies
  const tokenMatches = SUPPORTED_TOKENS.filter(token => 
    text.includes(token.toLowerCase())
  );
  
  const currencyMatches = SUPPORTED_CURRENCIES.filter(currency => 
    text.includes(currency.toLowerCase()) || 
    (currency === 'NGN' && (text.includes('naira') || text.includes('₦'))) ||
    (currency === 'KES' && (text.includes('shilling') || text.includes('ksh'))) ||
    (currency === 'USD' && (text.includes('dollar') || text.includes('$')))
  );
  
  if (tokenMatches.length === 0 || currencyMatches.length === 0) {
    return null;
  }
  
  // Extract amount if specified
  const amountMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 1;
  
  return {
    fromToken: tokenMatches[0],
    toCurrency: currencyMatches[0],
    amount: Math.max(amount, 0.01) // Minimum amount
  };
}

/**
 * Clear expired cache entries (cleanup function)
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, cached] of rateCache.entries()) {
    if (now >= cached.expiresAt) {
      rateCache.delete(key);
    }
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: rateCache.size,
    entries: Array.from(rateCache.keys())
  };
}

/**
 * PaycrestRateService class for managing exchange rates
 */
export class PaycrestRateService {
  /**
   * Get exchange rate between tokens/currencies
   */
  async getExchangeRate(
    fromToken: string,
    toCurrency: string,
    amount: number = 1,
    network: string = 'base'
  ): Promise<number> {
    const rateData = await getExchangeRate(fromToken, toCurrency, amount, network);
    return rateData.rate;
  }

  /**
   * Get all available rates
   */
  async getAllRates(): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};
    
    for (const token of SUPPORTED_TOKENS) {
      for (const currency of SUPPORTED_CURRENCIES) {
        try {
          const rate = await this.getExchangeRate(token, currency);
          rates[`${token}_${currency}`] = rate;
        } catch (error) {
          console.warn(`Failed to get rate for ${token} → ${currency}:`, error);
        }
      }
    }
    
    return rates;
  }

  /**
   * Format rates display for user
   */
  formatRatesDisplay(rates: Record<string, number>): string {
    let message = '💱 **Current Exchange Rates** (Paycrest Live Rates)\n\n';
    
    for (const [pair, rate] of Object.entries(rates)) {
      const [from, to] = pair.split('_');
      const symbol = to === 'NGN' ? '₦' : to === 'KES' ? 'KSh' : to;
      message += `• 1 ${from} = ${symbol}${rate.toLocaleString()}\n`;
    }
    
    message += '\n_Rates update every 2 minutes_';
    return message;
  }

  /**
   * Format single rate display
   */
  formatSingleRateDisplay(
    fromToken: string,
    toCurrency: string,
    rate: number,
    amount: number = 1
  ): string {
    const symbol = toCurrency === 'NGN' ? '₦' : toCurrency === 'KES' ? 'KSh' : toCurrency;
    const total = rate * amount;
    
    if (amount === 1) {
      return `💱 **Exchange Rate**\n\n1 ${fromToken} = ${symbol}${rate.toLocaleString()} (Paycrest live rate)`;
    } else {
      return `💱 **Exchange Rate**\n\n${amount} ${fromToken} = ${symbol}${total.toLocaleString()}\nRate: 1 ${fromToken} = ${symbol}${rate.toLocaleString()} (Paycrest live rate)`;
    }
  }

  /**
   * Parse rate query from user input
   */
  parseRateQuery(query: string): RateQuery | null {
    return parseRateQuery(query);
  }

  /**
   * Check if token is supported
   */
  isSupportedToken(token: string): boolean {
    return isSupportedToken(token);
  }

  /**
   * Check if currency is supported
   */
  isSupportedCurrency(currency: string): boolean {
    return isSupportedCurrency(currency);
  }
}

export default {
  getExchangeRate,
  getSimpleRate,
  formatRateDisplay,
  handleRateQuery,
  isSupportedToken,
  isSupportedCurrency,
  clearExpiredCache,
  getCacheStats
};