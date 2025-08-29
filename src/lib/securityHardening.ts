/**
 * Security Hardening Utilities
 * Implements error handling, retries, and mainnet load safeguards
 */

import { getCurrentNetworkEnvironment } from './envConfig';

// Rate limiting configuration
const RATE_LIMITS = {
  mainnet: {
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxConcurrentRequests: 10,
  },
  testnet: {
    maxRequestsPerMinute: 120,
    maxRequestsPerHour: 5000,
    maxConcurrentRequests: 20,
  },
};

// Request tracking
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const concurrentRequests = new Set<string>();

/**
 * Retry configuration for different operation types
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  blockchain: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'TEMPORARY_FAILURE'],
  },
  api: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED'],
  },
  database: {
    maxAttempts: 3,
    baseDelay: 200,
    maxDelay: 2000,
    backoffMultiplier: 2,
    retryableErrors: ['CONNECTION_ERROR', 'TIMEOUT', 'TEMPORARY_FAILURE'],
  },
};

/**
 * Enhanced error class with retry information
 */
export class HedwigError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: number;

  constructor(
    message: string,
    code: string,
    retryable: boolean = false,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'HedwigError';
    this.code = code;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = Date.now();
  }
}

/**
 * Rate limiter for mainnet protection
 */
export class RateLimiter {
  private static instance: RateLimiter;
  private readonly network: 'mainnet' | 'testnet';
  private readonly limits: typeof RATE_LIMITS.mainnet;

  private constructor() {
    this.network = getCurrentNetworkEnvironment();
    this.limits = RATE_LIMITS[this.network];
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Check if request is allowed under rate limits
   */
  public async checkRateLimit(identifier: string, operation: string): Promise<boolean> {
    const key = `${identifier}:${operation}`;
    const now = Date.now();
    const minuteKey = `${key}:${Math.floor(now / 60000)}`;
    const hourKey = `${key}:${Math.floor(now / 3600000)}`;

    // Check concurrent requests
    const concurrentKey = `concurrent:${identifier}`;
    const currentConcurrent = Array.from(concurrentRequests).filter(k => k.startsWith(concurrentKey)).length;
    
    if (currentConcurrent >= this.limits.maxConcurrentRequests) {
      throw new HedwigError(
        'Too many concurrent requests',
        'RATE_LIMITED',
        true,
        { identifier, operation, concurrent: currentConcurrent }
      );
    }

    // Check per-minute limit
    const minuteCount = requestCounts.get(minuteKey)?.count || 0;
    if (minuteCount >= this.limits.maxRequestsPerMinute) {
      throw new HedwigError(
        'Rate limit exceeded (per minute)',
        'RATE_LIMITED',
        true,
        { identifier, operation, minuteCount }
      );
    }

    // Check per-hour limit
    const hourCount = requestCounts.get(hourKey)?.count || 0;
    if (hourCount >= this.limits.maxRequestsPerHour) {
      throw new HedwigError(
        'Rate limit exceeded (per hour)',
        'RATE_LIMITED',
        true,
        { identifier, operation, hourCount }
      );
    }

    // Update counters
    requestCounts.set(minuteKey, { count: minuteCount + 1, resetTime: now + 60000 });
    requestCounts.set(hourKey, { count: hourCount + 1, resetTime: now + 3600000 });
    concurrentRequests.add(`${concurrentKey}:${now}`);

    // Clean up expired entries
    this.cleanupExpiredEntries();

    return true;
  }

  /**
   * Mark request as completed
   */
  public markRequestCompleted(identifier: string): void {
    const prefix = `concurrent:${identifier}`;
    for (const key of concurrentRequests) {
      if (key.startsWith(prefix)) {
        concurrentRequests.delete(key);
        break;
      }
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime <= now) {
        requestCounts.delete(key);
      }
    }
  }
}

/**
 * Retry mechanism with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationType: keyof typeof DEFAULT_RETRY_CONFIGS = 'api',
  customConfig?: Partial<RetryConfig>
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIGS[operationType], ...customConfig };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      const isRetryable = error instanceof HedwigError 
        ? error.retryable 
        : config.retryableErrors.some(code => 
            error.message.includes(code) || 
            (error as any).code === code
          );
      
      if (!isRetryable || attempt === config.maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      
      console.warn(`Operation failed (attempt ${attempt}/${config.maxAttempts}), retrying in ${delay}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Circuit breaker for external services
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new HedwigError(
          'Circuit breaker is OPEN',
          'CIRCUIT_BREAKER_OPEN',
          true
        );
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

/**
 * Mainnet safety wrapper for critical operations
 */
export async function withMainnetSafety<T>(
  operation: () => Promise<T>,
  identifier: string,
  operationType: string = 'general'
): Promise<T> {
  const rateLimiter = RateLimiter.getInstance();
  const network = getCurrentNetworkEnvironment();
  
  try {
    // Apply rate limiting for mainnet
    if (network === 'mainnet') {
      await rateLimiter.checkRateLimit(identifier, operationType);
    }
    
    // Execute operation with retry logic
    const result = await withRetry(operation, 'blockchain');
    
    return result;
  } catch (error) {
    // Enhanced error logging for mainnet
    if (network === 'mainnet') {
      console.error('🚨 Mainnet operation failed:', {
        identifier,
        operationType,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    
    throw error;
  } finally {
    // Mark request as completed for rate limiting
    if (network === 'mainnet') {
      rateLimiter.markRequestCompleted(identifier);
    }
  }
}

/**
 * Input validation and sanitization
 */
export class InputValidator {
  static validateAddress(address: string): boolean {
    // Ethereum address validation
    if (address.startsWith('0x')) {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    
    // Solana address validation (basic)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  
  static validateAmount(amount: string | number): boolean {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return !isNaN(num) && num > 0 && num < 1000000; // Max 1M for safety
  }
  
  static sanitizeString(input: string): string {
    return input.replace(/[<>"'&]/g, '').trim();
  }
  
  static validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

/**
 * Security headers and CORS configuration
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
};

/**
 * Audit logging for sensitive operations
 */
export function auditLog(operation: string, details: Record<string, any>): void {
  const network = getCurrentNetworkEnvironment();
  const logEntry = {
    timestamp: new Date().toISOString(),
    network,
    operation,
    details,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
  };
  
  // In production, this should go to a secure logging service
  console.log('🔍 AUDIT:', JSON.stringify(logEntry));
}