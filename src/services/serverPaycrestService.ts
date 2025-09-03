import { createClient } from '@supabase/supabase-js';
import { getOrCreateCdpWallet, transferToken } from '../lib/cdp';
import { CdpClient } from '@coinbase/cdp-sdk';
import { loadServerEnvironment } from '../lib/serverEnv';

// Load environment variables
loadServerEnvironment();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize CDP client
const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET
});

// USDC contract addresses
const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86a33E6441E6C8C07C0b8C8C3C8C8C8C8C8C8' // Replace with actual USDC address
};

// Paycrest Sender API configuration
const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY!;

// Supported networks and tokens
const SUPPORTED_NETWORKS = {
  base: 'base',
  ethereum: 'ethereum'
};

const SUPPORTED_TOKENS = {
  USDC: 'USDC',
  USDT: 'USDT'
};

export interface ServerOfframpRequest {
  userId: string; // Telegram user ID or database user ID
  amount: number;
  currency: string; // 'NGN', 'KES', etc.
  bankDetails: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
    bankName: string;
  };
  network?: string; // 'base', 'ethereum', etc.
  token?: string; // 'USDC', 'USDT', etc.
}

export interface ServerOfframpResult {
  orderId: string;
  transactionHash?: string;
  receiveAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  expectedAmount: number;
}

// Paycrest Sender API interfaces
export interface PaycrestRateResponse {
  data: {
    rate: number;
    fee: number;
    total: number;
  };
}

export interface PaycrestOrderRequest {
  amount: number;
  token: string;
  rate: number;
  network: string;
  recipient: {
    institution: string;
    accountIdentifier: string;
    accountName: string;
    memo: string;
    currency: string;
  };
  reference: string;
  returnAddress: string;
}

export interface PaycrestOrderResponse {
  data: {
    id: string;
    receiveAddress: string;
    amount: number;
    expectedAmount: number;
    status: string;
    expiresAt: string;
  };
}

export interface PaycrestOrderStatusResponse {
  data: {
    id: string;
    status: string;
    transactionHash?: string;
    amount: number;
    expectedAmount: number;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * Server-side Paycrest service for telegram bot integration
 * Uses CDP-managed wallets instead of client-side wallet connections
 */
export class ServerPaycrestService {
  private network: string;
  
  constructor(network: string = 'base') {
    this.network = network;
  }

  /**
   * Get user's wallet address from database
   */
  private async getUserWallet(userId: string): Promise<{ address: string; cdpWalletId: string }> {
    try {
      // First try to get existing wallet
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('address, cdp_wallet_id')
        .eq('user_id', userId)
        .eq('chain', 'evm') // Use EVM chain for Base network
        .single();

      if (error || !wallet) {
        // Create wallet if it doesn't exist
        console.log(`[ServerPaycrest] Creating wallet for user ${userId}`);
        const newWallet = await getOrCreateCdpWallet(userId, 'evm');
        return {
          address: newWallet.address,
          cdpWalletId: newWallet.cdp_wallet_id
        };
      }

      return {
        address: wallet.address,
        cdpWalletId: wallet.cdp_wallet_id
      };
    } catch (error) {
      console.error('[ServerPaycrest] Error getting user wallet:', error);
      throw new Error('Failed to get user wallet');
    }
  }

  /**
   * Check USDC balance for user
   */
  async checkUserBalance(userId: string): Promise<{ balance: string; hasEnough: boolean; required: number }> {
    try {
      const wallet = await this.getUserWallet(userId);
      
      // Use CDP to get balance
      const { getBalances } = await import('../lib/cdp');
      const balancesResult = await getBalances(wallet.address, this.network);
      
      // Extract the data array from the result
      const balances = balancesResult.data || balancesResult;
      console.log('[ServerPaycrest] Balances result:', balancesResult);
      console.log('[ServerPaycrest] Extracted balances:', balances);
      
      const usdcBalance = balances.find(b => 
        b.asset.symbol === 'USDC' || 
        b.asset.contractAddress?.toLowerCase() === USDC_ADDRESSES[this.network as keyof typeof USDC_ADDRESSES]?.toLowerCase()
      );

      let balance = '0';
      if (usdcBalance) {
        // Convert hex balance to decimal and account for USDC decimals (6)
        const rawBalance = usdcBalance.amount;
        console.log('[ServerPaycrest] Raw USDC balance:', rawBalance);
        
        if (rawBalance.startsWith('0x')) {
          // Convert hex to decimal
          const balanceWei = BigInt(rawBalance);
          const decimals = usdcBalance.asset.decimals || 6;
          const divisor = BigInt(10 ** decimals);
          const balanceDecimal = Number(balanceWei) / Number(divisor);
          balance = balanceDecimal.toString();
          console.log('[ServerPaycrest] Converted USDC balance:', balance);
        } else {
          // Already in decimal format
          balance = rawBalance;
        }
      }
      
      return {
        balance,
        hasEnough: parseFloat(balance) > 0,
        required: 0 // Will be set based on specific order amount
      };
    } catch (error) {
      console.error('[ServerPaycrest] Error checking balance:', error);
      throw new Error('Failed to check user balance');
    }
  }

  /**
   * Get exchange rate from Paycrest API
   */
  async getExchangeRate(amount: number, currency: string, token: string = 'USDC', network: string = 'base', bankCode?: string): Promise<PaycrestRateResponse> {
    try {
      // Use default provider by not specifying provider parameter
      const url = `${PAYCREST_API_BASE_URL}/rates/${token.toUpperCase()}/${amount}/${currency.toUpperCase()}?network=${network}`;
      
      console.log('[ServerPaycrest] Fetching rate from:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'API-Key': PAYCREST_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 400) {
          const errorData = await response.json();
          throw new Error(`Rate validation failed: ${errorData.message}`);
        } else if (response.status === 404) {
          throw new Error('No provider available for this token/amount/currency combination');
        } else {
          throw new Error(`Rate fetch failed: ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      console.log('[ServerPaycrest] Rate response:', data);
      
      // Handle the rate response format - data should contain the rate directly
      const rate = parseFloat(data.data);
      return {
        data: {
          rate: rate,
          fee: 0,
          total: rate * amount
        }
      };
    } catch (error) {
      console.error('[ServerPaycrest] Error getting exchange rate:', error);
      throw error;
    }
  }

  /**
   * Verify bank account using Paycrest API
   */
  async verifyBankAccount(accountNumber: string, bankCode: string): Promise<boolean> {
    try {
      console.log('[ServerPaycrest] Verifying bank account:', { accountNumber, bankCode });
      
      const response = await fetch(`${PAYCREST_API_BASE_URL}/verify-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': PAYCREST_API_KEY
        },
        body: JSON.stringify({
          accountNumber,
          bankCode
        })
      });

      console.log('[ServerPaycrest] Verify account response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ServerPaycrest] Verify account failed:', errorText);
        return false;
      }

      const data = await response.json();
      console.log('[ServerPaycrest] Verify account response data:', data);
      return data.valid === true;
    } catch (error) {
      console.error('[ServerPaycrest] Error verifying bank account:', error);
      return false;
    }
  }

