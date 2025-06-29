import { getPrivyAuthHeader } from './privy';
import { Connection, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

/**
 * MultiChainTransactionHandler
 * Handles transactions across multiple blockchains (Ethereum and Solana)
 */
export class MultiChainTransactionHandler {
  private privyApiUrl = 'https://api.privy.io/v1/wallets';
  
  /**
   * Send a transaction on any supported chain
   * @param walletId The Privy wallet ID
   * @param transactionData The transaction data
   * @param options Options including chain
   * @returns Transaction result
   */
  async sendTransaction(
    walletId: string, 
    transactionData: any, 
    options: { 
      chain?: 'ethereum' | 'solana' | string,
      method?: string
    } = {}
  ) {
    // Auto-detect chain if not provided
    const chain = options.chain || this.detectChain(transactionData);
    
    console.log(`[MultiChainHandler] Sending ${chain} transaction`);
    
    if (chain.toLowerCase().includes('sol')) {
      return this.sendSolanaTransaction(walletId, transactionData, options.method);
    } else {
      return this.sendEthereumTransaction(walletId, transactionData, options.method);
    }
  }
  
  /**
   * Detect which chain to use based on transaction data
   * @param transactionData The transaction data
   * @returns The detected chain
   */
  private detectChain(transactionData: any): string {
    // Check for Solana-specific fields
    if (
      transactionData.recentBlockhash || 
      transactionData.feePayer || 
      transactionData.instructions ||
      transactionData.encoding === 'base64'
    ) {
      return 'solana';
    }
    
    // Check for Ethereum-specific fields
    if (
      transactionData.to && 
      (transactionData.value !== undefined || 
       transactionData.data !== undefined ||
       transactionData.gasPrice !== undefined)
    ) {
      return 'ethereum';
    }
    
    // Default to Ethereum if can't determine
    return 'ethereum';
  }
  
  /**
   * Send an Ethereum transaction
   * @param walletId The Privy wallet ID
   * @param transactionData The Ethereum transaction data
   * @param method The RPC method to use
   * @returns Transaction result
   */
  async sendEthereumTransaction(
    walletId: string, 
    transactionData: any, 
    method: string = 'eth_sendTransaction'
  ) {
    const rpcUrl = `${this.privyApiUrl}/${walletId}/rpc`;
    
    // Ensure we have the required fields
    if (!transactionData.to) {
      throw new Error('Ethereum transaction requires a "to" address');
    }
    
    // Format transaction data properly
    let value = transactionData.value;
    if (typeof value === 'number') {
      // Convert to hex if it's a number
      value = '0x' + Math.floor(value * 1e18).toString(16);
      transactionData.value = value;
    }
    
    const body = JSON.stringify({
      method,
      caip2: 'eip155:84532', // Base Sepolia chain ID
      chain_type: 'ethereum',
      params: {
        transaction: {
          to: transactionData.to,
          value: transactionData.value,
          from: transactionData.from,
          data: transactionData.data,
          gas: transactionData.gas,
          gasPrice: transactionData.gasPrice
        }
      }
    });
    
    console.log('[MultiChainHandler] Ethereum transaction payload:', body);
    
    const response = await this.sendPrivyRequest(rpcUrl, body);
    return this.processEthereumResponse(response);
  }
  
  /**
   * Send a Solana transaction
   * @param walletId The Privy wallet ID
   * @param transactionData The Solana transaction data
   * @param method The RPC method to use
   * @returns Transaction result
   */
  async sendSolanaTransaction(
    walletId: string, 
    transactionData: any, 
    method: string = 'signAndSendTransaction'
  ) {
    const rpcUrl = `${this.privyApiUrl}/${walletId}/rpc`;
    const solanaRpcUrl = 'https://api.devnet.solana.com';
    
    // If we have a simple transfer
    if (transactionData.recipient && transactionData.amount) {
      // Build a real Solana transaction
      const connection = new Connection(solanaRpcUrl, 'confirmed');
      const fromPubkey = new PublicKey(transactionData.senderAddress);
      const toPubkey = new PublicKey(transactionData.recipient);
      // Always use integer for lamports
      const lamports = Math.round(Number(transactionData.amount) * 1e9);
      
      // Fetch recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports
        })
      );
      transaction.recentBlockhash = blockhash;
      // Do NOT set feePayer or sign the transaction
      // Serialize the unsigned transaction
      const serializedTx = transaction.serialize({ requireAllSignatures: false });
      const base64Tx = Buffer.from(serializedTx).toString('base64');
      
      const body = JSON.stringify({
        method,
        params: {
          transaction: base64Tx,
          encoding: "base64"
        },
        caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' // Solana Devnet
      });
      
      console.log('[MultiChainHandler] Solana transaction payload:', body);
      
      const response = await this.sendPrivyRequest(rpcUrl, body);
      return this.processSolanaResponse(response);
    } 
    // If we already have an encoded transaction
    else if (transactionData.transaction) {
      const body = JSON.stringify({
        method,
        params: {
          transaction: transactionData.transaction,
          encoding: transactionData.encoding || "base64"
        },
        caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' // Solana Devnet
      });
      
      console.log('[MultiChainHandler] Solana transaction payload:', body);
      
      const response = await this.sendPrivyRequest(rpcUrl, body);
      return this.processSolanaResponse(response);
    } 
    else {
      throw new Error('Invalid Solana transaction data format');
    }
  }
  
  /**
   * Sign a message (works for both chains)
   * @param walletId The Privy wallet ID
   * @param message The message to sign
   * @param chain The chain to use
   * @returns Signed message
   */
  async signMessage(
    walletId: string, 
    message: string, 
    chain: 'ethereum' | 'solana' = 'ethereum'
  ) {
    const rpcUrl = `${this.privyApiUrl}/${walletId}/rpc`;
    
    const method = chain === 'solana' ? 'signMessage' : 'eth_sign';
    
    const body = JSON.stringify({
      method,
      params: chain === 'solana' 
        ? { message: Buffer.from(message).toString('base64'), encoding: 'base64' }
        : [walletId, message]
    });
    
    console.log(`[MultiChainHandler] ${chain} sign message payload:`, body);
    
    const response = await this.sendPrivyRequest(rpcUrl, body);
    return chain === 'solana' 
      ? this.processSolanaResponse(response) 
      : this.processEthereumResponse(response);
  }
  
  /**
   * Send a request to the Privy API
   * @param url The API URL
   * @param body The request body
   * @returns The response
   */
  private async sendPrivyRequest(url: string, body: string) {
    const headers = {
      'Authorization': getPrivyAuthHeader(),
      'Content-Type': 'application/json',
      'privy-app-id': process.env.PRIVY_APP_ID!
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MultiChainHandler] Privy API error:', errorText);
      throw new Error(`Privy API error: ${errorText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Process an Ethereum transaction response
   * @param response The response from Privy
   * @returns Processed response
   */
  private processEthereumResponse(response: any) {
    const hash = response.data?.hash || response.data?.transaction_hash || response.data;
    
    return {
      hash,
      explorerUrl: `https://sepolia.basescan.org/tx/${hash}`
    };
  }
  
  /**
   * Process a Solana transaction response
   * @param response The response from Privy
   * @returns Processed response
   */
  private processSolanaResponse(response: any) {
    const signature = response.data?.signature || response.data?.transaction_signature || response.data;
    
    return {
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    };
  }
}

