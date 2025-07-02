// CDP TRANSACTION HANDLER - Supports EVM chains via Coinbase Developer Platform

import crypto from 'crypto';
import { formatAddress } from './utils';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * MultiChainTransactionHandler
 * Handles transactions on EVM chains via Coinbase Developer Platform
 */
export class MultiChainTransactionHandler {
  private baseUrl: string;
  private apiKey: string;
  private walletSecret: string;

  constructor() {
    this.baseUrl = process.env.CDP_API_URL || 'https://api.cdp.coinbase.com';
    this.apiKey = process.env.CDP_API_KEY || '';
    this.walletSecret = process.env.CDP_WALLET_SECRET || '';
    
    if (!this.apiKey || !this.walletSecret) {
      console.warn('[MultiChainHandler] CDP_API_KEY or CDP_WALLET_SECRET not configured');
    }
  }
  
  /**
   * Send a transaction on any supported EVM chain
   * @param walletId The wallet ID from CDP
   * @param transactionData The transaction data
   * @param options Options including chain
   * @returns Transaction result
   */
  async sendTransaction(
    walletId: string,
    transactionData: any,
    options: {
      chain?: string,
      method?: string
    } = {}
  ) {
    try {
      // Get wallet address from walletId using Supabase
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('cdp_wallet_id', walletId)
        .single();
      
      if (error || !wallet) {
        console.error(`[MultiChainHandler] Error fetching wallet:`, error);
        throw new Error(`Wallet not found for CDP wallet ID ${walletId}`);
      }
      
      const walletAddress = wallet.address;
      console.log(`[MultiChainHandler] Using wallet address: ${walletAddress}`);
      
      // Determine network from options or wallet
      const network = this.formatNetworkName(options.chain || wallet.chain || 'base');
      
      // Format the transaction data for CDP
      const formattedTxData = this.formatTransactionData(transactionData, walletAddress);
      
      console.log(`[MultiChainHandler] Sending transaction on ${network} network:`, 
        JSON.stringify(formattedTxData, null, 2));
      
      // Send transaction via CDP API
      const response = await this.sendCDPTransaction(walletAddress, formattedTxData, network);
      
      return this.processTransactionResponse(response, network);
    } catch (error) {
      console.error('[MultiChainHandler] Error sending transaction:', error);
      throw error;
    }
  }
  
  /**
   * Format transaction data for CDP API
   */
  private formatTransactionData(transactionData: any, walletAddress: string): any {
    // If it's already a properly formatted transaction, return as is
    if (transactionData.to && transactionData.value !== undefined) {
      return {
        to: transactionData.to,
        value: transactionData.value,
        data: transactionData.data || '0x',
      };
    }
    
    // Otherwise, format based on simple parameters
    const recipient = transactionData.recipient || transactionData.to;
    let value = transactionData.value || transactionData.amount;
    
    // Convert to hex if it's not already
    if (typeof value === 'number' || (typeof value === 'string' && !value.startsWith('0x'))) {
      // Parse as ETH amount (convert to wei)
      const amountValue = typeof value === 'number' ? value : parseFloat(value);
      const amountInWei = Math.floor(amountValue * 1e18); // Convert ETH to wei
      value = '0x' + amountInWei.toString(16);
    }
    
    return {
      to: recipient,
      value,
      data: transactionData.data || '0x',
    };
  }
  
  /**
   * Send a transaction via CDP API
   */
  private async sendCDPTransaction(
    walletAddress: string,
    transactionData: any,
    network: string
  ) {
    if (!this.apiKey || !this.walletSecret) {
      throw new Error('CDP_API_KEY or CDP_WALLET_SECRET not configured');
    }
    
    // Generate wallet authorization token
    const walletToken = this.generateWalletAuthToken(walletAddress);
    
    // Set up the API request
    const response = await fetch(
      `${this.baseUrl}/platform/v2/evm/accounts/${walletAddress}/send/transaction`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Wallet-Auth': walletToken,
        },
        body: JSON.stringify({
          network,
          transaction: transactionData
        }),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MultiChainHandler] CDP API error: ${response.status} ${errorText}`);
      throw new Error(`CDP API error: ${errorText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Process the transaction response
   */
  private processTransactionResponse(response: any, network: string) {
    const hash = response.transactionHash;
    const explorerUrl = this.getExplorerUrl(network, hash);
    
    return {
      hash,
      explorerUrl,
      response
    };
  }
  
  /**
   * Generate wallet authorization JWT token for CDP API
   */
  private generateWalletAuthToken(address: string): string {
    // The payload structure as required by CDP
    const payload = {
      sub: address.toLowerCase(), // Subject is the wallet address (lowercase)
      exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes expiration
      iat: Math.floor(Date.now() / 1000), // Issued at current time
      scope: 'write:transactions',  // Scope for sending transactions
    };
    
    // Convert payload to base64url encoding (JWT format)
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
      
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Create the signature
    const signature = crypto
      .createHmac('sha256', this.walletSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Return the complete JWT
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }
  
  /**
   * Format network name for CDP API
   */
  private formatNetworkName(chain: string): string {
    // Map our internal chain names to CDP network names
    switch (chain.toLowerCase()) {
      case 'base':
        return 'base-sepolia'; // Using testnet by default
      case 'ethereum':
      case 'evm':
        return 'ethereum-sepolia';
      default:
        // If it already has a proper format like base-sepolia, return as is
        if (chain.includes('-')) return chain;
        return `${chain}-sepolia`; // Default to testnet version
    }
  }
  
  /**
   * Get explorer URL for a transaction
   */
  private getExplorerUrl(network: string, txHash: string): string {
    if (!txHash) return '';
    
    switch (network) {
      case 'base-sepolia':
        return `https://sepolia.basescan.org/tx/${txHash}`;
      case 'base-mainnet':
        return `https://basescan.org/tx/${txHash}`;
      case 'ethereum-sepolia':
        return `https://sepolia.etherscan.io/tx/${txHash}`;
      case 'ethereum-mainnet':
        return `https://etherscan.io/tx/${txHash}`;
      default:
        if (network.includes('base')) {
          return `https://sepolia.basescan.org/tx/${txHash}`;
        }
        return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
  }
} 