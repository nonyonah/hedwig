/**
 * Rate Query Service - Handles standalone rate requests using Paycrest API
 * This service is separate from offramp transactions and only used for rate queries
 */

import { PaycrestRateService } from '../lib/paycrestRateService';

export interface RateQueryResult {
  success: boolean;
  token?: string;
  amount?: number;
  rates?: Record<string, number>;
  timestamp?: string;
  error?: string;
}

export class RateQueryService {
  private paycrestService: PaycrestRateService;

  constructor() {
    this.paycrestService = new PaycrestRateService();
  }

  /**
   * Get exchange rates for a specific token and amount
   */
  async getRatesForToken(token: string, amount: number = 1): Promise<RateQueryResult> {
    try {
      if (!this.paycrestService.isSupportedToken(token)) {
        return {
          success: false,
          error: `Unsupported token: ${token}. Supported tokens: USDC, USDT, ETH`
        };
      }

      const rates: Record<string, number> = {};
      const supportedCurrencies = ['NGN', 'GHS'];

      // Fetch rates for all supported currencies
      for (const currency of supportedCurrencies) {
        try {
          const rate = await this.paycrestService.getExchangeRate(token, currency, amount);
          rates[currency] = rate;
        } catch (error) {
          console.warn(`Failed to get rate for ${token} → ${currency}:`, error);
          // Continue with other currencies even if one fails
        }
      }

      return {
        success: true,
        token,
        amount,
        rates,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[RateQueryService] Error getting rates:', error);
      return {
        success: false,
        error: 'Failed to fetch exchange rates. Please try again later.'
      };
    }
  }

  /**
   * Get all available rates for supported tokens
   */
  async getAllRates(): Promise<RateQueryResult> {
    try {
      const allRates = await this.paycrestService.getAllRates();
      
      return {
        success: true,
        rates: allRates,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[RateQueryService] Error getting all rates:', error);
      return {
        success: false,
        error: 'Failed to fetch exchange rates. Please try again later.'
      };
    }
  }

  /**
   * Format rate display for user-friendly output
   */
  formatRateDisplay(result: RateQueryResult): string {
    if (!result.success || !result.rates) {
      return `❌ ${result.error || 'Failed to get rates'}`;
    }

    if (result.token && result.amount) {
      // Single token rate display
      let message = `💱 **Exchange Rates for ${result.amount} ${result.token}**\n\n`;
      
      for (const [currency, rate] of Object.entries(result.rates)) {
        const symbol = currency === 'NGN' ? '₦' : currency === 'GHS' ? 'GH₵' : currency;
        const total = rate * (result.amount || 1);
        message += `• ${currency}: ${symbol}${total.toLocaleString()}\n`;
      }
      
      message += '\n_Live rates from Paycrest API_';
      return message;
    } else {
      // All rates display
      return this.paycrestService.formatRatesDisplay(result.rates);
    }
  }

  /**
   * Check if a token is supported for rate queries
   */
  isSupportedToken(token: string): boolean {
    return this.paycrestService.isSupportedToken(token);
  }

  /**
   * Check if a currency is supported for rate queries
   */
  isSupportedCurrency(currency: string): boolean {
    return this.paycrestService.isSupportedCurrency(currency);
  }

  /**
   * Parse rate query from user input
   */
  parseRateQuery(query: string): { token?: string; amount?: number; currency?: string } | null {
    // Try to parse "rate USDC" or "rate 100 USDC" or "USDC rate" patterns
    const patterns = [
      /^rate\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)$/i,  // "rate 100 USDC"
      /^rate\s+([A-Za-z]+)$/i,                      // "rate USDC"
      /^([A-Za-z]+)\s+rate$/i,                      // "USDC rate"
      /^(\d+(?:\.\d+)?)\s+([A-Za-z]+)\s+rate$/i    // "100 USDC rate"
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        if (match.length === 3 && !isNaN(parseFloat(match[1]))) {
          // Has amount and token
          return {
            amount: parseFloat(match[1]),
            token: match[2].toUpperCase()
          };
        } else if (match.length === 2) {
          // Just token
          return {
            token: match[1].toUpperCase(),
            amount: 1
          };
        } else if (match.length === 3 && isNaN(parseFloat(match[1]))) {
          // Token first, then amount
          return {
            token: match[1].toUpperCase(),
            amount: parseFloat(match[2]) || 1
          };
        }
      }
    }

    return null;
  }
}

// Export singleton instance
export const rateQueryService = new RateQueryService();