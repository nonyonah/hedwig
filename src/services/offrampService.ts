import { createClient } from '@supabase/supabase-js';
import { getOrCreateCdpWallet, transferToken, getBalances } from '../lib/cdp';
import { formatBalance } from '../lib/utils';
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

// Supported tokens for offramp (Base, Celo, and Lisk networks)
const SUPPORTED_TOKENS = ['USDC', 'USDT', 'CUSD'];
const SUPPORTED_CURRENCIES = ['NGN', 'GHS'];
const MINIMUM_USD_AMOUNT = 1; // Minimum $1 USD equivalent
const UNSUPPORTED_TOKENS = ['SOL', 'ETH', 'WETH', 'BTC', 'WBTC'];
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
  async getExchangeRates(token: string, amount: number, currency?: string): Promise<Record<string, number>> {
    try {
      const rates: Record<string, number> = {};
      
      // If specific currency is provided, use only that currency, otherwise use all supported currencies
      const currenciesToFetch = currency ? [currency.toUpperCase()] : SUPPORTED_CURRENCIES;
      
      for (const curr of currenciesToFetch) {
        try {
          const response = await axios.get(
            `${PAYCREST_API_BASE_URL}/rates/${token.toUpperCase()}/${amount}/${curr.toUpperCase()}`,
            {
              headers: {
                'Authorization': `Bearer ${PAYCREST_API_KEY}`
              }
            }
          );
          
          // According to Paycrest API docs, response.data.data contains the rate as a string
          const rateData = response.data;
          if (rateData && rateData.status === 'success' && rateData.data && !isNaN(parseFloat(rateData.data))) {
            rates[curr] = parseFloat(rateData.data);
          } else {
            throw new Error(`Invalid rate received: ${JSON.stringify(rateData)}`);
          }
        } catch (error) {
          console.warn(`[OfframpService] Failed to get rate for ${curr}:`, error);
          throw new Error(`Failed to fetch exchange rate for ${curr}`);
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
        throw new Error('🚧 ETH withdrawals are not available yet. Currently, we support USDC on Base, USDC/cUSD on Celo, and USDT on Lisk. Please convert your ETH to a supported token first.');
      }
      if (tokenUpper === 'SOL') {
        throw new Error('🚧 SOL withdrawals are coming soon! Currently, we support USDC on Base, USDC/cUSD on Celo, and USDT on Lisk.');
      }
    }

    if (!SUPPORTED_TOKENS.includes(tokenUpper)) {
      throw new Error(`🚧 ${request.token} withdrawals are not supported yet. Currently, we support USDC on Base, USDC/cUSD on Celo, and USDT on Lisk.`);
    }

    if (!SUPPORTED_CURRENCIES.includes(request.currency.toUpperCase())) {
      this.handleOfframpError(new Error(`Unsupported currency: ${request.currency}`), 'validation');
    }
  }

  /**
   * Check wallet balance for a given token
   */
  private async checkWalletBalance(userId: string, token: string, amount: number, network?: string) {
    try {
      console.log(`[OfframpService] Checking wallet balance for user ${userId}, token ${token}, amount ${amount}, network ${network}`);
      
      // Get or create CDP wallet for the user
      const wallet = await getOrCreateCdpWallet(userId);
      if (!wallet || !wallet.address) {
        throw new Error('Failed to get wallet address');
      }

      const walletAddress = wallet.address;
      console.log(`[OfframpService] Wallet address: ${walletAddress}`);

      const tokenUpper = token.toUpperCase();

      // If a specific network is provided, check only that network
      if (network) {
        console.log(`[OfframpService] Checking specific network: ${network}`);
        return await this.checkBalanceOnNetwork(walletAddress, tokenUpper, amount, network);
      }

      // For USDC, check across all supported networks where USDC exists
      if (tokenUpper === 'USDC') {
        const usdcNetworks = ['base', 'celo', 'lisk'];
        console.log(`[OfframpService] Checking USDC across multiple networks: ${usdcNetworks.join(', ')}`);
        
        for (const targetNetwork of usdcNetworks) {
          try {
            const result = await this.checkBalanceOnNetwork(walletAddress, tokenUpper, amount, targetNetwork);
            if (result.balance >= amount) {
              console.log(`[OfframpService] Found sufficient USDC balance on ${targetNetwork}: ${result.balance}`);
              return result;
            }
          } catch (error) {
            console.log(`[OfframpService] No sufficient balance on ${targetNetwork}:`, error.message);
            continue;
          }
        }
        
        // If no network has sufficient balance, throw error
        throw new Error(`Insufficient USDC balance across all supported networks. Required: ${amount}`);
      }

      // For other tokens, use the default network mapping
      const targetNetwork = this.getNetworkForToken(token);
      console.log(`[OfframpService] Target network for ${token}: ${targetNetwork}`);
      return await this.checkBalanceOnNetwork(walletAddress, tokenUpper, amount, targetNetwork);

    } catch (error) {
      console.error('[OfframpService] Balance check failed:', error);
      throw error;
    }
  }

  private async checkBalanceOnNetwork(walletAddress: string, token: string, amount: number, network: string) {
    try {
      console.log(`[OfframpService] Checking ${token} balance on ${network}`);
      
      // Get balances for the specific network
      const balances = await getBalances(walletAddress, network);
      console.log(`[OfframpService] Balances for ${network}:`, JSON.stringify(balances, null, 2));

      if (!balances) {
        throw new Error(`Failed to fetch balances for network ${network}`);
      }

      // Find the specific token balance
      let tokenBalance = 0;

      // Handle different balance response formats - using the same robust logic as actions.ts
      if (Array.isArray(balances)) {
        // Direct array format
        const tokenBalanceItem = balances.find((balance: any) => 
          balance.asset?.symbol?.toUpperCase() === token
        );
        if (tokenBalanceItem) {
          tokenBalance = parseFloat(tokenBalanceItem.amount || '0');
        }
      } else if (balances && typeof balances === 'object' && 'data' in balances) {
        // EVM ListTokenBalancesResult format (from CDP or Alchemy) - same as actions.ts
        const balanceArray = (balances as any).data || [];
        const tokenBalanceItem = balanceArray.find((balance: any) => 
          balance.asset?.symbol?.toUpperCase() === token
        );
        if (tokenBalanceItem) {
          // Use the formatBalance function from utils.ts - same as actions.ts
          const decimals = tokenBalanceItem.asset?.decimals || 18;
          const rawAmount = tokenBalanceItem.amount || '0';
          const formattedBalance = formatBalance(rawAmount, decimals);
          tokenBalance = parseFloat(formattedBalance);
        }
      } else if (typeof balances === 'object') {
        // Object format with token symbols as keys
        for (const [key, value] of Object.entries(balances)) {
          if (key.toUpperCase() === token && typeof value === 'object' && value !== null) {
            const balanceObj = value as any;
            tokenBalance = parseFloat(balanceObj.amount || balanceObj.balance || '0');
            break;
          }
        }
      }

      console.log(`[OfframpService] Found ${token} balance: ${tokenBalance} on ${network}`);

      // Check if balance is sufficient
      if (tokenBalance < amount) {
        throw new Error(`Insufficient ${token} balance on ${network}. Required: ${amount}, Available: ${tokenBalance}`);
      }

      return {
        balance: tokenBalance,
        network: network,
        address: walletAddress
      };

    } catch (error) {
      console.error(`[OfframpService] Balance check failed on ${network}:`, error);
      throw error;
    }
  }

  /**
   * Create a Paycrest order using smart contract
   */
  private async createPaycrestOrder(request: OfframpRequest, returnAddress: string) {
    try {
      // First, fetch the current rate as required by Paycrest Sender API
      const rates = await this.getExchangeRates(request.token, request.amount, request.currency);
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
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/paycrest`
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

      // 2. Determine network based on token
      const tokenUpper = request.token.toUpperCase();
      let network: string;
      if (tokenUpper === 'CUSD') {
        network = 'celo';
      } else if (tokenUpper === 'USDT') {
        network = 'lisk';
      } else {
        network = 'base'; // Default to Base for USDC
      }

      // 3. Get user's wallet for the appropriate network
      const wallet = await getOrCreateCdpWallet(request.userId, network);

      // 4. Check wallet balance on the correct network
      await this.checkWalletBalance(request.userId, request.token, request.amount, network);

      // 5. Verify bank account
      await this.verifyBankAccount(
        request.bankDetails.accountNumber,
        request.bankDetails.bankCode,
        request.currency
      );

      // 6. Get exchange rate
      const rates = await this.getExchangeRates(request.token, request.amount, request.currency);
      const fiatAmount = rates[request.currency.toUpperCase()];
      if (!fiatAmount || fiatAmount <= 0) {
        throw new Error('Unable to get exchange rate');
      }

      // 7. Create Paycrest order (but don't execute transfer yet)
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
          paycrest_order_id: order.id,
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
    orderId: string;
    receiveAddress: string;
    amount: string;
    token: string;
  }): Promise<{ transactionHash: string; orderId: string }> {
    try {
      // Determine network based on token
      const tokenUpper = params.token.toUpperCase();
      let network: string;
      let decimals: number;
      
      if (tokenUpper === 'CUSD') {
        network = 'celo';
        decimals = 18; // cUSD has 18 decimals
      } else if (tokenUpper === 'USDT') {
        network = 'lisk';
        decimals = 6; // USDT typically has 6 decimals
      } else {
        network = 'base'; // Default to Base for USDC
        decimals = 6; // USDC has 6 decimals
      }

      // Get user's wallet for the appropriate network
      const wallet = await getOrCreateCdpWallet(params.userId, network);

      // Execute token transfer using CDP
      const tokenAddress = this.getTokenAddress(params.token, network);
      const transferResult = await transferToken(
        wallet.address,
        params.receiveAddress,
        tokenAddress,
        params.amount,
        decimals,
        network
      );

      const txHash = transferResult.hash;

      // Update the transaction in database with the transaction hash
      const { error: updateError } = await supabase
        .from('offramp_transactions')
        .update({ 
          tx_hash: txHash,
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('order_id', params.orderId);

      if (updateError) {
        console.error('[OfframpService] Error updating transaction with tx hash:', updateError);
      }

      return {
        transactionHash: txHash,
        orderId: params.orderId
      };
    } catch (error) {
      this.handleOfframpError(error, 'execute_transfer');
    }
  }

  async monitorOrderStatus(orderId: string): Promise<void> {
    try {
      // Use the serverPaycrestService to monitor order status
      await serverPaycrestService.monitorOrderStatus(orderId);
    } catch (error) {
      console.error('[OfframpService] Error monitoring order status:', error);
      throw error;
    }
  }

  async processOfframp(orderId: string, txHash: string): Promise<any> {
    try {
      // 1. Find the transaction by orderId
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .select('id')
        .eq('paycrest_order_id', orderId)
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
         'USDT': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
         'cNGN': '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F'
      },
      'ethereum': {
         'USDC': '0xA0b86a33E6441b8C4505E2c52C6b6046d5b0b6e6',
         'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      },
      'polygon': {
         'USDC': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
         'USDT': '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
         'cNGN': '0x52828daa48C1a9A06F37500882b42daf0bE04C3B'
      },
      'bsc': {
          'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          'USDT': '0x55d398326f99059fF775485246999027B3197955',
          'BNB': 'native',
          'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
          'cNGN': '0xa8AEA66B361a8d53e8865c62D142167Af28Af058'
        },
      'arbitrum-one': {
         'USDC': '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
         'USDT': '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
         'ETH': 'native',
         'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
      },
      'celo': {
         'USDC': '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', // Native USDC on Celo mainnet
         'CUSD': '0x765DE816845861e75A25fCA122bb6898B8B1282a', // cUSD on Celo mainnet
         'USDT': '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
         'CELO': '0x471EcE3750Da237f93B8E339c536989b8978a438',
         'cNGN': '0x52828daa48C1a9A06F37500882b42daf0bE04C3B'
      },
      'lisk': {
         'USDT': '0x05D032ac25d322df992303dCa074EE7392C117b9', // Bridged USDT on Lisk mainnet
         'USDC': '0x3e7eF8f50246f725885102E8238CBba33F276747', // Bridged USDC on Lisk mainnet
         'ETH': 'native',
         'LSK': '0xac485391EB2d7D88253a7F1eF18C37f4242D1A24'
      },
      'solana': {
         'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
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
      if (transaction.status === 'processing' && transaction.paycrest_order_id) {
        const updatedStatus = await this.checkOrderStatus(transaction.paycrest_order_id);
        
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
        orderId: transaction.paycrest_order_id,
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
        orderId: tx.paycrest_order_id,
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
          paycrest_order_id: null,
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
        } else if (currency.toUpperCase() === 'GHS') {
      console.log('[OfframpService] Returning GHS fallback banks');
          return [
            { name: "Ghana Commercial Bank", code: "030100", country: "Ghana" },
            { name: "Ecobank Ghana", code: "130100", country: "Ghana" },
            { name: "Standard Chartered Bank Ghana", code: "020100", country: "Ghana" },
            { name: "Absa Bank Ghana", code: "030200", country: "Ghana" },
            { name: "Zenith Bank Ghana", code: "120100", country: "Ghana" },
            { name: "Stanbic Bank Ghana", code: "190100", country: "Ghana" },
            { name: "Fidelity Bank Ghana", code: "240100", country: "Ghana" },
            { name: "Access Bank Ghana", code: "280100", country: "Ghana" }
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
          country: institution.country || (currency === 'NGN' ? 'Nigeria' : 'Ghana')
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
      } else if (currency.toUpperCase() === 'GHS') {
        return [
          { name: "Ghana Commercial Bank", code: "030100", country: "Ghana" },
          { name: "Ecobank Ghana", code: "130100", country: "Ghana" },
          { name: "Standard Chartered Bank Ghana", code: "020100", country: "Ghana" },
          { name: "Absa Bank Ghana", code: "030200", country: "Ghana" },
          { name: "Zenith Bank Ghana", code: "120100", country: "Ghana" },
          { name: "Stanbic Bank Ghana", code: "190100", country: "Ghana" },
          { name: "Fidelity Bank Ghana", code: "240100", country: "Ghana" },
          { name: "Access Bank Ghana", code: "280100", country: "Ghana" }
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
        .eq('paycrest_order_id', orderId);

      console.log(`[OfframpService] Transaction ${orderId} status updated to ${status}`);
    } catch (error) {
      console.error('[OfframpService] Error updating transaction status from event:', error);
    }
  }

  /**
   * Get the appropriate network for a given token
   */
  private getNetworkForToken(token: string): string {
    const tokenUpper = token.toUpperCase();
    if (tokenUpper === 'CUSD') {
      return 'celo';
    } else if (tokenUpper === 'USDT') {
      return 'lisk'; // Primary network for USDT
    } else if (tokenUpper === 'USDC') {
      return 'base'; // Primary network for USDC, but checkWalletBalance will check all networks
    } else {
      return 'base'; // Default fallback
    }
  }

  /**
   * Process offramp request for Telegram bot users using server-managed wallets
   */
  async processTelegramOfframp(request: OfframpRequest): Promise<{
    orderId: string;
    receiveAddress: string;
    expectedAmount: string;
    status: string;
  }> {
    try {
      console.log('[OfframpService] Processing Telegram offramp request:', request);
      
      // Validate request
      this.validateOfframpRequest(request);
      
      // Convert to server offramp request format
      const serverRequest = {
        userId: request.userId,
        amount: request.amount,
        currency: request.currency,
        token: request.token || 'USDC',
        bankDetails: {
          accountNumber: request.bankDetails.accountNumber,
          bankCode: request.bankDetails.bankCode,
          accountName: request.bankDetails.accountName,
          bankName: request.bankDetails.bankName
        },
        network: this.getNetworkForToken(request.token || 'USDC')
      };
      
      // Use server wallet service to create the order
      const result = await serverPaycrestService.createOfframpOrder(serverRequest);
      
      console.log('[OfframpService] Telegram offramp result:', result);
      
      // Return the format expected by the callback flow
      return {
        orderId: result.orderId,
        receiveAddress: result.receiveAddress,
        expectedAmount: (result.amount || request.amount).toString(),
        status: result.status
      };
    } catch (error) {
      console.error('[OfframpService] Error processing Telegram offramp:', error);
      throw error;
    }
  }

  // Removed getPaycrestGatewayContract method - using CDP SDK for all blockchain operations
}

export const offrampService = new OfframpService();