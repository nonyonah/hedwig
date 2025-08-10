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

// Currency mappings for normalization - Only USDC, cNGN, and ETH are supported
const CURRENCY_MAPPINGS: Record<string, string> = {
  // Supported cryptocurrencies
  'ethereum': 'ETH',
  'eth': 'ETH',
  'usdc': 'USDC',
  'usd-coin': 'USDC',
  'celo-naira': 'CNGN',
  'cngn': 'CNGN',
  
  // Map traditional currency names to their token equivalents
  'dollar': 'USDC',        // USD -> USDC (1:1 parity)
  'dollars': 'USDC',
  'usd': 'USDC',
  'naira': 'CNGN',         // NGN -> CNGN (1:1 parity)
  'ngn': 'CNGN',
};

// Alchemy token contract addresses
const TOKEN_ADDRESSES: Record<string, string> = {
  'ETH': '0x0000000000000000000000000000000000000000', // Native ETH
  'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum Mainnet USDC
  'CNGN': '0x1a8Dbe5958c597a744Ba51763AbEBD3355996c3e'  // Celo Mainnet cNGN
};

// Alchemy API configuration
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_BASE_URL = 'https://eth-mainnet.g.alchemy.com/v2';

if (!ALCHEMY_API_KEY) {
  console.warn('ALCHEMY_API_KEY is not set. Currency conversion may not work properly.');
}

// All supported currencies are now crypto/tokens
const SUPPORTED_CURRENCIES = new Set(Object.keys(TOKEN_ADDRESSES));

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
 * Fetch token price in USD from Alchemy
 */
async function fetchTokenPriceInUSD(token: string): Promise<number> {
  if (!ALCHEMY_API_KEY) {
    throw new Error('Alchemy API key not configured');
  }

  const tokenAddress = TOKEN_ADDRESSES[token];
  if (!tokenAddress) {
    throw new Error(`Unsupported token: ${token}`);
  }

  // For native ETH, use the native token price endpoint
  if (token === 'ETH') {
    const response = await fetch(
      `${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alchemy_getTokenPrices',
          params: [
            {
              contractAddresses: [TOKEN_ADDRESSES.USDC],
              vsCurrency: 'usd'
            }
          ],
          id: 1,
        }),
      }
    );

    const data = await response.json();
    const tokenPrice = data.result?.[0]?.usdPrice;
    
    if (!tokenPrice) {
      throw new Error('Failed to fetch ETH price from Alchemy');
    }
    
    // For ETH, we need to get the USDC/ETH rate and invert it
    return tokenPrice; // This gives us ETH/USD rate
  }

  // For tokens, get the price directly
  const response = await fetch(
    `${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alchemy_getTokenPrices',
        params: [
          {
            contractAddresses: [tokenAddress],
            vsCurrency: 'usd'
          }
        ],
        id: 1,
      }),
    }
  );

  const data = await response.json();
  const tokenData = data.result?.[0];
  
  if (!tokenData) {
    throw new Error(`Failed to fetch price for ${token} from Alchemy`);
  }
  
  // The price is returned in the usdPrice field
  return tokenData.usdPrice;
}

/**
 * Fetch token exchange rate using Alchemy
 */
async function fetchTokenRate(fromToken: string, toToken: string): Promise<number> {
  if (!ALCHEMY_API_KEY) {
    throw new Error('Alchemy API key not configured');
  }

  // If same token, return 1
  if (fromToken === toToken) {
    return 1;
  }

  try {
    // Get both token prices in USD
    const [fromPrice, toPrice] = await Promise.all([
      fetchTokenPriceInUSD(fromToken),
      fetchTokenPriceInUSD(toToken)
    ]);
    
    // Calculate cross rate
    return fromPrice / toPrice;
  } catch (error) {
    console.error('Error fetching token rates:', error);
    throw new Error(`Failed to get exchange rate: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
    if (code === 'CNGN') return 'Celo Naira (cNGN)';
    if (code === 'USDC') return 'USD Coin (USDC)';
    if (code === 'ETH') return 'Ethereum (ETH)';
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
          "• \"How much is 0.1 ETH in USDC?\"\n" +
          "• \"What is the exchange rate from USDC to cNGN?\"\n" +
          "• \"What's the value of 1 ETH in cNGN?\"\n\n" +
          "Supported tokens: USDC, cNGN, ETH"
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