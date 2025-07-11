import { getPrivyServerAuthHeader } from './privy';
import fetch from 'node-fetch';

export class PrivyTransactionHandler {
  private privyApiUrl: string;

  constructor() {
    this.privyApiUrl = process.env.PRIVY_API_URL || 'https://api.privy.io/v1/wallets';
  }

  /**
   * Send an Ethereum transaction using Privy REST API
   * @param walletId The Privy wallet ID
   * @param transactionData The transaction data (to, value, data, etc.)
   * @param options Options including chainId (default: Base Sepolia)
   * @returns Transaction result (hash, explorerUrl)
   */
  async sendTransaction(
    walletId: string,
    transactionData: {
      to: string;
      value: string; // hex string
      data?: string;
      chainId?: string; // hex string
      gasLimit?: string;
      gasPrice?: string;
      from?: string;
    },
    options: {
      chainId?: string;
    } = {}
  ) {
    const caip2 = 'eip155:84532'; // Base Sepolia CAIP2 (84532)
    const chainId = options.chainId || '0x14a6c'; // 84532 in hex
    const url = `${this.privyApiUrl}/${walletId}/rpc`;
    const body = {
      method: 'eth_sendTransaction',
      caip2,
      params: {
        transaction: {
          ...transactionData,
          chainId,
        },
      },
    };
    const headers = {
      'Authorization': getPrivyServerAuthHeader(),
      'Content-Type': 'application/json',
      'privy-app-id': process.env.PRIVY_APP_ID!,
    };
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PrivyTransactionHandler] Privy API error:', errorText);
      throw new Error(`Privy API error: ${errorText}`);
    }
    const result = await response.json();
    const hash = result.data?.hash || result.data;
    return {
      hash,
      explorerUrl: `https://sepolia.basescan.org/tx/${hash}`,
      response: result,
    };
  }
} 