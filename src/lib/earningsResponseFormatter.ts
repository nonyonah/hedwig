import { EarningsSummaryResponse } from './earningsService';
import { TimePeriodExtractor } from './timePeriodExtractor';

export interface FormattedEarningsResponse {
  message: string;
  summary: string;
  breakdown?: string;
  insights?: string;
  suggestions?: string;
}

/**
 * Enhanced earnings response formatter with contextual templates
 */
export class EarningsResponseFormatter {
  
  /**
   * Format earnings response for natural language display
   */
  static formatEarningsResponse(
    earnings: EarningsSummaryResponse,
    query: string,
    options: {
      includeBreakdown?: boolean;
      includeInsights?: boolean;
      includeSuggestions?: boolean;
      format?: 'telegram' | 'web' | 'api';
    } = {}
  ): FormattedEarningsResponse {
    const { 
      includeBreakdown = true, 
      includeInsights = true, 
      includeSuggestions = true,
      format = 'telegram'
    } = options;

    const timePeriod = TimePeriodExtractor.extractFromQuery(query);
    const timeContext = timePeriod ? timePeriod.displayName : 'the specified period';
    
    // Main message
    const message = this.generateMainMessage(earnings, timeContext, format);
    
    // Summary
    const summary = this.generateSummary(earnings, timeContext);
    
    // Breakdown
    const breakdown = includeBreakdown ? this.generateBreakdown(earnings, format) : undefined;
    
    // Insights
    const insights = includeInsights && earnings.insights ? 
      this.generateInsights(earnings.insights, format) : undefined;
    
    // Suggestions
    const suggestions = includeSuggestions ? 
      this.generateSuggestions(earnings, query, format) : undefined;

    return {
      message,
      summary,
      breakdown,
      insights,
      suggestions
    };
  }

  /**
   * Generate main earnings message
   */
  private static generateMainMessage(
    earnings: EarningsSummaryResponse, 
    timeContext: string,
    format: string
  ): string {
    const { totalEarnings, totalFiatValue, totalPayments } = earnings;
    
    const emoji = format === 'telegram' ? '💰 ' : '';
    
    if (totalEarnings === 0) {
      return `${emoji}No earnings recorded ${timeContext.toLowerCase()}.`;
    }

    const mainAmount = totalFiatValue && totalFiatValue > 0 
      ? `$${totalFiatValue.toFixed(2)}` 
      : `${totalEarnings.toFixed(4)} tokens`;
    
    let message = `${emoji}You earned ${mainAmount} ${timeContext.toLowerCase()}`;
    
    if (totalPayments > 1) {
      message += ` across ${totalPayments} payments`;
    } else if (totalPayments === 1) {
      message += ` from 1 payment`;
    }
    
    return message + '!';
  }

  /**
   * Generate earnings summary
   */
  private static generateSummary(
    earnings: EarningsSummaryResponse,
    timeContext: string
  ): string {
    const { totalEarnings, totalFiatValue, totalPayments, earnings: breakdown } = earnings;
    
    if (totalEarnings === 0) {
      return `No transactions found ${timeContext.toLowerCase()}. Every expert was once a beginner - your next payment is just around the corner! 🚀`;
    }

    const avgPayment = totalPayments > 0 ? (totalFiatValue || totalEarnings) / totalPayments : 0;
    const topToken = breakdown && breakdown.length > 0 ? breakdown[0].token : 'N/A';
    const topNetwork = breakdown && breakdown.length > 0 ? breakdown[0].network : 'N/A';

    return `Average payment: $${avgPayment.toFixed(2)} • Top token: ${topToken} • Primary network: ${topNetwork}`;
  }

  /**
   * Generate earnings breakdown
   */
  private static generateBreakdown(
    earnings: EarningsSummaryResponse,
    format: string
  ): string | undefined {
    const { earnings: breakdown } = earnings;
    
    if (!breakdown || breakdown.length === 0) {
      return undefined;
    }

    const emoji = format === 'telegram' ? '📊 ' : '';
    let result = `${emoji}Breakdown:\n`;
    
    breakdown.slice(0, 5).forEach((item, index) => {
      const amount = item.fiatValue && item.fiatValue > 0 
        ? `$${item.fiatValue.toFixed(2)}` 
        : `${item.total.toFixed(4)} ${item.token}`;
      
      const bullet = format === 'telegram' ? '• ' : `${index + 1}. `;
      result += `${bullet}${amount} in ${item.token}`;
      
      if (item.network && item.network !== 'unknown') {
        result += ` (${item.network})`;
      }
      
      result += ` - ${item.count} payment${item.count > 1 ? 's' : ''}`;
      
      if (item.percentage && item.percentage > 0) {
        result += ` (${item.percentage.toFixed(1)}%)`;
      }
      
      result += '\n';
    });
    
    if (breakdown.length > 5) {
      result += `... and ${breakdown.length - 5} more token${breakdown.length - 5 > 1 ? 's' : ''}`;
    }
    
    return result.trim();
  }

