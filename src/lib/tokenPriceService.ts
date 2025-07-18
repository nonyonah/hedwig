// src/lib/tokenPriceService.ts
import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

export interface TokenPrice {
  symbol: string;
  price: number;
  currency: string;
  lastUpdated: string;
}

export interface HistoricalPrice {
  timestamp: string;
  price: number;
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
 * Get current token prices by symbol using Alchemy API
 * @param symbols Array of token symbols (e.g., ['ETH', 'BTC', 'SOL'])
 * @returns Promise<TokenPrice[]>
 */
export async function getTokenPricesBySymbol(symbols: string[]): Promise<TokenPrice[]> {
  try {
    console.log(`[TokenPriceService] Fetching prices for symbols:`, symbols);
    
    const alchemyApiKey = process.env.ALCHEMY_API_KEY;
    if (!alchemyApiKey) {
      throw new Error('ALCHEMY_API_KEY not configured');
    }

    // Alchemy API endpoint for token prices by symbol
    const url = `https://api.g.alchemy.com/prices/v1/${alchemyApiKey}/tokens/by-symbol`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbols: symbols.map(s => s.toUpperCase())
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TokenPriceService] Alchemy API error:`, errorText);
      throw new Error(`Alchemy API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`[TokenPriceService] Alchemy response:`, JSON.stringify(data, null, 2));

    // Transform Alchemy response to our format
    const prices: TokenPrice[] = [];
    
    if (data.data && Array.isArray(data.data)) {
      for (const tokenData of data.data) {
        if (tokenData.prices && tokenData.prices.length > 0) {
          const latestPrice = tokenData.prices[0]; // Most recent price
          prices.push({
            symbol: tokenData.symbol,
            price: latestPrice.value,
            currency: latestPrice.currency,
            lastUpdated: latestPrice.lastUpdatedAt
          });
        }
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
 * Get historical token prices using Alchemy API
 * @param symbol Token symbol (e.g., 'ETH')
 * @param startTime Start timestamp (ISO string)
 * @param endTime End timestamp (ISO string)
 * @returns Promise<HistoricalPrice[]>
 */
export async function getHistoricalTokenPrices(
  symbol: string,
  startTime: string,
  endTime: string
): Promise<HistoricalPrice[]> {
  try {
    console.log(`[TokenPriceService] Fetching historical prices for ${symbol} from ${startTime} to ${endTime}`);
    
    const alchemyApiKey = process.env.ALCHEMY_API_KEY;
    if (!alchemyApiKey) {
      throw new Error('ALCHEMY_API_KEY not configured');
    }

    // Alchemy API endpoint for historical token prices
    const url = `https://api.g.alchemy.com/prices/v1/${alchemyApiKey}/tokens/historical`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: symbol.toUpperCase(),
        startTime,
        endTime,
        interval: 'daily' // Can be 'hourly', 'daily', 'weekly'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TokenPriceService] Alchemy historical API error:`, errorText);
      throw new Error(`Alchemy API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log(`[TokenPriceService] Historical data response:`, JSON.stringify(data, null, 2));

    // Transform Alchemy response to our format
    const historicalPrices: HistoricalPrice[] = [];
    
    if (data.data && Array.isArray(data.data)) {
      for (const pricePoint of data.data) {
        historicalPrices.push({
          timestamp: pricePoint.timestamp,
          price: pricePoint.value
        });
      }
    }

    console.log(`[TokenPriceService] Processed historical prices:`, historicalPrices.length, 'data points');
    return historicalPrices;
  } catch (error) {
    console.error(`[TokenPriceService] Error fetching historical prices:`, error);
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
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    let historicalData: HistoricalPrice[] = [];
    let change24h: number | undefined;
    let changePercent24h: number | undefined;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    
    try {
      historicalData = await getHistoricalTokenPrices(symbol, startTime, endTime);
      
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