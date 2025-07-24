/**
 * Currency Conversion Service
 * Uses CNGN (Celo Naira) and USDC tokens instead of fiat currencies
 * CNGN maintains 1:1 parity with NGN, USDC maintains 1:1 parity with USD
 * All conversions use on-chain token prices via CoinGecko
 */

export interface ConversionResult {
  base_currency: string;
  quote_currency: string;
  amount_requested: number;
  converted_amount: number;
  exchange_rate: number;
  source: string;
  timestamp: string;
}

export interface ConversionRequest {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
}

// Currency mappings for normalization
const CURRENCY_MAPPINGS: Record<string, string> = {
  // Crypto currencies
  'bitcoin': 'BTC',
  'btc': 'BTC',
  'ethereum': 'ETH',
  'eth': 'ETH',
  'tether': 'USDT',
  'usdt': 'USDT',
  'usdc': 'USDC',
  'usd-coin': 'USDC',
  'solana': 'SOL',
  'sol': 'SOL',
  'bnb': 'BNB',
  'binance-coin': 'BNB',
  'cardano': 'ADA',
  'ada': 'ADA',
  'polygon': 'MATIC',
  'matic': 'MATIC',
  'avalanche': 'AVAX',
  'avax': 'AVAX',
  'chainlink': 'LINK',
  'link': 'LINK',
  'celo': 'CELO',
  'celo-dollar': 'CUSD',
  'cusd': 'CUSD',
  'celo-naira': 'CNGN',
  'cngn': 'CNGN',
  
  // Map traditional currency names to their token equivalents
  'dollar': 'USDC',        // USD -> USDC (1:1 parity)
  'dollars': 'USDC',
  'usd': 'USDC',
  'naira': 'CNGN',         // NGN -> CNGN (1:1 parity)
  'ngn': 'CNGN',
  
  // Other crypto currencies
  'euro': 'EUR',           // Keep for future token implementation
  'euros': 'EUR',
  'eur': 'EUR',
  'pound': 'GBP',
  'pounds': 'GBP',
  'gbp': 'GBP'
};

// CoinGecko ID mappings for crypto currencies and tokens
const COINGECKO_IDS: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'ADA': 'cardano',
  'MATIC': 'matic-network',
  'AVAX': 'avalanche-2',
  'LINK': 'chainlink',
  'CELO': 'celo',
  'CUSD': 'celo-dollar',
  'CNGN': 'celo-naira'
};

// All supported currencies are now crypto/tokens
const SUPPORTED_CURRENCIES = new Set(Object.keys(COINGECKO_IDS));

/**
 * Normalize currency symbol or name to standard format
 */
export function normalizeCurrency(currency: string): string {
  const normalized = currency.toLowerCase().trim();
  return CURRENCY_MAPPINGS[normalized] || currency.toUpperCase();
}

/**
 * Check if a currency is supported
 */
export function isSupportedCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCIES.has(currency);
}

/**
 * Check if a currency is a cryptocurrency/token (all currencies are now crypto/tokens)
 */
export function isCryptoCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCIES.has(currency);
}

/**
 * Check if a currency is a fiat currency (deprecated - keeping for backward compatibility)
 */
export function isFiatCurrency(currency: string): boolean {
  // All currencies are now tokens, but we map traditional fiat to their token equivalents
  return currency === 'USDC' || currency === 'CNGN';
}

/**
 * Parse user input to extract conversion request
 */