/**
 * WhatsAppMessageCleaner
 * Utility to clean and format WhatsApp messages
 */
export class WhatsAppMessageCleaner {
  /**
   * Create an error template for WhatsApp
   * @param to Recipient phone number
   * @param error The error object
   * @param templateName The template name to use
   * @returns WhatsApp template message
   */
  static createErrorTemplate(to: string, error: any, templateName: string = 'send_failed') {
    // Extract error message
    const errorMessage = error.message || 'Unknown error';
    
    // Clean the error message for WhatsApp
    const cleanErrorMessage = this.sanitizeWhatsAppParam(errorMessage);
    
    // Return a basic template structure
    return {
      to,
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: cleanErrorMessage }
            ]
          }
        ]
      }
    };
  }
  
  /**
   * Sanitize a parameter for WhatsApp
   * @param text Text to sanitize
   * @returns Sanitized text
   */
  static sanitizeWhatsAppParam(text: string): string {
    if (text === undefined || text === null) {
      return '';
    }
    
    // Convert to string and trim
    let sanitized = String(text).trim();
    
    // Replace problematic characters
    sanitized = sanitized
      .replace(/[\n\r\t]/g, ' ')     // Replace newlines and tabs with spaces
      .replace(/ {4,}/g, '   ')      // Replace 4+ consecutive spaces with 3 (WhatsApp limit)
      .replace(/\s+/g, ' ')          // Replace multiple spaces with a single space
      .trim();                       // Final trim
    
    return sanitized;
  }
} 