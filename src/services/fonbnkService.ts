import { createClient } from '@supabase/supabase-js';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { getCurrentConfig } from '../lib/envConfig';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get Fonbnk configuration
const config = getCurrentConfig();
const FONBNK_API_BASE_URL = config.fonbnk.baseUrl;
const FONBNK_API_KEY = config.fonbnk.apiKey;
const FONBNK_API_SECRET = config.fonbnk.apiSecret;
const FONBNK_WEBHOOK_SECRET = config.fonbnk.webhookSecret;

// Validate API credentials on service initialization
if (!FONBNK_API_KEY || !FONBNK_API_SECRET) {
  console.warn('[FonbnkService] Fonbnk API credentials not fully configured - onramp functionality will be limited');
  console.warn('[FonbnkService] Available Fonbnk config:', {
    apiKey: !!FONBNK_API_KEY,
    apiSecret: !!FONBNK_API_SECRET,
    webhookSecret: !!FONBNK_WEBHOOK_SECRET,
    baseUrl: FONBNK_API_BASE_URL
  });
}

// Supported tokens and chains for onramp
const SUPPORTED_TOKENS = ['USDC', 'USDT', 'CUSD'];
const SUPPORTED_CHAINS = ['solana', 'base', 'celo', 'lisk'];
const SUPPORTED_CURRENCIES = ['NGN', 'KES', 'GHS', 'UGX', 'TZS'];
const MINIMUM_USD_AMOUNT = 5; // Minimum $5 USD equivalent
const MAXIMUM_USD_AMOUNT = 10000; // Maximum $10,000 USD equivalent

// Token-Chain compatibility mapping
const TOKEN_CHAIN_MAPPING: Record<string, string[]> = {
  'USDC': ['solana', 'base', 'celo', 'lisk'],
  'USDT': ['solana', 'lisk'],
  'CUSD': ['celo']
};

// Types
export interface OnrampRequest {
  userId: string;
  token: string;
  chain: string;
  amount: number;
  currency: string;
  walletAddress: string;
}

export interface OnrampTransaction {
  id: string;
  userId: string;
  fonbnkTransactionId: string;
  token: string;
  chain: string;
  amount: number;
  fiatAmount: number;
  fiatCurrency: string;
  walletAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  errorMessage?: string;
  fonbnkPaymentUrl?: string;
  expiresAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateResponse {
  rate: number;
  fiatAmount: number;
  fees: {
    fonbnkFee: number;
    networkFee: number;
    totalFee: number;
  };
  expiresAt: Date;
}

export interface TransactionResponse {
  transactionId: string;
  paymentUrl: string;
  expiresAt: Date;
  status: string;
}

export interface SupportedToken {
  symbol: string;
  name: string;
  chains: string[];
  minAmount: number;
  maxAmount: number;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
  regions: string[];
}

export class FonbnkService {
  private apiClient: AxiosInstance;
  private rateCache = new Map<string, { data: RateResponse; expiresAt: Date }>();

  constructor() {
    // Initialize API client with authentication
    this.apiClient = axios.create({
      baseURL: FONBNK_API_BASE_URL,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hedwig-Telegram-Bot/1.0'
      }
    });