  /**
   * Generate insights section
   */
  private static generateInsights(
    insights: any,
    format: string
  ): string | undefined {
    if (!insights) return undefined;

    const emoji = format === 'telegram' ? '🎯 ' : '';
    let result = `${emoji}Key Insights:\n`;
    
    if (insights.largestPayment) {
      const amount = insights.largestPayment.fiatValue 
        ? `$${insights.largestPayment.fiatValue.toFixed(2)}`
        : `${insights.largestPayment.amount.toFixed(4)} ${insights.largestPayment.token}`;
      result += `🏆 Largest payment: ${amount}\n`;
    }
    
    if (insights.topToken) {
      result += `🥇 Top performer: ${insights.topToken.token} (${insights.topToken.percentage.toFixed(1)}%)\n`;
    }
    
    if (insights.mostActiveNetwork) {
      result += `🌐 Most active: ${insights.mostActiveNetwork.network} (${insights.mostActiveNetwork.count} payments)\n`;
    }
    
    if (insights.motivationalMessage) {
      result += `💪 ${insights.motivationalMessage}`;
    }
    
    return result.trim();
  }

  /**
   * Generate contextual suggestions
   */
  private static generateSuggestions(
    earnings: EarningsSummaryResponse,
    query: string,
    format: string
  ): string | undefined {
    const { totalEarnings, totalPayments, earnings: breakdown } = earnings;
    
    const suggestions: string[] = [];
    const emoji = format === 'telegram' ? '💡 ' : '';
    
    // No earnings suggestions
    if (totalEarnings === 0) {
      suggestions.push("Try creating a payment link or invoice to start earning");
      suggestions.push("Check if you have pending payments that need to be completed");
      return `${emoji}Suggestions:\n• ${suggestions.join('\n• ')}`;
    }
    
    // Low earnings suggestions
    if (totalEarnings < 100) {
      suggestions.push("Consider diversifying across multiple networks");
      suggestions.push("Create more payment links to increase your earning opportunities");
    }
    
    // Single payment suggestions
    if (totalPayments === 1) {
      suggestions.push("Great start! Try creating recurring payment links for steady income");
    }
    
    // Network diversification suggestions
    if (breakdown && breakdown.length === 1) {
      suggestions.push("Consider accepting payments on multiple networks for better reach");
    }
    
    // PDF generation suggestion
    if (!query.includes('pdf') && !query.includes('report')) {
      suggestions.push("Generate a PDF report with 'create earnings PDF' for detailed analysis");
    }
    
    // Time period suggestions
    if (!query.includes('month') && !query.includes('week') && !query.includes('year')) {
      suggestions.push("Try 'earnings this month' or 'earnings last week' for specific periods");
    }
    
    if (suggestions.length === 0) {
      return undefined;
    }
    
    return `${emoji}Suggestions:\n• ${suggestions.slice(0, 3).join('\n• ')}`;
  }

  /**
   * Format error messages with helpful context
   */
  static formatErrorMessage(
    error: string,
    query: string,
    format: string = 'telegram'
  ): string {
    const emoji = format === 'telegram' ? '❌ ' : '';
    
    // Common error patterns and helpful responses
    const errorPatterns = [
      {
        pattern: /no.*wallet.*address/i,
        message: "I need your wallet addresses to check earnings. Please provide them first."
      },
      {
        pattern: /invalid.*time.*period/i,
        message: "I couldn't understand the time period. Try 'this month', 'last week', or 'January 2024'."
      },
      {
        pattern: /no.*data.*found/i,
        message: "No earnings data found for this period. Try a different time range or check if you have any completed payments."
      },
      {
        pattern: /network.*error/i,
        message: "Having trouble connecting to fetch your data. Please try again in a moment."
      }
    ];
    
    for (const { pattern, message } of errorPatterns) {
      if (pattern.test(error)) {
        return `${emoji}${message}`;
      }
    }
    
    // Generic error with suggestions
    return `${emoji}Something went wrong processing your request. Try rephrasing your query or use simpler terms like 'show my earnings this month'.`;
  }

  /**
   * Format ambiguous query help
   */
  static formatAmbiguousQueryHelp(
    query: string,
    format: string = 'telegram'
  ): string {
    const emoji = format === 'telegram' ? '🤔 ' : '';
    
    const suggestions = [
      "show my earnings this month",
      "how much did I earn last week",
      "USDC earnings on Base",
      "generate earnings PDF",
      "earnings in January 2024"
    ];
    
    return `${emoji}I'm not sure what you're looking for. Try one of these:\n\n• ${suggestions.join('\n• ')}`;
  }
}