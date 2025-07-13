import { PrivyClient } from '@privy-io/server-auth';
import { loadServerEnvironment } from './serverEnv';
import { createClient } from '@supabase/supabase-js';

// Ensure environment variables are loaded
loadServerEnvironment();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

/**
 * Ethereum transaction parameters
 */
export interface EthereumTransaction {
  to: string;
  value?: string | number; // Wei amount as string or number
  data?: string; // Hex string
  chainId?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/**
 * Transaction result from Privy
 */
export interface TransactionResult {
  hash: string;
  caip2: string;
  transactionId?: string;
}

/**
 * Message signing result
 */
export interface SignMessageResult {
  signature: string;
  encoding: string;
}

/**
 * Typed data signing result
 */
export interface SignTypedDataResult {
  signature: string;
  encoding: string;
}

/**
 * Raw hash signing result
 */
export interface SignRawHashResult {
  signature: string;
  encoding: string;
}

/**
 * EIP-7702 authorization signing result
 */
export interface Sign7702AuthorizationResult {
  signature: string;
  encoding: string;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: number;
  caip2: string;
  name: string;
  explorerUrl: string;
}

/**
 * Supported chains configuration
 */
const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  'ethereum': {
    chainId: 1,
    caip2: 'eip155:1',
    name: 'Ethereum Mainnet',
    explorerUrl: 'https://etherscan.io'
  },
  'base': {
    chainId: 8453,
    caip2: 'eip155:8453',
    name: 'Base',
    explorerUrl: 'https://basescan.org'
  },
  'base-sepolia': {
    chainId: 84532,
    caip2: 'eip155:84532',
    name: 'Base Sepolia',
    explorerUrl: 'https://sepolia.basescan.org'
  },
  'sepolia': {
    chainId: 11155111,
    caip2: 'eip155:11155111',
    name: 'Sepolia',
    explorerUrl: 'https://sepolia.etherscan.io'
  },
  'optimism': {
    chainId: 10,
    caip2: 'eip155:10',
    name: 'Optimism',
    explorerUrl: 'https://optimistic.etherscan.io'
  },
  'arbitrum': {
    chainId: 42161,
    caip2: 'eip155:42161',
    name: 'Arbitrum One',
    explorerUrl: 'https://arbiscan.io'
  }
};

/**
 * Privy Wallet API class for handling all wallet operations
 */
export class PrivyWalletApi {
  private client: PrivyClient;

  constructor() {
    this.client = privyClient;
  }

