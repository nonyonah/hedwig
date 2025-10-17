import { TimePeriodExtractor } from './timePeriodExtractor';
import { EarningsResponseFormatter } from './earningsResponseFormatter';

export class EarningsError extends Error {
  public code: string;
  public userMessage: string;
  public suggestions: string[];

  constructor(
    message: string,
    code: string,
    userMessage: string,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'EarningsError';
    this.code = code;
    this.userMessage = userMessage;
    this.suggestions = suggestions;
  }
}

export class EarningsErrorHandler {
  
  /**
   * Handle time period parsing errors
   */
  static handleTimePeriodError(query: string): EarningsError {
    const suggestions = [
      "Try 'this month' or 'last month'",
      "Use specific months like 'January 2024'",
      "Try 'this week' or 'last week'",
      "Use 'this year' or 'last year'"
    ];

    return new EarningsError(
      `Invalid time period in query: ${query}`,
      'INVALID_TIME_PERIOD',
      "I couldn't understand the time period you mentioned.",
      suggestions
    );
  }

  /**
   * Handle missing wallet addresses error
   */
  static handleMissingWalletError(): EarningsError {
    const suggestions = [
      "Make sure you have connected wallet addresses",
      "Check if your wallet addresses are properly configured",
      "Try reconnecting your wallet"
    ];

    return new EarningsError(
      'No wallet addresses provided',
      'MISSING_WALLET_ADDRESSES',
      "I need your wallet addresses to check your earnings.",
      suggestions
    );
  }

  /**
   * Handle no data found error
   */
  static handleNoDataError(query: string): EarningsError {
    const timePeriod = TimePeriodExtractor.extractFromQuery(query);
    const timeContext = timePeriod ? timePeriod.displayName : 'this period';
    
    const suggestions = [
      "Try a different time period",
      "Check if you have any completed payments",
      "Verify your wallet addresses are correct",
      "Try 'earnings all time' to see your complete history"
    ];

    return new EarningsError(
      `No earnings data found for query: ${query}`,
      'NO_DATA_FOUND',
      `No earnings found for ${timeContext.toLowerCase()}.`,
      suggestions
    );
  }

  /**
   * Handle database connection errors
   */
  static handleDatabaseError(originalError: Error): EarningsError {
    const suggestions = [
      "Please try again in a moment",
      "Check your internet connection",
      "If the problem persists, contact support"
    ];

    return new EarningsError(
      `Database error: ${originalError.message}`,
      'DATABASE_ERROR',
      "Having trouble connecting to fetch your data.",
      suggestions
    );
  }

  /**
   * Handle PDF generation errors
   */
  static handlePdfError(originalError: Error): EarningsError {
    const suggestions = [
      "Try generating the PDF again",
      "Check if you have earnings data for the requested period",
      "Try a simpler query first"
    ];

    return new EarningsError(
      `PDF generation failed: ${originalError.message}`,
      'PDF_GENERATION_ERROR',
      "Couldn't generate your earnings PDF right now.",
      suggestions
    );
  }

  /**
   * Handle rate limiting errors
   */
  static handleRateLimitError(): EarningsError {
    const suggestions = [
      "Please wait a moment before trying again",
      "Try combining multiple requests into one",
      "Consider using less frequent queries"
    ];

    return new EarningsError(
      'Rate limit exceeded',
      'RATE_LIMIT_EXCEEDED',
      "You're making requests too quickly.",
      suggestions
    );
  }

  /**
   * Handle invalid query format errors
   */
  static handleInvalidQueryError(query: string): EarningsError {
    const suggestions = [
      "Try 'show my earnings this month'",
      "Use 'how much did I earn last week'",
      "Try 'USDC earnings on Base'",
      "Use 'generate earnings PDF'"
    ];

    return new EarningsError(
      `Invalid query format: ${query}`,
      'INVALID_QUERY_FORMAT',
      "I couldn't understand your request.",
      suggestions
    );
  }

  /**
   * Handle token price service errors
   */
  static handleTokenPriceError(originalError: Error): EarningsError {
    const suggestions = [
      "Token amounts will be shown without USD values",
      "Try again later for updated price information",
      "The earnings calculation is still accurate"
    ];

    return new EarningsError(
      `Token price service error: ${originalError.message}`,
      'TOKEN_PRICE_ERROR',
      "Couldn't fetch current token prices, but your earnings data is still accurate.",
      suggestions
    );
  }

  /**
   * Handle generic errors with context
   */
  static handleGenericError(originalError: Error, context?: string): EarningsError {
    const suggestions = [
      "Try rephrasing your request",
      "Use simpler terms in your query",
      "Try again in a moment",
      "Contact support if the problem persists"
    ];

    const contextMessage = context ? ` while ${context}` : '';

    return new EarningsError(
      `Unexpected error${contextMessage}: ${originalError.message}`,
      'GENERIC_ERROR',
      "Something went wrong processing your request.",
      suggestions
    );
  }

  /**
   * Format error for user display
   */
  static formatErrorForUser(
    error: EarningsError | Error,
    query: string,
    format: 'telegram' | 'web' | 'api' = 'telegram'
  ): string {
    if (error instanceof EarningsError) {
      const emoji = format === 'telegram' ? '❌ ' : '';
      let response = `${emoji}${error.userMessage}`;
      
      if (error.suggestions.length > 0) {
        const suggestionEmoji = format === 'telegram' ? '💡 ' : '';
        response += `\n\n${suggestionEmoji}Try:\n• ${error.suggestions.slice(0, 3).join('\n• ')}`;
      }
      
      return response;
    }
    
    // Fallback for generic errors
    return EarningsResponseFormatter.formatErrorMessage(
      error.message,
      query,
      format
    );
  }

  /**
   * Retry logic for transient errors
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry for certain error types
        if (error instanceof EarningsError) {
          const nonRetryableCodes = [
            'MISSING_WALLET_ADDRESSES',
            'INVALID_QUERY_FORMAT',
            'INVALID_TIME_PERIOD',
            'RATE_LIMIT_EXCEEDED'
          ];
          
          if (nonRetryableCodes.includes(error.code)) {
            throw error;
          }
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Validate query input
   */
  static validateQuery(query: string): void {
    if (!query || typeof query !== 'string') {
      throw this.handleInvalidQueryError('Empty or invalid query');
    }
    
    if (query.length > 500) {
      throw this.handleInvalidQueryError('Query too long (max 500 characters)');
    }
    
    // Check for potentially malicious content
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(query)) {
        throw this.handleInvalidQueryError('Query contains invalid characters');
      }
    }
  }

  /**
   * Validate wallet addresses
   */
  static validateWalletAddresses(walletAddresses: any): void {
    if (!walletAddresses) {
      throw this.handleMissingWalletError();
    }
    
    if (!Array.isArray(walletAddresses)) {
      throw this.handleMissingWalletError();
    }
    
    if (walletAddresses.length === 0) {
      throw this.handleMissingWalletError();
    }
    
    // Validate each address format (basic validation)
    for (const address of walletAddresses) {
      if (typeof address !== 'string' || address.length < 10) {
        throw new EarningsError(
          `Invalid wallet address format: ${address}`,
          'INVALID_WALLET_ADDRESS',
          "One or more wallet addresses appear to be invalid.",
          ["Check that your wallet addresses are properly formatted"]
        );
      }
    }
  }
}