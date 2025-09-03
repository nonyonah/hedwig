import { createClient } from '@supabase/supabase-js';
import { getOrCreateCdpWallet, transferToken, getBalances } from '../lib/cdp';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { getCurrentConfig } from '../lib/envConfig';
// Removed viem imports - now using CDP SDK for all blockchain operations
import { erc20Abi, paycrestGatewayAbi } from '../lib/abis';
import { ServerPaycrestService } from './serverPaycrestService';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const serverPaycrestService = new ServerPaycrestService();

// Paycrest API configuration - use direct environment variables
const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_TOKEN = process.env.PAYCREST_API_TOKEN;
const PAYCREST_API_SECRET = process.env.PAYCREST_API_SECRET;
const PAYCREST_GATEWAY_CONTRACT_ADDRESS = '0xYourPaycrestGatewayContractAddressHere'; // TODO: Add the actual contract address

// Validate API credentials on service initialization
if (!PAYCREST_API_KEY || !PAYCREST_API_TOKEN || !PAYCREST_API_SECRET) {
  console.warn('[OfframpService] Paycrest API credentials not fully configured - offramp functionality will be limited');
  console.warn('[OfframpService] Available Paycrest config:', {
    apiKey: !!PAYCREST_API_KEY,
    apiToken: !!PAYCREST_API_TOKEN,
    apiSecret: !!PAYCREST_API_SECRET
  });
}

// Supported tokens for offramp (Base network only)
const SUPPORTED_TOKENS = ['USDC'];
const SUPPORTED_CURRENCIES = ['NGN', 'KES'];
const MINIMUM_USD_AMOUNT = 1; // Minimum $1 USD equivalent
const UNSUPPORTED_TOKENS = ['SOL', 'ETH', 'USDT'];
const SOLANA_TOKENS = ['SOL', 'USDC-SOL', 'USDT-SOL'];

// Types
export interface OfframpRequest {
  userId: string;
  amount: number;
  token: string;
  currency: string;
  chatId?: string;
  bankDetails: {
    accountNumber: string;
    bankName: string;
    bankCode: string;
    accountName: string;
  };
}