  /**
   * Send an Ethereum transaction
   * @param walletId - The Privy wallet ID
   * @param transaction - Transaction parameters
   * @param chain - Chain identifier (default: 'base-sepolia')
   * @returns Transaction result with hash and chain info
   */
  async sendTransaction(
    walletId: string,
    transaction: EthereumTransaction,
    chain: string = 'base-sepolia'
  ): Promise<TransactionResult> {
    try {
      const chainConfig = SUPPORTED_CHAINS[chain];
      if (!chainConfig) {
        throw new Error(`Unsupported chain: ${chain}`);
      }

      console.log(`[PrivyWalletApi] Sending transaction on ${chainConfig.name}:`, {
        walletId,
        to: transaction.to,
        value: transaction.value,
        chainId: chainConfig.chainId
      });

      const result = await this.client.walletApi.ethereum.sendTransaction({
        walletId,
        caip2: chainConfig.caip2 as `eip155:${string}`,
        transaction: {
          to: transaction.to as `0x${string}`,
          value: transaction.value?.toString() as `0x${string}` | undefined,
          data: transaction.data as `0x${string}` | undefined,
          chainId: transaction.chainId || chainConfig.chainId,
          gasLimit: transaction.gasLimit as `0x${string}` | undefined,
          gasPrice: transaction.gasPrice as `0x${string}` | undefined,
          maxFeePerGas: transaction.maxFeePerGas as `0x${string}` | undefined,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas as `0x${string}` | undefined
        }
      });

      console.log(`[PrivyWalletApi] Transaction sent successfully:`, result);

      // Record transaction in database
      await this.recordTransaction(walletId, result, chainConfig, transaction);

      return result;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to send transaction:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Sign a transaction without sending it
   * @param walletId - The Privy wallet ID
   * @param transaction - Transaction parameters
   * @param chain - Chain identifier (default: 'base-sepolia')
   * @returns Signed transaction data
   */
  async signTransaction(
    walletId: string,
    transaction: EthereumTransaction,
    chain: string = 'base-sepolia'
  ): Promise<{ signedTransaction: string; encoding: string }> {
    try {
      const chainConfig = SUPPORTED_CHAINS[chain];
      if (!chainConfig) {
        throw new Error(`Unsupported chain: ${chain}`);
      }

      console.log(`[PrivyWalletApi] Signing transaction on ${chainConfig.name}:`, {
        walletId,
        to: transaction.to,
        chainId: chainConfig.chainId
      });

      const result = await this.client.walletApi.ethereum.signTransaction({
        walletId,
        transaction: {
          to: transaction.to as `0x${string}`,
          value: transaction.value?.toString() as `0x${string}` | undefined,
          data: transaction.data as `0x${string}` | undefined,
          chainId: transaction.chainId || chainConfig.chainId,
          gasLimit: transaction.gasLimit as `0x${string}` | undefined,
          gasPrice: transaction.gasPrice as `0x${string}` | undefined,
          maxFeePerGas: transaction.maxFeePerGas as `0x${string}` | undefined,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas as `0x${string}` | undefined
        }
      });

      console.log(`[PrivyWalletApi] Transaction signed successfully`);
      return result;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to sign transaction:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Sign a message
   * @param walletId - The Privy wallet ID
   * @param message - Message to sign (string or hex)
   * @returns Signature and encoding
   */
  async signMessage(
    walletId: string,
    message: string
  ): Promise<SignMessageResult> {
    try {
      console.log(`[PrivyWalletApi] Signing message:`, { walletId, message });

      const result = await this.client.walletApi.ethereum.signMessage({
        walletId,
        message
      });

      console.log(`[PrivyWalletApi] Message signed successfully`);
      return result;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to sign message:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Sign typed data (EIP-712)
   * @param walletId - The Privy wallet ID
   * @param typedData - EIP-712 typed data object
   * @returns Signature and encoding
   */
  async signTypedData(
    walletId: string,
    typedData: any
  ): Promise<SignTypedDataResult> {
    try {
      console.log(`[PrivyWalletApi] Signing typed data:`, { walletId, typedData });

      const result = await this.client.walletApi.ethereum.signTypedData({
        walletId,
        typedData
      });

      console.log(`[PrivyWalletApi] Typed data signed successfully`);
      return result;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to sign typed data:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Sign a raw hash
   * @param walletId - The Privy wallet ID
   * @param hash - Raw hash to sign (32-byte hex string)
   * @returns Signature and encoding
   */
  async signRawHash(
    walletId: string,
    hash: string
  ): Promise<SignRawHashResult> {
    try {
      console.log(`[PrivyWalletApi] Signing raw hash:`, { walletId, hash });

      const result = await this.client.walletApi.ethereum.signMessage({
        walletId,
        message: hash
      });

      console.log(`[PrivyWalletApi] Raw hash signed successfully`);
      return result;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to sign raw hash:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Sign EIP-7702 authorization
   * @param walletId - The Privy wallet ID
   * @param authorization - EIP-7702 authorization object
   * @returns Signature and encoding
   */
  async sign7702Authorization(
    walletId: string,
    authorization: { chainId: number; address: string; nonce: number }
  ): Promise<Sign7702AuthorizationResult> {
    try {
      console.log(`[PrivyWalletApi] Signing EIP-7702 authorization:`, { walletId, authorization });

      const result = await this.client.walletApi.ethereum.sign7702Authorization({
        walletId,
        chainId: authorization.chainId,
        contract: authorization.address as `0x${string}`,
        nonce: authorization.nonce
      });

      console.log(`[PrivyWalletApi] EIP-7702 authorization signed successfully`);
      return {
        signature: (result as any).signature || '',
        encoding: (result as any).encoding || 'hex'
      };
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to sign EIP-7702 authorization:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get wallet information
   * @param walletId - The Privy wallet ID
   * @returns Wallet information
   */
  async getWallet(walletId: string) {
    try {
      console.log(`[PrivyWalletApi] Getting wallet info:`, { walletId });

      const wallet = await this.client.walletApi.getWallet({ id: walletId });

      console.log(`[PrivyWalletApi] Wallet info retrieved successfully`);
      return wallet;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to get wallet:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get user's wallet from database
   * @param userId - Supabase user ID
   * @param chain - Chain identifier (default: 'base-sepolia')
   * @returns Wallet data from database
   */
  async getUserWallet(userId: string, chain: string = 'base-sepolia') {
    try {
      console.log(`[PrivyWalletApi] Getting user wallet from database:`, { userId, chain });

      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('chain', chain)
        .maybeSingle();

      if (error) {
        console.error('[PrivyWalletApi] Database error:', error);
        throw new Error(`Failed to fetch wallet: ${error.message}`);
      }

      if (!wallet) {
        throw new Error(`No wallet found for user ${userId} on chain ${chain}`);
      }

      console.log(`[PrivyWalletApi] User wallet retrieved successfully`);
      return wallet;
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to get user wallet:', error);
      throw error;
    }
  }

  /**
   * Record transaction in database
   * @param walletId - Privy wallet ID
   * @param result - Transaction result from Privy
   * @param chainConfig - Chain configuration
   * @param transaction - Original transaction data
   */
  private async recordTransaction(
    walletId: string,
    result: TransactionResult,
    chainConfig: ChainConfig,
    transaction: EthereumTransaction
  ) {
    try {
      // Get wallet info to find user_id
      const { data: wallet } = await supabase
        .from('wallets')
        .select('user_id, address')
        .eq('wallet_id', walletId)
        .maybeSingle();

      if (!wallet) {
        console.warn('[PrivyWalletApi] Wallet not found in database for recording transaction');
        return;
      }

      const explorerUrl = `${chainConfig.explorerUrl}/tx/${result.hash}`;

      await supabase.from('transactions').insert({
        user_id: wallet.user_id,
        wallet_address: wallet.address,
        tx_hash: result.hash,
        explorer_url: explorerUrl,
        chain: chainConfig.name.toLowerCase().replace(' ', '-'),
        status: 'completed',
        metadata: {
          ...transaction,
          caip2: result.caip2,
          transactionId: result.transactionId,
          timestamp: new Date().toISOString()
        }
      });

      console.log(`[PrivyWalletApi] Transaction recorded in database: ${result.hash}`);
    } catch (error) {
      console.error('[PrivyWalletApi] Failed to record transaction:', error);
      // Don't throw here as the transaction was successful
    }
  }

  /**
   * Handle and format errors from Privy API
   * @param error - Original error
   * @returns Formatted error with user-friendly message
   */
  private handleError(error: any): Error {
    const errorMessage = error?.message || String(error);
    
    // Privy-specific error handling
    if (errorMessage.includes('KeyQuorum user session key is expired')) {
      return new Error('Your wallet session has expired. Please refresh the page and try again.');
    }
    
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
      return new Error('Authentication failed. Please log out and log back in.');
    }
    
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return new Error('Too many requests. Please wait a moment and try again.');
    }
    
    if (errorMessage.includes('500') || errorMessage.includes('internal server error')) {
      return new Error('The wallet service is experiencing issues. Please try again later.');
    }

    // Chain-specific error handling
    if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient balance')) {
      return new Error('Not enough funds to complete this transaction. Please add more funds to your wallet.');
    }
    
    if (errorMessage.includes('gas') && (errorMessage.includes('required') || errorMessage.includes('fee'))) {
      return new Error('Not enough funds to cover the gas fee. Please add more funds to your wallet.');
    }
    
    if (errorMessage.includes('nonce')) {
      return new Error('There was an issue with the transaction sequence. Please try again.');
    }
    
    if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
      return new Error('Transaction was rejected. Please try again.');
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return new Error('The transaction is taking too long. Please try again later.');
    }

    // Return original error if no specific handling
    return new Error(`Transaction failed: ${errorMessage}`);
  }

  /**
   * Get chain configuration by name
   * @param chain - Chain identifier
   * @returns Chain configuration
   */
  getChainConfig(chain: string): ChainConfig {
    const config = SUPPORTED_CHAINS[chain];
    if (!config) {
      throw new Error(`Unsupported chain: ${chain}`);
    }
    return config;
  }

  /**
   * Get explorer URL for a transaction
   * @param chain - Chain identifier
   * @param txHash - Transaction hash
   * @returns Explorer URL
   */
  getExplorerUrl(chain: string, txHash: string): string {
    const config = this.getChainConfig(chain);
    return `${config.explorerUrl}/tx/${txHash}`;
  }
}

// Export singleton instance
export const privyWalletApi = new PrivyWalletApi();

// Export utility functions
export { SUPPORTED_CHAINS };