export function parseConversionRequest(input: string): ConversionRequest | null {
  const text = input.toLowerCase().trim();
  
  // Pattern 1: "convert X FROM to TO" or "X FROM to TO"
  let match = text.match(/(?:convert\s+)?(\d+(?:\.\d+)?)\s+(\w+)\s+(?:to|in)\s+(\w+)/);
  if (match) {
    return {
      amount: parseFloat(match[1]),
      fromCurrency: normalizeCurrency(match[2]),
      toCurrency: normalizeCurrency(match[3])
    };
  }
  
  // Pattern 2: "how much is X FROM in TO"
  match = text.match(/how\s+much\s+is\s+(\d+(?:\.\d+)?)\s+(\w+)\s+in\s+(\w+)/);
  if (match) {
    return {
      amount: parseFloat(match[1]),
      fromCurrency: normalizeCurrency(match[2]),
      toCurrency: normalizeCurrency(match[3])
    };
  }
  
  // Pattern 3: "exchange rate from FROM to TO" (default amount = 1)
  match = text.match(/(?:what\s+is\s+the\s+)?exchange\s+rate\s+from\s+(\w+)\s+to\s+(\w+)/);
  if (match) {
    return {
      amount: 1,
      fromCurrency: normalizeCurrency(match[1]),
      toCurrency: normalizeCurrency(match[2])
    };
  }
  
  // Pattern 4: "value of X FROM in TO"
  match = text.match(/(?:what'?s\s+the\s+)?value\s+of\s+(\d+(?:\.\d+)?)\s+(\w+)\s+in\s+(\w+)/);
  if (match) {
    return {
      amount: parseFloat(match[1]),
      fromCurrency: normalizeCurrency(match[2]),
      toCurrency: normalizeCurrency(match[3])
    };
  }
  
  return null;
}

/**
 * Fetch token exchange rate from CoinGecko
 */
async function fetchTokenRate(fromToken: string, toToken: string): Promise<number> {
  const fromCoinId = COINGECKO_IDS[fromToken];
  const toCoinId = COINGECKO_IDS[toToken];
  
  if (!fromCoinId) {
    throw new Error(`Unsupported token: ${fromToken}`);
  }
  
  if (!toCoinId) {
    throw new Error(`Unsupported token: ${toToken}`);
  }
  
  // If same token, return 1
  if (fromToken === toToken) {
    return 1;
  }
  
  // Get both token prices in USD
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${fromCoinId},${toCoinId}&vs_currencies=usd`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  const fromPrice = data[fromCoinId]?.usd;
  const toPrice = data[toCoinId]?.usd;
  
  if (fromPrice === undefined || toPrice === undefined) {
    throw new Error(`Exchange rate not found for ${fromToken} to ${toToken}`);
  }
  
  // Calculate cross rate
  return fromPrice / toPrice;
}

/**
 * Perform currency conversion
 */
export async function convertCurrency(request: ConversionRequest): Promise<ConversionResult> {
  const { fromCurrency, toCurrency, amount } = request;
  
  // Validate currencies
  if (!isSupportedCurrency(fromCurrency)) {
    throw new Error(`Unsupported source currency: ${fromCurrency}`);
  }
  
  if (!isSupportedCurrency(toCurrency)) {
    throw new Error(`Unsupported target currency: ${toCurrency}`);
  }
  
  let exchangeRate: number;
  const source = 'CoinGecko';
  
  try {
    // All conversions now use CoinGecko token prices
    exchangeRate = await fetchTokenRate(fromCurrency, toCurrency);
    
    const convertedAmount = amount * exchangeRate;
    
    return {
      base_currency: fromCurrency,
      quote_currency: toCurrency,
      amount_requested: amount,
      converted_amount: Math.round(convertedAmount * 100000000) / 100000000, // Round to 8 decimal places
      exchange_rate: Math.round(exchangeRate * 100000000) / 100000000,
      source,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Currency conversion error:', error);
    throw new Error(`Failed to convert ${fromCurrency} to ${toCurrency}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format conversion result for display
 */
export function formatConversionResult(result: ConversionResult): string {
  const { base_currency, quote_currency, amount_requested, converted_amount, exchange_rate, source } = result;
  
  // Format currency names for display
  const formatCurrency = (code: string) => {
    if (code === 'CNGN') return 'Celo Naira (CNGN)';
    if (code === 'USDC') return 'USD Coin (USDC)';
    if (code === 'CUSD') return 'Celo Dollar (CUSD)';
    if (code === 'CELO') return 'Celo (CELO)';
    return code;
  };
  
  const fromCurrency = formatCurrency(base_currency);
  const toCurrency = formatCurrency(quote_currency);
  
  return `💱 Token Conversion\n\n` +
    `${amount_requested} ${fromCurrency} = ${converted_amount.toLocaleString()} ${toCurrency}\n\n` +
    `Exchange Rate: 1 ${base_currency} = ${exchange_rate.toLocaleString()} ${quote_currency}\n` +
    `Source: ${source}\n` +
    `Updated: ${new Date(result.timestamp).toLocaleString()}`;
}

/**
 * Main function to handle currency conversion requests
 */
export async function handleCurrencyConversion(input: string): Promise<{ text: string; data?: ConversionResult }> {
  try {
    const request = parseConversionRequest(input);
    
    if (!request) {
      return {
        text: "❌ Invalid Request\n\nI couldn't understand your conversion request. Please try formats like:\n\n" +
          "• \"Convert 300 USDC to CNGN\"\n" +
          "• \"How much is 0.1 CELO in USDC?\"\n" +
          "• \"What is the exchange rate from USDC to CNGN?\"\n" +
          "• \"What's the value of 1 BTC in CNGN?\"\n\n" +
          "Supported tokens: CELO, CUSD, CNGN, USDC, BTC, ETH"
      };
    }
    
    const result = await convertCurrency(request);
    const formattedText = formatConversionResult(result);
    
    return {
      text: formattedText,
      data: result
    };
    
  } catch (error) {
    console.error('Currency conversion handler error:', error);
    return {
      text: `❌ Conversion Failed\n\n${error instanceof Error ? error.message : 'An unexpected error occurred. Please try again later.'}`
    };
  }
}