import { createClient } from '@supabase/supabase-js';
import { getOrCreateCdpWallet, transferToken, getBalances } from '../lib/cdp';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Paycrest API configuration
const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;

// Supported tokens for offramp (Base network only)
const SUPPORTED_TOKENS = ['USDC'];
const SUPPORTED_CURRENCIES = ['NGN', 'KES'];
const UNSUPPORTED_TOKENS = ['SOL', 'ETH', 'USDT'];
const SOLANA_TOKENS = ['SOL', 'USDC-SOL', 'USDT-SOL'];

// Types
export interface OfframpRequest {
  userId: string;
  amount: number;
  token: string;
  currency: string;
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
  payoutId?: string;
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
      
      for (const currency of SUPPORTED_CURRENCIES) {
        try {
          const response = await axios.get(
            `${PAYCREST_API_BASE_URL}/rates/${token.toLowerCase()}/${amount}/${currency.toLowerCase()}`,
            {
              headers: {
                'Authorization': `Bearer ${PAYCREST_API_KEY}`
              }
            }
          );
          
          rates[currency] = response.data.data.amount;
        } catch (error) {
          console.warn(`[OfframpService] Failed to get rate for ${currency}:`, error);
          // Use fallback rates
          rates[currency] = currency === 'NGN' ? 1650 : 150;
        }
      }
      