    // Add request interceptor for authentication
    this.apiClient.interceptors.request.use(
      (config) => {
        if (FONBNK_API_KEY) {
          config.headers['Authorization'] = `Bearer ${FONBNK_API_KEY}`;
        }
        if (FONBNK_API_SECRET) {
          config.headers['X-API-Secret'] = FONBNK_API_SECRET;
        }
        
        console.log(`[FonbnkService] API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[FonbnkService] Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => {
        console.log(`[FonbnkService] API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('[FonbnkService] API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  /**
   * Handle API errors with proper error messages
   */
  private handleApiError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          return new Error(data?.message || 'Invalid request parameters');
        case 401:
          return new Error('Invalid API credentials');
        case 403:
          return new Error('Access forbidden - check API permissions');
        case 404:
          return new Error('API endpoint not found');
        case 429:
          return new Error('Rate limit exceeded - please try again later');
        case 500:
          return new Error('Fonbnk service temporarily unavailable');
        default:
          return new Error(data?.message || `API error: ${status}`);
      }
    } else if (error.request) {
      return new Error('Network error - please check your connection');
    } else {
      return new Error(error.message || 'Unknown error occurred');
    }
  }

  /**
   * Validate onramp request parameters
   */
  private validateOnrampRequest(request: OnrampRequest): void {
    const { token, chain, amount, currency } = request;

    // Validate token
    if (!SUPPORTED_TOKENS.includes(token.toUpperCase())) {
      throw new Error(`Unsupported token: ${token}. Supported tokens: ${SUPPORTED_TOKENS.join(', ')}`);
    }

    // Validate chain
    if (!SUPPORTED_CHAINS.includes(chain.toLowerCase())) {
      throw new Error(`Unsupported chain: ${chain}. Supported chains: ${SUPPORTED_CHAINS.join(', ')}`);
    }

    // Validate token-chain compatibility
    const supportedChains = TOKEN_CHAIN_MAPPING[token.toUpperCase()];
    if (!supportedChains || !supportedChains.includes(chain.toLowerCase())) {
      throw new Error(`${token} is not supported on ${chain}. Supported chains for ${token}: ${supportedChains?.join(', ') || 'none'}`);
    }

    // Validate currency
    if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
      throw new Error(`Unsupported currency: ${currency}. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }

    // Validate amount
    if (amount < MINIMUM_USD_AMOUNT) {
      throw new Error(`Minimum amount is $${MINIMUM_USD_AMOUNT} USD equivalent`);
    }

    if (amount > MAXIMUM_USD_AMOUNT) {
      throw new Error(`Maximum amount is $${MAXIMUM_USD_AMOUNT} USD equivalent`);
    }

    // Validate wallet address
    if (!request.walletAddress || request.walletAddress.length < 10) {
      throw new Error('Invalid wallet address');
    }
  }

  /**
   * Get supported tokens with their chain compatibility
   */
  async getSupportedTokens(): Promise<SupportedToken[]> {
    try {
      // For now, return static configuration
      // In the future, this could be fetched from Fonbnk API
      return [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          chains: ['solana', 'base', 'celo', 'lisk'],
          minAmount: MINIMUM_USD_AMOUNT,
          maxAmount: MAXIMUM_USD_AMOUNT
        },
        {
          symbol: 'USDT',
          name: 'Tether USD',
          chains: ['solana', 'lisk'],
          minAmount: MINIMUM_USD_AMOUNT,
          maxAmount: MAXIMUM_USD_AMOUNT
        },
        {
          symbol: 'CUSD',
          name: 'Celo Dollar',
          chains: ['celo'],
          minAmount: MINIMUM_USD_AMOUNT,
          maxAmount: MAXIMUM_USD_AMOUNT
        }
      ];
    } catch (error) {
      console.error('[FonbnkService] Error getting supported tokens:', error);
      throw new Error('Failed to get supported tokens');
    }
  }

  /**
   * Get supported currencies with their regions
   */
  async getSupportedCurrencies(): Promise<SupportedCurrency[]> {
    try {
      // For now, return static configuration
      // In the future, this could be fetched from Fonbnk API
      return [
        {
          code: 'NGN',
          name: 'Nigerian Naira',
          symbol: '₦',
          regions: ['Nigeria']
        },
        {
          code: 'KES',
          name: 'Kenyan Shilling',
          symbol: 'KSh',
          regions: ['Kenya']
        },
        {
          code: 'GHS',
          name: 'Ghanaian Cedi',
          symbol: '₵',
          regions: ['Ghana']
        },
        {
          code: 'UGX',
          name: 'Ugandan Shilling',
          symbol: 'USh',
          regions: ['Uganda']
        },
        {
          code: 'TZS',
          name: 'Tanzanian Shilling',
          symbol: 'TSh',
          regions: ['Tanzania']
        }
      ];
    } catch (error) {
      console.error('[FonbnkService] Error getting supported currencies:', error);
      throw new Error('Failed to get supported currencies');
    }
  }

  /**
   * Enhanced error handling for onramp operations
   */
  private handleOnrampError(error: any, step: string, transactionId?: string): never {
    console.error(`[FonbnkService] Error at ${step}:`, error);
    
    // Log error to transaction if ID exists
    if (transactionId) {
      // Fire and forget - don't await this
      (async () => {
        try {
          await supabase
            .from('onramp_transactions')
            .update({
              status: 'failed',
              error_message: error.message || 'Unknown error',
              error_step: step,
              updated_at: new Date().toISOString()
            })
            .eq('id', transactionId);
          console.log(`Transaction ${transactionId} marked as failed`);
        } catch (updateError) {
          console.error(`Failed to update transaction ${transactionId}:`, updateError);
        }
      })();
    }

    // Categorize errors for better user experience
    if (error.message?.includes('Rate limit')) {
      throw new Error('Service temporarily busy. Please try again in a few minutes.');
    }
    
    if (error.message?.includes('Network error')) {
      throw new Error('Connection issue. Please check your internet and try again.');
    }
    
    if (error.message?.includes('Invalid API credentials')) {
      throw new Error('Service configuration error. Please contact support.');
    }
    
    if (error.message?.includes('Unsupported')) {
      throw new Error(error.message);
    }
    
    if (step === 'rate_fetching') {
      throw new Error('Unable to get current exchange rates. Please try again.');
    }
    
    if (step === 'transaction_creation') {
      throw new Error('Failed to create transaction. Please try again or contact support.');
    }
    
    if (step === 'validation') {
      throw new Error(error.message || 'Invalid request parameters.');
    }
    
    // Default error message
    throw new Error('Transaction failed. Please try again or contact support if the issue persists.');
  }

  /**
   * Get exchange rates for a specific token amount and currency
   * Includes caching mechanism to reduce API calls
   */
  async getExchangeRates(token: string, amount: number, currency: string): Promise<RateResponse> {
    try {
      console.log(`[FonbnkService] Getting exchange rates for ${amount} ${token} to ${currency}`);

      // Validate inputs
      if (!token || !currency || amount <= 0) {
        throw new Error('Invalid parameters for rate fetching');
      }

      if (!SUPPORTED_TOKENS.includes(token.toUpperCase())) {
        throw new Error(`Unsupported token: ${token}`);
      }

      if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
        throw new Error(`Unsupported currency: ${currency}`);
      }

      // Check cache first (30 second cache)
      const cacheKey = `fonbnk_rate_${token}_${amount}_${currency}`;
      const cachedRate = await this.getCachedRate(cacheKey);
      if (cachedRate) {
        console.log(`[FonbnkService] Using cached rate for ${token}/${currency}`);
        return cachedRate;
      }

      // Fetch rate from Fonbnk API
      const response = await this.apiClient.get('/onramp/rates', {
        params: {
          token: token.toUpperCase(),
          amount: amount,
          currency: currency.toUpperCase()
        }
      });

      const data = response.data;
      
      if (!data || !data.rate || data.rate <= 0) {
        throw new Error('Invalid rate response from Fonbnk API');
      }

      const rateResponse: RateResponse = {
        rate: parseFloat(data.rate),
        fiatAmount: parseFloat(data.fiat_amount || (amount * data.rate)),
        fees: {
          fonbnkFee: parseFloat(data.fees?.fonbnk_fee || '0'),
          networkFee: parseFloat(data.fees?.network_fee || '0'),
          totalFee: parseFloat(data.fees?.total_fee || '0')
        },
        expiresAt: new Date(Date.now() + 30 * 1000) // 30 seconds from now
      };

      // Cache the rate for 30 seconds
      await this.setCachedRate(cacheKey, rateResponse, 30);

      console.log(`[FonbnkService] Fetched rate: 1 ${token} = ${rateResponse.rate} ${currency}`);
      return rateResponse;

    } catch (error) {
      console.error('[FonbnkService] Error fetching exchange rates:', error);
      this.handleOnrampError(error, 'rate_fetching');
    }
  }

  /**
   * Get cached exchange rate
   */
  private async getCachedRate(cacheKey: string): Promise<RateResponse | null> {
    try {
      // For now, use in-memory cache
      // In production, you might want to use Redis
      const cached = this.rateCache.get(cacheKey);
      if (cached && cached.expiresAt > new Date()) {
        return cached.data;
      }
      return null;
    } catch (error) {
      console.warn('[FonbnkService] Error getting cached rate:', error);
      return null;
    }
  }

  /**
   * Set cached exchange rate
   */
  private async setCachedRate(cacheKey: string, rate: RateResponse, ttlSeconds: number): Promise<void> {
    try {
      // Simple in-memory cache
      this.rateCache.set(cacheKey, {
        data: rate,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000)
      });

      // Clean up expired entries
      this.cleanupExpiredCache();
    } catch (error) {
      console.warn('[FonbnkService] Error setting cached rate:', error);
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = new Date();
    for (const [key, value] of this.rateCache.entries()) {
      if (value.expiresAt <= now) {
        this.rateCache.delete(key);
      }
    }
  }

  /**
   * Get exchange rates for multiple currencies
   */
  async getExchangeRatesMultiple(token: string, amount: number, currencies: string[]): Promise<Record<string, RateResponse>> {
    try {
      const rates: Record<string, RateResponse> = {};
      
      // Fetch rates for each currency
      const ratePromises = currencies.map(async (currency) => {
        try {
          const rate = await this.getExchangeRates(token, amount, currency);
          return { currency: currency.toUpperCase(), rate };
        } catch (error) {
          console.warn(`[FonbnkService] Failed to get rate for ${currency}:`, error);
          return null;
        }
      });

      const results = await Promise.allSettled(ratePromises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          rates[result.value.currency] = result.value.rate;
        }
      });

      if (Object.keys(rates).length === 0) {
        throw new Error('Failed to fetch rates for any currency');
      }

      return rates;
    } catch (error) {
      console.error('[FonbnkService] Error fetching multiple exchange rates:', error);
      throw error;
    }
  }

  /**
 
  * Create a new onramp transaction
   */
  async createTransaction(request: OnrampRequest): Promise<TransactionResponse> {
    let transactionId: string | undefined;
    
    try {
      console.log(`[FonbnkService] Creating transaction for user ${request.userId}`);

      // 1. Validate request
      this.validateOnrampRequest(request);

      // 2. Get current exchange rate
      const rateResponse = await this.getExchangeRates(request.token, request.amount, request.currency);
      
      // 3. Create transaction record in database first
      const { data: transaction, error: dbError } = await supabase
        .from('onramp_transactions')
        .insert({
          user_id: request.userId,
          token: request.token.toUpperCase(),
          chain: request.chain.toLowerCase(),
          amount: request.amount,
          fiat_amount: rateResponse.fiatAmount,
          fiat_currency: request.currency.toUpperCase(),
          wallet_address: request.walletAddress,
          status: 'pending',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError || !transaction) {
        console.error('[FonbnkService] Database error creating transaction:', dbError);
        throw new Error('Failed to create transaction record');
      }

      transactionId = transaction.id;
      console.log(`[FonbnkService] Created transaction record: ${transactionId}`);

      // 4. Create transaction with Fonbnk API
      const fonbnkResponse = await this.apiClient.post('/onramp/transaction', {
        token: request.token.toUpperCase(),
        chain: request.chain.toLowerCase(),
        amount: request.amount,
        currency: request.currency.toUpperCase(),
        wallet_address: request.walletAddress,
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/fonbnk`,
        reference: `hedwig_${transactionId}_${Date.now()}`
      });

      const fonbnkData = fonbnkResponse.data;
      
      if (!fonbnkData || !fonbnkData.transaction_id) {
        throw new Error('Invalid response from Fonbnk API');
      }

      // 5. Update transaction with Fonbnk details
      const { error: updateError } = await supabase
        .from('onramp_transactions')
        .update({
          fonbnk_transaction_id: fonbnkData.transaction_id,
          fonbnk_payment_url: fonbnkData.payment_url,
          status: fonbnkData.status || 'pending',
          expires_at: fonbnkData.expires_at || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      if (updateError) {
        console.error('[FonbnkService] Error updating transaction with Fonbnk details:', updateError);
        // Don't throw here as the transaction was created successfully
      }

      console.log(`[FonbnkService] Transaction created successfully: ${fonbnkData.transaction_id}`);

      return {
        transactionId: fonbnkData.transaction_id,
        paymentUrl: fonbnkData.payment_url,
        expiresAt: new Date(fonbnkData.expires_at || Date.now() + 30 * 60 * 1000),
        status: fonbnkData.status || 'pending'
      };

    } catch (error) {
      console.error('[FonbnkService] Error creating transaction:', error);
      this.handleOnrampError(error, 'transaction_creation', transactionId);
    }
  }

  /**
   * Check transaction status with Fonbnk API
   */
  async checkTransactionStatus(transactionId: string): Promise<OnrampTransaction | null> {
    try {
      console.log(`[FonbnkService] Checking status for transaction: ${transactionId}`);

      // First, get transaction from database
      const { data: dbTransaction, error: dbError } = await supabase
        .from('onramp_transactions')
        .select('*')
        .eq('fonbnk_transaction_id', transactionId)
        .single();

      if (dbError || !dbTransaction) {
        console.warn(`[FonbnkService] Transaction not found in database: ${transactionId}`);
        return null;
      }

      // If transaction is already completed or failed, return cached status
      if (dbTransaction.status === 'completed' || dbTransaction.status === 'failed') {
        return this.mapDbTransactionToOnrampTransaction(dbTransaction);
      }

      // Check status with Fonbnk API
      try {
        const response = await this.apiClient.get(`/onramp/transaction/${transactionId}`);
        const fonbnkData = response.data;

        if (fonbnkData && fonbnkData.status) {
          // Update database with latest status
          const { error: updateError } = await supabase
            .from('onramp_transactions')
            .update({
              status: fonbnkData.status,
              tx_hash: fonbnkData.tx_hash || dbTransaction.tx_hash,
              completed_at: fonbnkData.status === 'completed' ? new Date().toISOString() : dbTransaction.completed_at,
              updated_at: new Date().toISOString()
            })
            .eq('id', dbTransaction.id);

          if (updateError) {
            console.error('[FonbnkService] Error updating transaction status:', updateError);
          }

          // Return updated transaction
          return this.mapDbTransactionToOnrampTransaction({
            ...dbTransaction,
            status: fonbnkData.status,
            tx_hash: fonbnkData.tx_hash || dbTransaction.tx_hash,
            completed_at: fonbnkData.status === 'completed' ? new Date().toISOString() : dbTransaction.completed_at
          });
        }
      } catch (apiError) {
        console.warn(`[FonbnkService] Error checking status with Fonbnk API:`, apiError);
        // Return database status if API call fails
      }

      return this.mapDbTransactionToOnrampTransaction(dbTransaction);

    } catch (error) {
      console.error('[FonbnkService] Error checking transaction status:', error);
      return null;
    }
  }

  /**
   * Get user's onramp transaction history
   */
  async getUserTransactionHistory(userId: string, limit: number = 10, offset: number = 0): Promise<OnrampTransaction[]> {
    try {
      console.log(`[FonbnkService] Getting transaction history for user: ${userId}`);

      const { data: transactions, error } = await supabase
        .from('onramp_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('[FonbnkService] Error fetching transaction history:', error);
        throw new Error('Failed to fetch transaction history');
      }

      return transactions?.map(tx => this.mapDbTransactionToOnrampTransaction(tx)) || [];

    } catch (error) {
      console.error('[FonbnkService] Error getting user transaction history:', error);
      throw error;
    }
  }

  /**
   * Get transaction by internal ID
   */
  async getTransactionById(transactionId: string): Promise<OnrampTransaction | null> {
    try {
      const { data: transaction, error } = await supabase
        .from('onramp_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        return null;
      }

      return this.mapDbTransactionToOnrampTransaction(transaction);

    } catch (error) {
      console.error('[FonbnkService] Error getting transaction by ID:', error);
      return null;
    }
  }

  /**
   * Map database transaction to OnrampTransaction interface
   */
  private mapDbTransactionToOnrampTransaction(dbTransaction: any): OnrampTransaction {
    return {
      id: dbTransaction.id,
      userId: dbTransaction.user_id,
      fonbnkTransactionId: dbTransaction.fonbnk_transaction_id,
      token: dbTransaction.token,
      chain: dbTransaction.chain,
      amount: parseFloat(dbTransaction.amount),
      fiatAmount: parseFloat(dbTransaction.fiat_amount),
      fiatCurrency: dbTransaction.fiat_currency,
      walletAddress: dbTransaction.wallet_address,
      status: dbTransaction.status,
      txHash: dbTransaction.tx_hash,
      errorMessage: dbTransaction.error_message,
      fonbnkPaymentUrl: dbTransaction.fonbnk_payment_url,
      expiresAt: dbTransaction.expires_at ? new Date(dbTransaction.expires_at) : undefined,
      completedAt: dbTransaction.completed_at ? new Date(dbTransaction.completed_at) : undefined,
      createdAt: new Date(dbTransaction.created_at),
      updatedAt: new Date(dbTransaction.updated_at)
    };
  }

  /**
   * Update transaction status (used by webhook handler)
   */
  async updateTransactionStatus(
    fonbnkTransactionId: string, 
    status: string, 
    txHash?: string, 
    errorMessage?: string
  ): Promise<boolean> {
    try {
      console.log(`[FonbnkService] Updating transaction ${fonbnkTransactionId} status to ${status}`);

      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (txHash) {
        updateData.tx_hash = txHash;
      }

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('onramp_transactions')
        .update(updateData)
        .eq('fonbnk_transaction_id', fonbnkTransactionId);

      if (error) {
        console.error('[FonbnkService] Error updating transaction status:', error);
        return false;
      }

      console.log(`[FonbnkService] Successfully updated transaction ${fonbnkTransactionId}`);
      return true;

    } catch (error) {
      console.error('[FonbnkService] Error updating transaction status:', error);
      return false;
    }
  }}