export interface OfframpTransaction {
  id: string;
  userId: string;
  amount: number;
  token: string;
  fiatAmount: number;
  fiatCurrency: string;
  bankDetails: {
    accountNumber: string;
    bankName: string;
    bankCode: string;
    accountName: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  gatewayId?: string;
  receiveAddress?: string;
  orderId?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KYCStatus {
  status: 'not_started' | 'pending' | 'verified' | 'rejected';
  kycId?: string;
  message?: string;
}

export class OfframpService {
  /**
   * Check if user has completed KYC verification
   */
  async checkKYCStatus(userId: string): Promise<KYCStatus> {
    try {
      // Get user's KYC data from database
      const { data: kycData, error } = await supabase
        .from('user_kyc')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!kycData) {
        return { status: 'not_started' };
      }

      // If we have a KYC ID, check status with Paycrest
      if (kycData.kyc_id) {
        const updatedStatus = await this.checkKYCStatusWithPaycrest(kycData.kyc_id);
        
        // Update local status if different
        if (updatedStatus.status !== kycData.status) {
          await supabase
            .from('user_kyc')
            .update({ 
              status: updatedStatus.status,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        }
        
        return updatedStatus;
      }

      return {
        status: kycData.status as any,
        message: kycData.message
      };
    } catch (error) {
      console.error('[OfframpService] Error checking KYC status:', error);
      throw new Error('Failed to check KYC status');
    }
  }

  /**
   * Initiate KYC process with Paycrest
   */
  async initiateKYC(userId: string, userEmail: string): Promise<{ kycUrl: string; kycId: string }> {
    try {
      if (!PAYCREST_API_KEY) {
        throw new Error('Paycrest API key not configured');
      }

      // Call Paycrest API to initiate KYC
      const response = await axios.post(
        `${PAYCREST_API_BASE_URL}/kyc/initiate`,
        {
          email: userEmail,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/paycrest/kyc-callback`
        },
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const { kyc_url, kyc_id } = response.data.data;

      // Store KYC data in database
      await supabase
        .from('user_kyc')
        .upsert({
          user_id: userId,
          kyc_id,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      return {
        kycUrl: kyc_url,
        kycId: kyc_id
      };
    } catch (error) {
      console.error('[OfframpService] Error initiating KYC:', error);
      throw new Error('Failed to initiate KYC process');
    }
  }

  /**
   * Check KYC status with Paycrest API
   */
  private async checkKYCStatusWithPaycrest(kycId: string): Promise<KYCStatus> {
    try {
      if (!PAYCREST_API_KEY) {
        throw new Error('Paycrest API key not configured');
      }

      const response = await axios.get(
        `${PAYCREST_API_BASE_URL}/kyc/status/${kycId}`,
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`
          }
        }
      );

      const paycrestStatus = response.data.data.status;
      
      // Map Paycrest status to our status
      let status: KYCStatus['status'];
      switch (paycrestStatus) {
        case 'verified':
        case 'approved':
          status = 'verified';
          break;
        case 'rejected':
        case 'failed':
          status = 'rejected';
          break;
        default:
          status = 'pending';
      }

      return { status, kycId };
    } catch (error) {
      console.error('[OfframpService] Error checking KYC status with Paycrest:', error);
      throw new Error('Failed to check KYC status');
    }
  }

  /**
   * Get exchange rates for supported currencies
   */
  async getExchangeRates(token: string, amount: number): Promise<Record<string, number>> {
    try {
      const rates: Record<string, number> = {};
      
      // Use only supported currencies (NGN, KES)
      for (const currency of SUPPORTED_CURRENCIES) {
        try {
          const response = await axios.get(
            `${PAYCREST_API_BASE_URL}/rates/${token.toUpperCase()}/${amount}/${currency.toUpperCase()}`,
            {
              headers: {
                'Authorization': `Bearer ${PAYCREST_API_KEY}`
              }
            }
          );
          
          // According to Paycrest API docs, response.data.data contains the rate as a string
          const rateData = response.data;
          if (rateData && rateData.status === 'success' && rateData.data && !isNaN(parseFloat(rateData.data))) {
            rates[currency] = parseFloat(rateData.data);
          } else {
            throw new Error(`Invalid rate received: ${JSON.stringify(rateData)}`);
          }
        } catch (error) {
          console.warn(`[OfframpService] Failed to get rate for ${currency}:`, error);
          throw new Error(`Failed to fetch exchange rate for ${currency}`);
        }
      }
      
      return rates;
    } catch (error) {
      console.error('[OfframpService] Error getting exchange rates:', error);
      throw error;
    }
  }

  /**
   * Get supported banks for a currency
   */
  async getSupportedBanks(currency: string): Promise<Array<{ name: string; code: string }>> {
    try {
      if (!PAYCREST_API_KEY) {
        throw new Error('Paycrest API key not configured');
      }

      const response = await axios.get(
        `${PAYCREST_API_BASE_URL}/institutions/${currency.toLowerCase()}`,
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`
          }
        }
      );

      return response.data.data.institutions || [];
    } catch (error) {
      console.error('[OfframpService] Error getting supported banks:', error);
      return [];
    }
  }

  /**
   * Verify bank account details
   */
  async verifyBankAccount(
    accountNumber: string,
    bankCode: string,
    currency: string
  ): Promise<{ isValid: boolean; accountName?: string }> {
    try {
      if (!PAYCREST_API_KEY) {
        throw new Error('Paycrest API key not configured');
      }

      const response = await axios.post(
        `${PAYCREST_API_BASE_URL}/verify-account`,
        {
          institution: bankCode,
          accountIdentifier: accountNumber
        },
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data;
      if (data.status === 'success' && data.data) {
        return {
          isValid: true,
          accountName: data.data
        };
      } else {
        return {
          isValid: false
        };
      }
    } catch (error) {
      console.error('[OfframpService] Error verifying bank account:', error);
      return { isValid: false };
    }
  }

  /**
   * Enhanced error handling for offramp operations
   */
  private handleOfframpError(error: any, step: string, transactionId?: string): never {
    console.error(`[OfframpService] Error at ${step}:`, error);
    
    // Log error to transaction if ID exists
    if (transactionId) {
      supabase
        .from('offramp_transactions')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error',
          error_step: step,
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);
      
      console.log(`Transaction ${transactionId} marked as failed`);
    }

    // Categorize errors for better user experience
    if (error.response?.status === 429) {
      throw new Error('Service temporarily unavailable. Please try again in a few minutes.');
    }
    
    if (error.response?.status >= 500) {
      throw new Error('Service temporarily down. Please try again later.');
    }
    
    if (error.message?.includes('Insufficient balance')) {
      throw new Error('Insufficient balance. Please ensure you have enough tokens in your wallet.');
    }
    
    if (error.message?.includes('KYC')) {
      throw new Error('KYC verification required. Please complete your identity verification first.');
    }
    
    if (error.message?.includes('Unsupported')) {
      throw new Error(error.message);
    }
    
    if (step === 'bank_verification') {
      throw new Error('Invalid bank details. Please check your account number and bank code.');
    }
    
    if (step === 'blockchain_transfer') {
      throw new Error('Blockchain transaction failed. Please try again or contact support.');
    }
    
    if (step === 'payout_creation') {
      throw new Error('Failed to initiate bank transfer. Please try again or contact support.');
    }
    
    // Default error message
    throw new Error('Transaction failed. Please try again or contact support if the issue persists.');
  }

  /**
   * Validate offramp request inputs
   */
  private validateOfframpRequest(request: OfframpRequest) {
    const tokenUpper = request.token.toUpperCase();

    if (SOLANA_TOKENS.includes(tokenUpper) || tokenUpper.includes('SOL')) {
      throw new Error('🚧 Solana network support is coming soon! Currently, we only support USDC on Base network. Please use USDC on Base for withdrawals.');
    }

    if (UNSUPPORTED_TOKENS.includes(tokenUpper)) {
      if (tokenUpper === 'ETH') {
        throw new Error('🚧 ETH withdrawals are not available yet. Currently, we only support USDC on Base network. Please convert your ETH to USDC first.');
      }
      if (tokenUpper === 'SOL') {
        throw new Error('🚧 SOL withdrawals are coming soon! Currently, we only support USDC on Base network.');
      }
      if (tokenUpper === 'USDT') {
        throw new Error('🚧 USDT withdrawals are not available yet. Currently, we only support USDC on Base network. Please convert your USDT to USDC first.');
      }
    }

    if (!SUPPORTED_TOKENS.includes(tokenUpper)) {
      throw new Error(`🚧 ${request.token} withdrawals are not supported yet. Currently, we only support USDC on Base network.`);
    }

    if (!SUPPORTED_CURRENCIES.includes(request.currency.toUpperCase())) {
      this.handleOfframpError(new Error(`Unsupported currency: ${request.currency}`), 'validation');
    }
  }

  /**
   * Check wallet balance for a given token
   */
  private async checkWalletBalance(userId: string, token: string, amount: number) {
    try {
      const wallet = await getOrCreateCdpWallet(userId, 'base');
      const balancesResponse = await getBalances(wallet.address, 'base');
      console.log(`[OfframpService] Raw balance response:`, JSON.stringify(balancesResponse, null, 2));

      let balances;
      if (balancesResponse && typeof balancesResponse === 'object') {
        if (balancesResponse.data && Array.isArray(balancesResponse.data)) {
          balances = balancesResponse.data;
        } else if (Array.isArray(balancesResponse)) {
          balances = balancesResponse;
        } else {
          console.error('[OfframpService] Invalid balances response structure:', balancesResponse);
          this.handleOfframpError(new Error('Invalid balances response'), 'balance_check');
        }
      } else {
        console.error('[OfframpService] Invalid balances response:', balancesResponse);
        this.handleOfframpError(new Error('Invalid balances response'), 'balance_check');
      }

      const tokenBalance = balances.find(b =>
        b.asset && b.asset.symbol && b.asset.symbol.toUpperCase() === token.toUpperCase()
      );

      if (!tokenBalance) {
        console.error(`[OfframpService] Token ${token} not found in wallet. Available tokens:`,
          balances.map(b => b.asset?.symbol).filter(Boolean));
        this.handleOfframpError(new Error(`Token ${token} not found in wallet`), 'balance_check');
      }

      const decimals = tokenBalance.asset.decimals || 18;
      const balanceInWei = BigInt(tokenBalance.amount || '0');
      const divisor = BigInt(10 ** decimals);
      const balanceInTokens = Number(balanceInWei) / Number(divisor);

      console.log(`[OfframpService] Token balance check:`);
      console.log(`[OfframpService] - Token: ${token}`);
      console.log(`[OfframpService] - Balance (wei): ${tokenBalance.amount}`);
      console.log(`[OfframpService] - Balance (tokens): ${balanceInTokens}`);
      console.log(`[OfframpService] - Requested amount: ${amount}`);
      console.log(`[OfframpService] - Decimals: ${decimals}`);

      if (balanceInTokens < amount) {
        this.handleOfframpError(
          new Error(`Insufficient balance. Available: ${balanceInTokens.toFixed(6)} ${token}, Requested: ${amount} ${token}`),
          'balance_check'
        );
      }
    } catch (error) {
      console.error('[OfframpService] Balance check error:', error);
      this.handleOfframpError(error, 'balance_check');
    }
  }

  /**
   * Create a Paycrest order using smart contract
   */
  private async createPaycrestOrder(request: OfframpRequest, returnAddress: string) {
    try {
      // First, fetch the current rate as required by Paycrest Sender API
      const rates = await this.getExchangeRates(request.token, request.amount);
      const currentRate = rates[request.currency.toUpperCase()];
      if (!currentRate || currentRate <= 0) {
        throw new Error(`Unable to get current rate for ${request.currency}`);
      }

      // Calculate fiat amount
      const fiatAmount = request.amount * currentRate;

      // Create order using Paycrest API
      const orderData = {
        amount: fiatAmount,
        currency: request.currency.toUpperCase(),
        recipient: {
          account_number: request.bankDetails.accountNumber,
          bank_code: request.bankDetails.bankCode,
          account_name: request.bankDetails.accountName
        },
        reference: `hedwig_${Date.now()}_${request.userId}`,
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/offramp/webhook`
      };

      const response = await axios.post(
        `${PAYCREST_API_BASE_URL}/transfers`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_TOKEN}`,
            'Content-Type': 'application/json',
            'X-API-Key': PAYCREST_API_KEY
          }
        }
      );

      console.log(`[OfframpService] Paycrest API order created:`, JSON.stringify(response.data, null, 2));

      return {
        id: response.data.id || response.data.reference,
        receiveAddress: returnAddress,
        transactionHash: null // Will be set when user executes the transfer
      };
    } catch (error) {
      console.error('[OfframpService] API order creation error:', error);
      this.handleOfframpError(error, 'order_creation');
    }
  }

  /**
   * Prepare an off-ramp transaction by creating a Paycrest order (without executing transfer)
   */
  async prepareOfframp(request: OfframpRequest): Promise<any> {
    try {
      // 1. Validate inputs
      this.validateOfframpRequest(request);

      // 2. Get user's wallet
      const wallet = await getOrCreateCdpWallet(request.userId, 'base');

      // 3. Check wallet balance
      await this.checkWalletBalance(request.userId, request.token, request.amount);

      // 4. Verify bank account
      await this.verifyBankAccount(
        request.bankDetails.accountNumber,
        request.bankDetails.bankCode,
        request.currency
      );

      // 5. Get exchange rate
      const rates = await this.getExchangeRates(request.token, request.amount);
      const fiatAmount = rates[request.currency.toUpperCase()];
      if (!fiatAmount || fiatAmount <= 0) {
        throw new Error('Unable to get exchange rate');
      }

      // 6. Create Paycrest order (but don't execute transfer yet)
      const order = await this.createPaycrestOrder(request, wallet.address);

      // 7. Create database transaction record
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .insert({
          user_id: request.userId,
          amount: request.amount,
          token: request.token.toUpperCase(),
          fiat_amount: fiatAmount,
          fiat_currency: request.currency.toUpperCase(),
          bank_details: request.bankDetails,
          status: 'pending',
          order_id: order.id,
          receive_address: order.receiveAddress,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[OfframpService] Error creating transaction record:', error);
        throw new Error('Failed to create transaction record');
      }

      // Return order details for user confirmation
      return {
        orderId: order.id,
        receiveAddress: order.receiveAddress,
        fiatAmount,
        walletAddress: wallet.address,
        transactionId: transaction.id
      };
    } catch (error) {
      this.handleOfframpError(error, 'prepare_offramp');
    }
  }

  /**
   * Execute token transfer after user confirmation
   */
  async executeTokenTransfer(params: {
    userId: string;
    amount: number;
    receiveAddress: string;
    orderId: string;
  }): Promise<any> {
    try {
      // Get user's wallet
      const wallet = await getOrCreateCdpWallet(params.userId, 'base');

      // Execute token transfer using CDP
      const tokenAddress = this.getTokenAddress('USDC', 'base');
      const transferResult = await transferToken(
        wallet.address,
        params.receiveAddress,
        tokenAddress,
        params.amount.toString(),
        6, // USDC has 6 decimals
        'base'
      );

      const txHash = transferResult.hash;

      // Process the offramp with the transaction hash
      await this.processOfframp(params.orderId, txHash);

      return {
        orderId: params.orderId,
        txHash,
        transferResult,
      };
    } catch (error) {
      this.handleOfframpError(error, 'execute_transfer');
    }
  }

  async processOfframp(orderId: string, txHash: string): Promise<any> {
    try {
      // 1. Find the transaction by orderId
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .select('id')
        .eq('order_id', orderId)
        .single();

      if (error || !transaction) {
        this.handleOfframpError(new Error(`Transaction not found for orderId: ${orderId}`), 'process_offramp');
      }

      const transactionId = transaction.id;

      // 2. Update transaction with txHash and set status to 'processing'
      await supabase
        .from('offramp_transactions')
        .update({
          tx_hash: txHash,
          status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId);

      // 3. (Optional) You might want to start a background job here to monitor the transaction status
      // For now, we'll just return the updated transaction

      return { id: transactionId, status: 'processing' };
    } catch (error) {
      this.handleOfframpError(error, 'process_offramp');
    }
  }

  /**
   * Get token contract address for a network
   */
  private getTokenAddress(token: string, network: string): string {
    const addresses: Record<string, Record<string, string>> = {
      'base': {
         'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
         'USDT': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
      },
    };

    return addresses[network]?.[token.toUpperCase()] || '';
  }

  /**
   * Check transaction status
   */
  async checkTransactionStatus(transactionId: string): Promise<OfframpTransaction | null> {
    try {
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        return null;
      }

      // If transaction is still processing, check with Paycrest
      if (transaction.status === 'processing' && transaction.order_id) {
        const updatedStatus = await this.checkOrderStatus(transaction.order_id);
        
        if (updatedStatus !== transaction.status) {
          await supabase
            .from('offramp_transactions')
            .update({
              status: updatedStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', transactionId);
          
          transaction.status = updatedStatus;
        }
      }

      return {
        id: transaction.id,
        userId: transaction.user_id,
        amount: transaction.amount,
        token: transaction.token,
        fiatAmount: transaction.fiat_amount,
        fiatCurrency: transaction.fiat_currency,
        bankDetails: transaction.bank_details,
        status: transaction.status,
        txHash: transaction.tx_hash,
        gatewayId: transaction.gateway_id,
        receiveAddress: transaction.receive_address,
        orderId: transaction.order_id,
        errorMessage: transaction.error_message,
        createdAt: new Date(transaction.created_at),
        updatedAt: new Date(transaction.updated_at)
      };
    } catch (error) {
      console.error('[OfframpService] Error checking transaction status:', error);
      return null;
    }
  }

  /**
   * Check order status with Paycrest
   */
  private async checkOrderStatus(orderId: string): Promise<'pending' | 'processing' | 'completed' | 'failed'> {
    try {
      if (!PAYCREST_API_KEY) {
        throw new Error('Paycrest API key not configured');
      }

      const response = await axios.get(
        `${PAYCREST_API_BASE_URL}/order/status/${orderId}`,
        {
          headers: {
            'API-Key': PAYCREST_API_KEY
          }
        }
      );

      const paycrestStatus = response.data.data.status;
      
      // Map Paycrest status to our status
      switch (paycrestStatus) {
        case 'completed':
        case 'success':
          return 'completed';
        case 'failed':
        case 'rejected':
          return 'failed';
        case 'processing':
          return 'processing';
        default:
          return 'pending';
      }
    } catch (error) {
      console.error('[OfframpService] Error checking payout status:', error);
      return 'failed';
    }
  }

  /**
   * Get user's offramp transaction history
   */
  async getTransactionHistory(userId: string): Promise<OfframpTransaction[]> {
    try {
      const { data: transactions, error } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return transactions.map(tx => ({
        id: tx.id,
        userId: tx.user_id,
        amount: tx.amount,
        token: tx.token,
        fiatAmount: tx.fiat_amount,
        fiatCurrency: tx.fiat_currency,
        bankDetails: tx.bank_details,
        status: tx.status,
        txHash: tx.tx_hash,
        gatewayId: tx.gateway_id,
        receiveAddress: tx.receive_address,
        orderId: tx.order_id,
        errorMessage: tx.error_message,
        createdAt: new Date(tx.created_at),
        updatedAt: new Date(tx.updated_at)
      }));
    } catch (error) {
      console.error('[OfframpService] Error getting transaction history:', error);
      return [];
    }
  }

  /**
   * Retry a failed transaction
   */
  async retryTransaction(transactionId: string): Promise<OfframpTransaction | null> {
    try {
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'failed') {
        throw new Error('Only failed transactions can be retried');
      }

      // Reset transaction status to pending
      await supabase
        .from('offramp_transactions')
        .update({
          status: 'pending',
          error_message: null,
          gateway_id: null,
          receive_address: null,
          order_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      // Re-process the offramp request
      const request: OfframpRequest = {
        userId: transaction.user_id,
        amount: transaction.amount,
        token: transaction.token,
        currency: transaction.fiat_currency,
        bankDetails: transaction.bank_details
      };

      // Prepare the offramp again
      return await this.prepareOfframp(request);
    } catch (error) {
      console.error('[OfframpService] Error retrying transaction:', error);
      
      // Mark transaction as failed again with error message
      await supabase
        .from('offramp_transactions')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Retry failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);
      
      return null;
    }
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(transactionId: string): Promise<boolean> {
    try {
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        return false;
      }

      // Only allow cancellation of pending transactions
      if (transaction.status !== 'pending') {
        return false;
      }

      // Update transaction status to cancelled
      await supabase
        .from('offramp_transactions')
        .update({
          status: 'failed',
          error_message: 'Cancelled by user',
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      return true;
    } catch (error) {
      console.error('[OfframpService] Error cancelling transaction:', error);
      return false;
    }
  }

  /**
   * Get transaction statistics for a user
   */
  async getTransactionStats(userId: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    failed: number;
    totalAmount: number;
  }> {
    try {
      const { data: transactions, error } = await supabase
        .from('offramp_transactions')
        .select('status, fiat_amount')
        .eq('user_id', userId);

      if (error || !transactions) {
        return { total: 0, completed: 0, pending: 0, failed: 0, totalAmount: 0 };
      }

      const stats = {
        total: transactions.length,
        completed: 0,
        pending: 0,
        failed: 0,
        totalAmount: 0
      };

      transactions.forEach(tx => {
        switch (tx.status) {
          case 'completed':
            stats.completed++;
            stats.totalAmount += tx.fiat_amount;
            break;
          case 'pending':
          case 'processing':
            stats.pending++;
            break;
          case 'failed':
            stats.failed++;
            break;
        }
      });

      return stats;
    } catch (error) {
      console.error('[OfframpService] Error getting transaction stats:', error);
      return { total: 0, completed: 0, pending: 0, failed: 0, totalAmount: 0 };
    }
  }

  /**
   * Get supported institutions from Paycrest API
   */
  async getSupportedInstitutions(currency: string): Promise<Array<{
    name: string;
    code: string;
    country: string;
  }>> {
    try {
      console.log('[OfframpService] getSupportedInstitutions called for currency:', currency);
      console.log('[OfframpService] API credentials check - Key:', !!PAYCREST_API_KEY, 'Token:', !!PAYCREST_API_TOKEN);
      
      if (!PAYCREST_API_KEY || !PAYCREST_API_TOKEN) {
        console.error('[OfframpService] Paycrest API credentials not configured, using fallback');
        // Use fallback immediately if credentials not configured
        if (currency.toUpperCase() === 'NGN') {
          console.log('[OfframpService] Returning NGN fallback banks');
          return [
            { name: "Access Bank", code: "044", country: "Nigeria" },
            { name: "GTBank", code: "058", country: "Nigeria" },
            { name: "First Bank", code: "011", country: "Nigeria" },
            { name: "Zenith Bank", code: "057", country: "Nigeria" },
            { name: "UBA", code: "033", country: "Nigeria" },
            { name: "Fidelity Bank", code: "070", country: "Nigeria" },
            { name: "Union Bank", code: "032", country: "Nigeria" },
            { name: "Sterling Bank", code: "232", country: "Nigeria" },
            { name: "Stanbic IBTC", code: "221", country: "Nigeria" },
            { name: "Polaris Bank", code: "076", country: "Nigeria" }
          ];
        } else if (currency.toUpperCase() === 'KES') {
          console.log('[OfframpService] Returning KES fallback banks');
          return [
            { name: "KCB Bank", code: "01", country: "Kenya" },
            { name: "Equity Bank", code: "68", country: "Kenya" },
            { name: "Cooperative Bank", code: "11", country: "Kenya" },
            { name: "NCBA Bank", code: "07", country: "Kenya" },
            { name: "Standard Chartered", code: "02", country: "Kenya" },
            { name: "Absa Bank", code: "03", country: "Kenya" },
            { name: "Diamond Trust Bank", code: "63", country: "Kenya" },
            { name: "I&M Bank", code: "57", country: "Kenya" }
          ];
        }
        return [];
      }

      const response = await axios.get(
        `${PAYCREST_API_BASE_URL}/institutions/${currency.toLowerCase()}`,
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.data) {
        return response.data.data.map((institution: any) => ({
          name: institution.name,
          code: institution.code,
          country: institution.country || (currency === 'NGN' ? 'Nigeria' : 'Kenya')
        }));
      }

      return [];
    } catch (error) {
      console.error('[OfframpService] Error fetching supported institutions:', error);
      // Fallback to hardcoded banks if API fails
      if (currency.toUpperCase() === 'NGN') {
        return [
          { name: "Access Bank", code: "044", country: "Nigeria" },
          { name: "GTBank", code: "058", country: "Nigeria" },
          { name: "First Bank", code: "011", country: "Nigeria" },
          { name: "Zenith Bank", code: "057", country: "Nigeria" },
          { name: "UBA", code: "033", country: "Nigeria" },
          { name: "Fidelity Bank", code: "070", country: "Nigeria" },
          { name: "Union Bank", code: "032", country: "Nigeria" },
          { name: "Sterling Bank", code: "232", country: "Nigeria" },
          { name: "Stanbic IBTC", code: "221", country: "Nigeria" },
          { name: "Polaris Bank", code: "076", country: "Nigeria" }
        ];
      } else if (currency.toUpperCase() === 'KES') {
        return [
          { name: "KCB Bank", code: "01", country: "Kenya" },
          { name: "Equity Bank", code: "68", country: "Kenya" },
          { name: "Cooperative Bank", code: "11", country: "Kenya" },
          { name: "NCBA Bank", code: "07", country: "Kenya" },
          { name: "Standard Chartered", code: "02", country: "Kenya" },
          { name: "Absa Bank", code: "03", country: "Kenya" },
          { name: "Diamond Trust Bank", code: "63", country: "Kenya" },
          { name: "I&M Bank", code: "57", country: "Kenya" }
        ];
      }
      return [];
    }
  }

  /**
   * Update transaction status based on contract events
   */
  private async updateTransactionStatusFromEvent(orderId: string, event: any) {
    try {
      let status: 'pending' | 'processing' | 'completed' | 'failed';
      
      switch (event.type) {
        case 'OrderCreated':
          status = 'pending';
          break;
        case 'OrderProcessing':
          status = 'processing';
          break;
        case 'OrderCompleted':
          status = 'completed';
          break;
        case 'OrderFailed':
          status = 'failed';
          break;
        default:
          return;
      }

      await supabase
        .from('offramp_transactions')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId);

      console.log(`[OfframpService] Transaction ${orderId} status updated to ${status}`);
    } catch (error) {
      console.error('[OfframpService] Error updating transaction status from event:', error);
    }
  }

  /**
   * Process offramp request for Telegram bot users using server-managed wallets
   */
  async processTelegramOfframp(request: OfframpRequest): Promise<OfframpTransaction> {
    try {
      console.log('[OfframpService] Processing Telegram offramp request:', request);
      
      // Validate request
      this.validateOfframpRequest(request);
      
      // Convert to server offramp request format
      const serverRequest = {
        userId: request.userId,
        amount: request.amount,
        currency: request.currency,
        bankDetails: {
          accountNumber: request.bankDetails.accountNumber,
          bankCode: request.bankDetails.bankCode,
          accountName: request.bankDetails.accountName
        },
        network: 'base' // Default to Base network for USDC
      };
      
      // Use server wallet service to process the offramp
      const result = await serverPaycrestService.createOfframpOrder(serverRequest);
      
      console.log('[OfframpService] Telegram offramp result:', result);
      
      // Create transaction record in our format
      const transaction: OfframpTransaction = {
        id: result.orderId,
        userId: request.userId,
        amount: request.amount,
        token: request.token,
        fiatAmount: 0, // Will be updated when we get the actual rate
        fiatCurrency: request.currency,
        bankDetails: request.bankDetails,
        status: result.status as 'pending' | 'processing' | 'completed' | 'failed',
        txHash: result.transactionHash,
        receiveAddress: result.receiveAddress,
        orderId: result.orderId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      return transaction;
    } catch (error) {
      console.error('[OfframpService] Error processing Telegram offramp:', error);
      throw error;
    }
  }

  // Removed getPaycrestGatewayContract method - using CDP SDK for all blockchain operations
}

export const offrampService = new OfframpService();

/**
 * Process the offramp request
 */