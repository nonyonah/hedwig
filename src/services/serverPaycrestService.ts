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

// Paycrest Gateway contract addresses
const PAYCREST_GATEWAY_ADDRESSES = {
  base: '0x123...', // Replace with actual Paycrest Gateway address on Base
  ethereum: '0x456...', // Replace with actual address if needed
};

// USDC contract addresses
const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86a33E6441E6C8C07C0b8C8C3C8C8C8C8C8C8' // Replace with actual USDC address
};

// Paycrest API configuration
const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY!;

export interface ServerOfframpRequest {
  userId: string; // Telegram user ID or database user ID
  amount: number;
  currency: string; // 'NGN', 'KES', etc.
  bankDetails: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  };
  network?: string; // 'base', 'ethereum', etc.
}

export interface ServerOfframpResult {
  orderId: string;
  transactionHash: string;
  receiveAddress: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
      const balances = await getBalances(wallet.address, this.network);
      
      const usdcBalance = balances.find(b => 
        b.asset.symbol === 'USDC' || 
        b.asset.contractAddress?.toLowerCase() === USDC_ADDRESSES[this.network as keyof typeof USDC_ADDRESSES]?.toLowerCase()
      );

      const balance = usdcBalance ? usdcBalance.amount : '0';
      
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
  async getExchangeRate(amount: number, currency: string): Promise<number> {
    try {
      const response = await fetch(`${PAYCREST_API_BASE_URL}/rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': PAYCREST_API_KEY
        },
        body: JSON.stringify({
          amount,
          from: 'USDC',
          to: currency,
          network: this.network
        })
      });

      if (!response.ok) {
        throw new Error(`Rate fetch failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.rate || 1;
    } catch (error) {
      console.error('[ServerPaycrest] Error getting exchange rate:', error);
      throw new Error('Failed to get exchange rate');
    }
  }

  /**
   * Verify bank account using Paycrest API
   */
  async verifyBankAccount(accountNumber: string, bankCode: string): Promise<boolean> {
    try {
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

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      console.error('[ServerPaycrest] Error verifying bank account:', error);
      return false;
    }
  }

  /**
   * Approve USDC tokens for Paycrest Gateway using CDP
   */
  async approveTokens(userId: string, amount: number): Promise<string> {
    try {
      const wallet = await this.getUserWallet(userId);
      const usdcAddress = USDC_ADDRESSES[this.network as keyof typeof USDC_ADDRESSES];
      const gatewayAddress = PAYCREST_GATEWAY_ADDRESSES[this.network as keyof typeof PAYCREST_GATEWAY_ADDRESSES];
      
      if (!usdcAddress || !gatewayAddress) {
        throw new Error(`Unsupported network: ${this.network}`);
      }

      // Convert amount to proper decimals (USDC has 6 decimals)
      const amountInWei = (amount * 1e6).toString();
      
      console.log(`[ServerPaycrest] Approving ${amount} USDC (${amountInWei} units) for gateway ${gatewayAddress}`);
      
      // Use CDP's sendTransaction method to call the approve function
      const evmClient = cdp.evm;
      
      // Encode the approve function call
      const approveData = this.encodeApproveFunction(gatewayAddress, amountInWei);
      
      const tx = await evmClient.sendTransaction({
        address: wallet.address as `0x${string}`,
        network: this.network as any,
        transaction: {
          to: usdcAddress as `0x${string}`,
          data: approveData,
          value: BigInt(0),
        },
      });
      
      console.log(`[ServerPaycrest] Token approval transaction: ${tx.transactionHash}`);
      return tx.transactionHash;
    } catch (error) {
      console.error('[ServerPaycrest] Error approving tokens:', error);
      throw new Error('Failed to approve tokens');
    }
  }

  /**
   * Encode the ERC20 approve function call
   */
  private encodeApproveFunction(spender: string, amount: string): string {
    // ERC20 approve function signature: approve(address,uint256)
    const functionSignature = '0x095ea7b3'; // keccak256('approve(address,uint256)').slice(0, 4)
    
    // Pad spender address to 32 bytes (remove 0x prefix, pad to 64 chars, add back 0x)
    const paddedSpender = spender.slice(2).padStart(64, '0');
    
    // Convert amount to hex and pad to 32 bytes
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    
    return functionSignature + paddedSpender + paddedAmount;
  }

  /**
   * Create order via Paycrest Gateway smart contract
   */
  private async createContractOrder(request: ServerOfframpRequest): Promise<string> {
    try {
      const wallet = await this.getUserWallet(request.userId);
      const usdcAddress = USDC_ADDRESSES[this.network as keyof typeof USDC_ADDRESSES];
      const gatewayAddress = PAYCREST_GATEWAY_ADDRESSES[this.network as keyof typeof PAYCREST_GATEWAY_ADDRESSES];
      
      if (!usdcAddress || !gatewayAddress) {
        throw new Error(`Unsupported network: ${this.network}`);
      }

      // Convert amount to proper decimals (USDC has 6 decimals)
      const amountInWei = (request.amount * 1e6).toString();
      
      // Encode the createOrder function call
      const createOrderData = this.encodeCreateOrderFunction(
        usdcAddress,
        amountInWei,
        wallet.address, // refund address
        request.bankDetails.bankCode, // institution code
        request.bankDetails.accountNumber,
        request.bankDetails.accountName
      );
      
      console.log(`[ServerPaycrest] Creating order via contract for ${request.amount} USDC`);
      
      // Use CDP's sendTransaction method to call the createOrder function
      const evmClient = cdp.evm;
      
      const tx = await evmClient.sendTransaction({
        address: wallet.address as `0x${string}`,
        network: this.network as any,
        transaction: {
          to: gatewayAddress as `0x${string}`,
          data: createOrderData,
          value: BigInt(0),
        },
      });
      
      console.log(`[ServerPaycrest] Contract order transaction: ${tx.transactionHash}`);
      return tx.transactionHash;
    } catch (error) {
      console.error('[ServerPaycrest] Error creating contract order:', error);
      throw new Error('Failed to create contract order');
    }
  }

  /**
   * Encode the Paycrest Gateway createOrder function call
   */
  private encodeCreateOrderFunction(
    token: string,
    amount: string,
    refundAddress: string,
    institutionCode: string,
    accountNumber: string,
    recipientName: string
  ): string {
    // createOrder function signature: createOrder(address,uint256,address,bytes32,string,string)
      // keccak256('createOrder(address,uint256,address,bytes32,string,string)').slice(0, 4)
      const functionSignature = '0x8c379a00'; // Calculated function signature
    
    // Encode parameters according to ABI
    let encoded = functionSignature;
    
    // address _token (32 bytes)
    encoded += token.slice(2).padStart(64, '0');
    
    // uint256 _amount (32 bytes)
    encoded += BigInt(amount).toString(16).padStart(64, '0');
    
    // address _refundAddress (32 bytes)
    encoded += refundAddress.slice(2).padStart(64, '0');
    
    // bytes32 _institutionCode (32 bytes)
    const institutionBytes = Buffer.from(institutionCode, 'utf8');
    encoded += institutionBytes.toString('hex').padEnd(64, '0');
    
    // Dynamic data offset for strings (account number and recipient name)
    const stringDataOffset = 6 * 32; // 6 parameters * 32 bytes each
    encoded += stringDataOffset.toString(16).padStart(64, '0'); // offset for accountNumber
    encoded += (stringDataOffset + 64 + Math.ceil(accountNumber.length / 32) * 32).toString(16).padStart(64, '0'); // offset for recipientName
    
    // string _accountNumber
    encoded += accountNumber.length.toString(16).padStart(64, '0'); // length
    const accountNumberHex = Buffer.from(accountNumber, 'utf8').toString('hex');
    encoded += accountNumberHex.padEnd(Math.ceil(accountNumber.length / 32) * 64, '0');
    
    // string _recipientName
    encoded += recipientName.length.toString(16).padStart(64, '0'); // length
    const recipientNameHex = Buffer.from(recipientName, 'utf8').toString('hex');
    encoded += recipientNameHex.padEnd(Math.ceil(recipientName.length / 32) * 64, '0');
    
    return encoded;
  }

  /**
   * Create offramp order using server wallet
   */
  async createOfframpOrder(request: ServerOfframpRequest): Promise<ServerOfframpResult> {
    try {
      console.log('[ServerPaycrest] Creating offramp order:', request);
      
      // Get user wallet
      const wallet = await this.getUserWallet(request.userId);
      
      // Verify bank account
      const isValidAccount = await this.verifyBankAccount(
        request.bankDetails.accountNumber,
        request.bankDetails.bankCode
      );
      
      if (!isValidAccount) {
        throw new Error('Invalid bank account details');
      }
      
      // Get exchange rate
      const rate = await this.getExchangeRate(request.amount, request.currency);
      
      // Check balance
      const balanceInfo = await this.checkUserBalance(request.userId);
      if (parseFloat(balanceInfo.balance) < request.amount) {
        throw new Error('Insufficient USDC balance');
      }
      
      // Approve tokens for Paycrest Gateway
      const approvalTx = await this.approveTokens(request.userId, request.amount);
      console.log('[ServerPaycrest] Token approval completed:', approvalTx);
      
      // Create order via Paycrest Gateway smart contract
      const contractOrderTx = await this.createContractOrder(request);
      console.log('[ServerPaycrest] Contract order created:', contractOrderTx);
      
      // Store transaction in database
      const { data: transaction, error: dbError } = await supabase
        .from('offramp_transactions')
        .insert({
          user_id: request.userId,
          amount: request.amount,
          token: 'USDC',
          fiat_amount: rate,
          fiat_currency: request.currency,
          bank_details: request.bankDetails,
          status: 'processing',
          tx_hash: contractOrderTx,
          approval_tx_hash: approvalTx,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (dbError) {
        console.error('[ServerPaycrest] Database error:', dbError);
        throw new Error('Failed to store transaction record');
      }
      
      const orderData = { id: transaction.id, receiveAddress: PAYCREST_GATEWAY_ADDRESSES[this.network as keyof typeof PAYCREST_GATEWAY_ADDRESSES] };
      
      // Note: Token transfer is handled by the smart contract internally
      // No separate transfer needed as the createOrder function handles it
      
      return {
        orderId: orderData.id,
        transactionHash: contractOrderTx,
        receiveAddress: orderData.receiveAddress,
        status: 'pending'
      };
    } catch (error) {
      console.error('[ServerPaycrest] Error creating offramp order:', error);
      throw new Error(`Failed to create offramp order: ${error.message}`);
    }
  }

  /**
   * Get order status from Paycrest API
   */
  async getOrderStatus(orderId: string): Promise<{ status: string; transactionHash?: string }> {
    try {
      const response = await fetch(`${PAYCREST_API_BASE_URL}/orders/${orderId}`, {
        headers: {
          'API-Key': PAYCREST_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get order status: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        status: data.status,
        transactionHash: data.transactionHash
      };
    } catch (error) {
      console.error('[ServerPaycrest] Error getting order status:', error);
      throw new Error('Failed to get order status');
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