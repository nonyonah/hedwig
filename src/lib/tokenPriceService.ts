// src/lib/tokenPriceService.ts
import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// Alchemy API configuration
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_ETH_URL = process.env.ALCHEMY_URL_ETH || `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
const ALCHEMY_SOLANA_URL = process.env.ALCHEMY_SOLANA_URL;

// Token contract addresses for Ethereum mainnet
const TOKEN_ADDRESSES: Record<string, string> = {
  'USDC': '0xA0b86a33E6441b8C4505E2c52C6b6046d5b0b6e6', // USDC on Ethereum
  'ETH': '0x0000000000000000000000000000000000000000', // Native ETH
};

// Solana token mint addresses
const SOLANA_TOKEN_MINTS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112', // Wrapped SOL
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
};

export interface TokenPrice {
  symbol: string;
  price: number;
  currency: string;
  lastUpdated: string;
  change24h?: number; // 24-hour percentage change
}

export interface HistoricalPrice {
  timestamp: string;
  price: number;
  currency: string;
}

export interface PriceAnalysis {
  currentPrice: number;
  currency: string;
  change24h?: number;
  changePercent24h?: number;
  trend: 'up' | 'down' | 'stable';
  historicalData?: HistoricalPrice[];
}

/**
 * Get current token prices by symbol using CoinGecko API (fallback)
 * @param symbols Array of token symbols (e.g., ['ETH', 'BTC', 'SOL'])
 * @returns Promise<TokenPrice[]>
 */
export async function getTokenPricesBySymbol(symbols: string[]): Promise<TokenPrice[]> {
  try {
    console.log(`[TokenPriceService] Fetching prices for symbols:`, symbols);
    
    if (!symbols || symbols.length === 0) {
      throw new Error('Symbols array cannot be empty');
    }

    // Map common symbols to CoinGecko IDs
    const symbolToId: Record<string, string> = {
      'ETH': 'ethereum',
      'BTC': 'bitcoin',
      'SOL': 'solana',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'ADA': 'cardano',
      'DOT': 'polkadot',
      'LINK': 'chainlink',
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2'
    };

    // Convert symbols to CoinGecko IDs
    const coinIds = symbols.map(symbol => {
      const upperSymbol = symbol.toUpperCase();
      return symbolToId[upperSymbol] || upperSymbol.toLowerCase();
    });

    console.log(`[TokenPriceService] Using CoinGecko IDs:`, coinIds);

    // CoinGecko API endpoint
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TokenPriceService] CoinGecko API error:`, errorText);
      throw new Error(`CoinGecko API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`[TokenPriceService] CoinGecko response:`, JSON.stringify(data, null, 2));

    // Transform CoinGecko response to our format
    const prices: TokenPrice[] = [];
    
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i].toUpperCase();
      const coinId = coinIds[i];
      const coinData = data[coinId];
      
      if (coinData && coinData.usd) {
        prices.push({
          symbol: symbol,
          price: coinData.usd,
          currency: 'USD',
          lastUpdated: coinData.last_updated_at ? new Date(coinData.last_updated_at * 1000).toISOString() : new Date().toISOString(),
          change24h: coinData.usd_24h_change || undefined
        });
      }
    }

    console.log(`[TokenPriceService] Processed prices:`, prices);
    return prices;
  } catch (error) {
    console.error(`[TokenPriceService] Error fetching token prices:`, error);
    throw error;
  }
}

/**
 * Get historical token prices using CoinGecko API
 * @param symbol Token symbol (e.g., 'ETH', 'BTC', 'SOL')
 * @param days Number of days of historical data (default: 7)
 * @returns Promise<HistoricalPrice[]>
 */
export async function getHistoricalTokenPrices(symbol: string, days: number = 7): Promise<HistoricalPrice[]> {
  try {
    console.log(`[TokenPriceService] Fetching ${days} days of historical data for ${symbol}`);
    
    // Map symbol to CoinGecko ID
    const symbolToId: Record<string, string> = {
      'ETH': 'ethereum',
      'BTC': 'bitcoin',
      'SOL': 'solana',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'ADA': 'cardano',
      'DOT': 'polkadot',
      'LINK': 'chainlink',
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2'
    };

    const coinId = symbolToId[symbol.toUpperCase()] || symbol.toLowerCase();
    console.log(`[TokenPriceService] Using CoinGecko ID: ${coinId}`);

    // CoinGecko API endpoint for historical data
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TokenPriceService] CoinGecko historical API error:`, errorText);
      throw new Error(`CoinGecko historical API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`[TokenPriceService] CoinGecko historical response sample:`, {
      pricesCount: data.prices?.length,
      firstPrice: data.prices?.[0],
      lastPrice: data.prices?.[data.prices?.length - 1]
    });

    // Transform CoinGecko response to our format
    const historicalPrices: HistoricalPrice[] = [];
    
    if (data.prices && Array.isArray(data.prices)) {
       for (const [timestamp, price] of data.prices) {
         historicalPrices.push({
           timestamp: new Date(timestamp).toISOString(),
           price: price,
           currency: 'USD'
         });
       }
     }

    console.log(`[TokenPriceService] Processed ${historicalPrices.length} historical prices`);
    return historicalPrices;
  } catch (error) {
    console.error(`[TokenPriceService] Error fetching historical token prices:`, error);
    throw error;
  }
}

/**
 * Analyze token price with current and historical data
 * @param symbol Token symbol (e.g., 'ETH')
 * @returns Promise<PriceAnalysis>
 */
export async function analyzeTokenPrice(symbol: string): Promise<PriceAnalysis> {
  try {
    console.log(`[TokenPriceService] Analyzing price for ${symbol}`);
    
    // Get current price
    const currentPrices = await getTokenPricesBySymbol([symbol]);
    if (currentPrices.length === 0) {
      throw new Error(`No current price data found for ${symbol}`);
    }
    
    const currentPrice = currentPrices[0];
    
    // Get historical data for the last 7 days
    let historicalData: HistoricalPrice[] = [];
    let change24h: number | undefined;
    let changePercent24h: number | undefined;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    
    try {
      historicalData = await getHistoricalTokenPrices(symbol, 7);
      
      // Calculate 24h change if we have historical data
      if (historicalData.length >= 2) {
        const yesterdayPrice = historicalData[historicalData.length - 2]?.price;
        if (yesterdayPrice) {
          change24h = currentPrice.price - yesterdayPrice;
          changePercent24h = (change24h / yesterdayPrice) * 100;
          
          if (changePercent24h > 1) {
            trend = 'up';
          } else if (changePercent24h < -1) {
            trend = 'down';
          } else {
            trend = 'stable';
          }
        }
      }
    } catch (historicalError) {
      console.warn(`[TokenPriceService] Could not fetch historical data for ${symbol}:`, historicalError);
      // Continue without historical data
    }
    
    const analysis: PriceAnalysis = {
      currentPrice: currentPrice.price,
      currency: currentPrice.currency,
      change24h,
      changePercent24h,
      trend,
      historicalData: historicalData.length > 0 ? historicalData : undefined
    };
    
    console.log(`[TokenPriceService] Price analysis for ${symbol}:`, analysis);
    return analysis;
  } catch (error) {
    console.error(`[TokenPriceService] Error analyzing token price:`, error);
    throw error;
  }
}

/**
 * Format price analysis into a natural language response
 * @param symbol Token symbol
 * @param analysis Price analysis data
 * @returns Formatted string response
 */
export function formatPriceResponse(symbol: string, analysis: PriceAnalysis): string {
  const { currentPrice, currency, change24h, changePercent24h, trend, historicalData } = analysis;
  
  let response = `💰 **${symbol.toUpperCase()} Price Update**\n\n`;
  response += `Current Price: **$${currentPrice.toFixed(2)} ${currency.toUpperCase()}**\n\n`;
  
  // Add 24h change information
  if (change24h !== undefined && changePercent24h !== undefined) {
    const changeEmoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
    const changeSign = change24h >= 0 ? '+' : '';
    
    response += `24h Change: ${changeEmoji} ${changeSign}$${change24h.toFixed(2)} (${changeSign}${changePercent24h.toFixed(2)}%)\n\n`;
    
    // Add trend analysis
    if (trend === 'up') {
      response += `📊 **Trend Analysis**: ${symbol.toUpperCase()} is trending **upward** with a ${changePercent24h.toFixed(2)}% increase in the last 24 hours.\n\n`;
    } else if (trend === 'down') {
      response += `📊 **Trend Analysis**: ${symbol.toUpperCase()} is trending **downward** with a ${Math.abs(changePercent24h).toFixed(2)}% decrease in the last 24 hours.\n\n`;
    } else {
      response += `📊 **Trend Analysis**: ${symbol.toUpperCase()} is relatively **stable** with minimal price movement in the last 24 hours.\n\n`;
    }
  }
  
  // Add historical context if available
  if (historicalData && historicalData.length > 0) {
    const weekAgoPrice = historicalData[0]?.price;
    if (weekAgoPrice) {
      const weeklyChange = currentPrice - weekAgoPrice;
      const weeklyChangePercent = (weeklyChange / weekAgoPrice) * 100;
      const weeklyChangeSign = weeklyChange >= 0 ? '+' : '';
      
      response += `📅 **7-Day Performance**: ${weeklyChangeSign}$${weeklyChange.toFixed(2)} (${weeklyChangeSign}${weeklyChangePercent.toFixed(2)}%)\n\n`;
    }
  }
  
  // Add supported trading information
  const supportedTokens = ['ETH', 'SOL', 'USDC'];
  if (supportedTokens.includes(symbol.toUpperCase())) {
    response += `✅ You can trade ${symbol.toUpperCase()} on Hedwig! Use commands like "send", "swap", or "buy" to get started.\n\n`;
  } else {
    response += `ℹ️ ${symbol.toUpperCase()} trading will be available soon. Currently supported: ETH, SOL, USDC\n\n`;
  }
  
  response += `_Price data provided by Alchemy • Last updated: ${new Date().toLocaleString()}_`;
  
  return response;
}

export default {
  getTokenPricesBySymbol,
  getHistoricalTokenPrices,
  analyzeTokenPrice,
  formatPriceResponse
};