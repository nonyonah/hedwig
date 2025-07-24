/**
 * Currency Conversion Service
 * Replaces the price alert logic with real-time currency conversion and exchange rate lookup
 * Supports both crypto (via CoinGecko) and fiat (via ExchangeRate.host) currencies
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
  
  // Fiat currencies
  'dollar': 'USD',
  'dollars': 'USD',
  'usd': 'USD',
  'naira': 'NGN',
  'ngn': 'NGN',
  'euro': 'EUR',
  'euros': 'EUR',
  'eur': 'EUR',
  'pound': 'GBP',
  'pounds': 'GBP',
  'gbp': 'GBP',
  'yen': 'JPY',
  'jpy': 'JPY',
  'cad': 'CAD',
  'canadian-dollar': 'CAD',
  'aud': 'AUD',
  'australian-dollar': 'AUD',
  'chf': 'CHF',
  'swiss-franc': 'CHF',
  'cny': 'CNY',
  'yuan': 'CNY',
  'inr': 'INR',
  'rupee': 'INR',
  'rupees': 'INR',
  'krw': 'KRW',
  'won': 'KRW',
  'brl': 'BRL',
  'real': 'BRL',
  'zar': 'ZAR',
  'rand': 'ZAR',
  'mxn': 'MXN',
  'peso': 'MXN',
  'pesos': 'MXN'
};

// CoinGecko ID mappings for crypto currencies
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
  'LINK': 'chainlink'
};

// Supported crypto and fiat currencies
const CRYPTO_CURRENCIES = new Set(Object.keys(COINGECKO_IDS));
const FIAT_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW', 
  'BRL', 'ZAR', 'MXN', 'NGN', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'
]);

/**
 * Normalize currency symbol or name to standard format
 */
export function normalizeCurrency(currency: string): string {
  const normalized = currency.toLowerCase().trim();
  return CURRENCY_MAPPINGS[normalized] || currency.toUpperCase();
}

/**
 * Check if a currency is a cryptocurrency
 */
export function isCryptoCurrency(currency: string): boolean {
  return CRYPTO_CURRENCIES.has(currency);
}

/**
 * Check if a currency is a fiat currency
 */
export function isFiatCurrency(currency: string): boolean {
  return FIAT_CURRENCIES.has(currency);
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
 * Fetch crypto exchange rate from CoinGecko
 */
async function fetchCryptoRate(fromCrypto: string, toCurrency: string): Promise<number> {
  const coinId = COINGECKO_IDS[fromCrypto];
  if (!coinId) {
    throw new Error(`Unsupported cryptocurrency: ${fromCrypto}`);
  }
  
  const vsCurrency = isCryptoCurrency(toCurrency) ? 
    COINGECKO_IDS[toCurrency] : 
    toCurrency.toLowerCase();
  
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  const rate = data[coinId]?.[vsCurrency];
  
  if (rate === undefined) {
    throw new Error(`Exchange rate not found for ${fromCrypto} to ${toCurrency}`);
  }
  
  return rate;
}

/**
 * Fetch fiat exchange rate from OpenExchangeRates
 */
async function fetchFiatRate(fromFiat: string, toFiat: string): Promise<number> {
  if (fromFiat === toFiat) {
    return 1;
  }
  
  // Use OpenExchangeRates API (free tier)
  const url = `https://api.openexchangerates.org/api/latest.json?app_id=YOUR_APP_ID&base=USD&symbols=${fromFiat},${toFiat}`;
  
  try {
    // For now, fallback to exchangerate.host as it doesn't require API key
    const fallbackUrl = `https://api.exchangerate.host/convert?from=${fromFiat}&to=${toFiat}&amount=1`;
    
    const response = await fetch(fallbackUrl);
    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`Exchange rate API error: ${data.error?.info || 'Unknown error'}`);
    }
    
    return data.result;
  } catch (error) {
    console.error('Fiat rate fetch error:', error);
    throw error;
  }
}

/**
 * Perform currency conversion
 */
export async function convertCurrency(request: ConversionRequest): Promise<ConversionResult> {
  const { fromCurrency, toCurrency, amount } = request;
  
  // Validate currencies
  const fromIsCrypto = isCryptoCurrency(fromCurrency);
  const fromIsFiat = isFiatCurrency(fromCurrency);
  const toIsCrypto = isCryptoCurrency(toCurrency);
  const toIsFiat = isFiatCurrency(toCurrency);
  
  if (!fromIsCrypto && !fromIsFiat) {
    throw new Error(`Unsupported source currency: ${fromCurrency}`);
  }
  
  if (!toIsCrypto && !toIsFiat) {
    throw new Error(`Unsupported target currency: ${toCurrency}`);
  }
  
  let exchangeRate: number;
  let source: string;
  
  try {
    if (fromIsCrypto) {
      // From crypto to any currency
      exchangeRate = await fetchCryptoRate(fromCurrency, toCurrency);
      source = 'CoinGecko';
    } else if (fromIsFiat && toIsFiat) {
      // Fiat to fiat
      exchangeRate = await fetchFiatRate(fromCurrency, toCurrency);
      source = 'ExchangeRate.host';
    } else if (fromIsFiat && toIsCrypto) {
      // Fiat to crypto: convert fiat to USD first, then USD to crypto
      if (fromCurrency === 'USD') {
        exchangeRate = 1 / await fetchCryptoRate(toCurrency, 'USD');
      } else {
        const fiatToUsd = await fetchFiatRate(fromCurrency, 'USD');
        const usdToCrypto = 1 / await fetchCryptoRate(toCurrency, 'USD');
        exchangeRate = fiatToUsd * usdToCrypto;
      }
      source = 'CoinGecko + ExchangeRate.host';
    } else {
      throw new Error(`Unsupported conversion: ${fromCurrency} to ${toCurrency}`);
    }
    
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
    if (code === 'NGN') return 'Naira (NGN)';
    if (code === 'USD') return 'US Dollars (USD)';
    return code;
  };
  
  const fromCurrency = formatCurrency(base_currency);
  const toCurrency = formatCurrency(quote_currency);
  
  return `💱 Currency Conversion\n\n` +
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
          "• \"Convert 300 USD to NGN\"\n" +
          "• \"How much is 0.1 ETH in USD?\"\n" +
          "• \"What is the exchange rate from USD to NGN?\"\n" +
          "• \"What's the value of 1 BTC in Naira?\""
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