  /**
   * Create order via Paycrest Sender API
   */
  private async createPaycrestOrder(request: ServerOfframpRequest): Promise<PaycrestOrderResponse> {
    try {
      // First, fetch the current exchange rate with provider information
      const rateResponse = await this.getExchangeRate(
        request.amount,
        request.currency,
        request.token || 'USDC',
        request.network || this.network,
        request.bankDetails.bankCode
      );

      const orderRequest = {
        amount: request.amount,
        token: request.token || 'USDC',
        rate: rateResponse.data.rate,
        network: request.network || this.network,
        recipient: {
           institution: request.bankDetails.bankCode,
           accountIdentifier: request.bankDetails.accountNumber,
           accountName: request.bankDetails.accountName,
           memo: `Hedwig offramp payment - ${request.amount} ${request.token || 'USDC'}`,
           currency: request.currency
         },
        reference: `hedwig-${Date.now()}`,
        returnAddress: '' // Will be set after getting user wallet
      };

      const response = await fetch(`${PAYCREST_API_BASE_URL}/sender/orders`, {
        method: 'POST',
        headers: {
          'API-Key': PAYCREST_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create order: ${response.statusText} - ${errorText}`);
      }

      const data: PaycrestOrderResponse = await response.json();
      return data;
    } catch (error) {
      console.error('[ServerPaycrest] Error creating Paycrest order:', error);
      throw new Error(`Failed to create Paycrest order: ${error.message}`);
    }
  }

  /**
   * Transfer tokens to Paycrest receive address
   */
  private async transferTokensToPaycrest(userId: string, receiveAddress: string, amount: number, token: string = 'USDC'): Promise<string> {
    try {
      const wallet = await this.getUserWallet(userId);
      const tokenAddress = USDC_ADDRESSES[this.network as keyof typeof USDC_ADDRESSES];
      
      if (!tokenAddress) {
        throw new Error(`Unsupported network: ${this.network}`);
      }

      // Get token decimals (USDC has 6 decimals)
      const decimals = token === 'USDC' ? 6 : 18;
      
      console.log(`[ServerPaycrest] Transferring ${amount} ${token} from ${wallet.address} to ${receiveAddress}`);
      
      // Transfer tokens to Paycrest receive address
      // Note: transferToken expects human-readable amount, it will handle the conversion internally
      const transferResult = await transferToken(
        wallet.address,
        receiveAddress,
        tokenAddress,
        amount.toString(),
        decimals,
        this.network
      );
      
      return transferResult.hash;
    } catch (error) {
      console.error('[ServerPaycrest] Error transferring tokens:', error);
      throw new Error(`Failed to transfer tokens: ${error.message}`);
    }
  }

  /**
   * Create offramp order using server wallet
   */
  async createOfframpOrder(request: ServerOfframpRequest): Promise<ServerOfframpResult> {
    try {
      console.log('[ServerPaycrest] Creating offramp order via Sender API:', request);
      
      // Get user wallet
      const wallet = await this.getUserWallet(request.userId);
      console.log(`[ServerPaycrest] User wallet: ${wallet.address} (CDP ID: ${wallet.cdpWalletId})`);
      
      // Verify bank account (temporarily disabled for testing)
      // const isValidAccount = await this.verifyBankAccount(
      //   request.bankDetails.accountNumber,
      //   request.bankDetails.bankCode
      // );
      
      // if (!isValidAccount) {
      //   throw new Error('Invalid bank account details');
      // }
      
      console.log('[ServerPaycrest] Skipping bank account verification for testing');
      
      // Get exchange rate from Paycrest
      const token = request.token || 'USDC';
      const network = request.network || this.network;
      const rateResponse = await this.getExchangeRate(request.amount, request.currency, token, network);
      
      console.log('[ServerPaycrest] Rate response:', rateResponse);
      
      // Check balance
      const balanceInfo = await this.checkUserBalance(request.userId);
      console.log(`[ServerPaycrest] Balance check: User balance = ${balanceInfo.balance} USDC, Required = ${request.amount} USDC`);
      
      if (parseFloat(balanceInfo.balance) < request.amount) {
        throw new Error(`Insufficient USDC balance. Available: ${balanceInfo.balance} USDC, Required: ${request.amount} USDC`);
      }
      
      console.log(`[ServerPaycrest] Balance check passed: ${balanceInfo.balance} >= ${request.amount}`);
      
      // Create order via Paycrest Sender API
      const orderResponse = await this.createPaycrestOrder(request);
      console.log('[ServerPaycrest] Paycrest order created:', orderResponse);
      
      // Transfer tokens to Paycrest receive address
      console.log(`[ServerPaycrest] Initiating token transfer to ${orderResponse.data.receiveAddress}`);
      let transferTx;
      try {
        transferTx = await this.transferTokensToPaycrest(
          request.userId,
          orderResponse.data.receiveAddress,
          request.amount,
          token
        );
        console.log('[ServerPaycrest] Tokens transferred successfully:', transferTx);
      } catch (transferError) {
        console.error('[ServerPaycrest] Token transfer failed:', transferError);
        throw new Error(`Token transfer failed: ${transferError.message}`);
      }
      
      // Store transaction in database
      console.log('[ServerPaycrest] Storing transaction in database');
      let transaction;
      try {
        const { data, error: dbError } = await supabase
          .from('offramp_transactions')
          .insert({
            user_id: request.userId,
            paycrest_order_id: orderResponse.data.id,
            amount: request.amount,
            token: token,
            fiat_amount: rateResponse.data.total,
            fiat_currency: request.currency,
            bank_details: request.bankDetails,
            status: 'pending',
            tx_hash: transferTx,
            receive_address: orderResponse.data.receiveAddress,
            expires_at: orderResponse.data.expiresAt,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (dbError) {
          console.error('[ServerPaycrest] Database error:', dbError);
          throw new Error(`Failed to store transaction record: ${dbError.message}`);
        }
        
        transaction = data;
        console.log('[ServerPaycrest] Transaction stored successfully:', transaction?.id);
      } catch (dbError) {
        console.error('[ServerPaycrest] Database operation failed:', dbError);
        throw new Error(`Database operation failed: ${dbError.message}`);
      }
      
      return {
        orderId: orderResponse.data.id,
        transactionHash: transferTx,
        receiveAddress: orderResponse.data.receiveAddress,
        status: 'pending',
        amount: orderResponse.data.amount,
        expectedAmount: orderResponse.data.expectedAmount
      };
    } catch (error) {
      console.error('[ServerPaycrest] Error creating offramp order:', error);
      throw new Error(`Failed to create offramp order: ${error.message}`);
    }
  }

  /**
   * Get order status from Paycrest Sender API
   */
  async getOrderStatus(orderId: string): Promise<PaycrestOrderStatusResponse> {
    try {
      const response = await fetch(`${PAYCREST_API_BASE_URL}/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get order status: ${response.statusText} - ${errorText}`);
      }
      
      const data: PaycrestOrderStatusResponse = await response.json();
      return data;
    } catch (error) {
      console.error('[ServerPaycrest] Error getting order status:', error);
      throw new Error(`Failed to get order status: ${error.message}`);
    }
  }

  /**
   * Monitor order status and update database
   */
  async monitorOrderStatus(orderId: string): Promise<void> {
    try {
      const statusResponse = await this.getOrderStatus(orderId);
      
      // Update database with latest status
      const { error } = await supabase
        .from('offramp_transactions')
        .update({
          status: statusResponse.data.status,
          updated_at: new Date().toISOString()
        })
        .eq('paycrest_order_id', orderId);
      
      if (error) {
        console.error('[ServerPaycrest] Error updating order status:', error);
      }
    } catch (error) {
      console.error('[ServerPaycrest] Error monitoring order status:', error);
    }
  }

  /**
   * List user's offramp transactions
   */
  async getUserTransactions(userId: string): Promise<any[]> {
    try {
      const { data: transactions, error } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('wallet_address', (await this.getUserWallet(userId)).address)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return transactions || [];
    } catch (error) {
      console.error('[ServerPaycrest] Error getting user transactions:', error);
      throw new Error('Failed to get user transactions');
    }
  }
}

export default ServerPaycrestService;