      return rates;
    } catch (error) {
      console.error('[OfframpService] Error getting exchange rates:', error);
      // Return fallback rates
      return { NGN: 1650, KES: 150 };
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
          accountNumber,
          bankCode,
          currency: currency.toLowerCase()
        },
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data.data;
      return {
        isValid: data.valid || false,
        accountName: data.accountName
      };
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
   * Process offramp transaction with enhanced error handling
   */
  async processOfframp(request: OfframpRequest): Promise<OfframpTransaction> {
    let transactionId: string | undefined;
    
    try {
      // 1. Validate inputs and network support
      const tokenUpper = request.token.toUpperCase();
      
      // Check for Solana tokens
      if (SOLANA_TOKENS.includes(tokenUpper) || tokenUpper.includes('SOL')) {
        throw new Error('🚧 Solana network support is coming soon! Currently, we only support USDC on Base network. Please use USDC on Base for withdrawals.');
      }
      
      // Check for other unsupported tokens
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
      
      // Check for supported tokens
      if (!SUPPORTED_TOKENS.includes(tokenUpper)) {
        throw new Error(`🚧 ${request.token} withdrawals are not supported yet. Currently, we only support USDC on Base network.`);
      }

      if (!SUPPORTED_CURRENCIES.includes(request.currency.toUpperCase())) {
        this.handleOfframpError(new Error(`Unsupported currency: ${request.currency}`), 'validation');
      }

      // TODO: Re-enable KYC check once suitable provider is found
      // 2. Check KYC status
      // try {
      //   const kycStatus = await this.checkKYCStatus(request.userId);
      //   if (kycStatus.status !== 'verified') {
      //     this.handleOfframpError(new Error('KYC verification required'), 'kyc_check');
      //   }
      // } catch (error) {
      //   this.handleOfframpError(error, 'kyc_check');
      // }

      // 3. Get user's wallet
      let wallet;
      try {
        wallet = await getOrCreateCdpWallet(request.userId, 'base');
      } catch (error) {
        this.handleOfframpError(error, 'wallet_access');
      }
      
      // 4. Check wallet balance
      try {
        const balances = await getBalances(wallet.address, 'base');
        const tokenBalance = balances.find(b => 
          b.asset.symbol.toUpperCase() === request.token.toUpperCase()
        );
        
        if (!tokenBalance || parseFloat(tokenBalance.amount) < request.amount) {
          this.handleOfframpError(new Error('Insufficient balance'), 'balance_check');
        }
      } catch (error) {
        this.handleOfframpError(error, 'balance_check');
      }

      // 5. Verify bank account details
      try {
        const bankVerification = await this.verifyBankAccount(
          request.bankDetails.accountNumber,
          request.bankDetails.bankCode,
          request.currency
        );
        
        if (!bankVerification.isValid) {
          this.handleOfframpError(new Error('Invalid bank account details'), 'bank_verification');
        }
      } catch (error) {
        this.handleOfframpError(error, 'bank_verification');
      }

      // 6. Get exchange rate
      let rates, fiatAmount;
      try {
        rates = await this.getExchangeRates(request.token, request.amount);
        fiatAmount = rates[request.currency.toUpperCase()];
        
        if (!fiatAmount || fiatAmount <= 0) {
          this.handleOfframpError(new Error('Unable to get exchange rate'), 'exchange_rate');
        }
      } catch (error) {
        this.handleOfframpError(error, 'exchange_rate');
      }

      // 7. Create transaction record
      transactionId = `offramp_${Date.now()}_${request.userId.slice(-8)}`;
      const transaction: OfframpTransaction = {
        id: transactionId,
        userId: request.userId,
        amount: request.amount,
        token: request.token.toUpperCase(),
        fiatAmount,
        fiatCurrency: request.currency.toUpperCase(),
        bankDetails: request.bankDetails,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 8. Store transaction in database
      try {
        await supabase
          .from('offramp_transactions')
          .insert({
            id: transaction.id,
            user_id: transaction.userId,
            amount: transaction.amount,
            token: transaction.token,
            fiat_amount: transaction.fiatAmount,
            fiat_currency: transaction.fiatCurrency,
            bank_details: transaction.bankDetails,
            status: transaction.status,
            created_at: transaction.createdAt.toISOString(),
            updated_at: transaction.updatedAt.toISOString()
          });
      } catch (error) {
        this.handleOfframpError(error, 'database_insert', transactionId);
      }

      // 9. Create Paycrest sender order to get receive address
      let senderOrderResponse, receiveAddress;
      try {
        senderOrderResponse = await axios.post(
          `${PAYCREST_API_BASE_URL}/sender/orders`,
          {
            amount: request.amount,
            token: request.token.toLowerCase(),
            currency: request.currency.toLowerCase()
          },
          {
            headers: {
              'Authorization': `Bearer ${PAYCREST_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          }
        );

        receiveAddress = senderOrderResponse.data.data.receiveAddress;
        if (!receiveAddress) {
          this.handleOfframpError(new Error('Failed to get receive address from Paycrest'), 'sender_order', transactionId);
        }
      } catch (error) {
        this.handleOfframpError(error, 'sender_order', transactionId);
      }

      // 10. Transfer tokens to Paycrest address
      let transferResult;
      try {
        const tokenAddress = this.getTokenAddress(request.token, 'base');
        transferResult = await transferToken(
          wallet.address,
          receiveAddress,
          tokenAddress,
          request.amount.toString(),
          18,
          'base'
        );
      } catch (error) {
        this.handleOfframpError(error, 'blockchain_transfer', transactionId);
      }

      // 11. Update transaction with tx hash
      try {
        transaction.txHash = transferResult.hash;
        transaction.status = 'processing';
        transaction.updatedAt = new Date();

        await supabase
          .from('offramp_transactions')
          .update({
            tx_hash: transferResult.hash,
            status: 'processing',
            updated_at: transaction.updatedAt.toISOString()
          })
          .eq('id', transaction.id);
      } catch (error) {
        this.handleOfframpError(error, 'database_update', transactionId);
      }

      // 12. Create Paycrest payout
      let payoutResponse;
      try {
        payoutResponse = await axios.post(
          `${PAYCREST_API_BASE_URL}/payouts`,
          {
            amount: fiatAmount,
            currency: request.currency.toLowerCase(),
            bankCode: request.bankDetails.bankCode,
            accountNumber: request.bankDetails.accountNumber,
            accountName: request.bankDetails.accountName,
            reference: transaction.id,
            senderOrderId: senderOrderResponse.data.data.id
          },
          {
            headers: {
              'Authorization': `Bearer ${PAYCREST_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          }
        );

        const payoutId = payoutResponse.data.data.id;
        transaction.payoutId = payoutId;

        // 13. Update transaction with payout ID
        await supabase
          .from('offramp_transactions')
          .update({
            payout_id: payoutId,
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.id);
      } catch (error) {
        this.handleOfframpError(error, 'payout_creation', transactionId);
      }

      return transaction;
    } catch (error) {
      // If we have a transaction ID, this error was already handled by handleOfframpError
      if (transactionId) {
        throw error;
      }
      // Otherwise, handle it now
      this.handleOfframpError(error, 'unknown');
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
      if (transaction.status === 'processing' && transaction.payout_id) {
        const updatedStatus = await this.checkPayoutStatus(transaction.payout_id);
        
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
        payoutId: transaction.payout_id,
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
   * Check payout status with Paycrest
   */
  private async checkPayoutStatus(payoutId: string): Promise<'pending' | 'processing' | 'completed' | 'failed'> {
    try {
      if (!PAYCREST_API_KEY) {
        throw new Error('Paycrest API key not configured');
      }

      const response = await axios.get(
        `${PAYCREST_API_BASE_URL}/payout/status/${payoutId}`,
        {
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`
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
        payoutId: tx.payout_id,
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
          payout_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      // Recreate the offramp request
      const request: OfframpRequest = {
        userId: transaction.user_id,
        amount: transaction.amount,
        token: transaction.token,
        currency: transaction.fiat_currency,
        bankDetails: transaction.bank_details
      };

      // Process the offramp again
      return await this.processOfframp(request);
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
}

export const offrampService = new OfframpService();