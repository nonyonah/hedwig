// src/lib/baseAccount.ts
import { createBaseAccountSDK } from '@base-org/account';

export interface BaseAccountConfig {
  appName: string;
  testnet?: boolean;
}

export interface PaymentParams {
  amount: string;
  to: string;
  testnet?: boolean;
}

export interface PaymentResult {
  id: string;
  status: 'pending' | 'success' | 'failed';
  hash?: string;
}

export interface PaymentStatus {
  id: string;
  status: 'pending' | 'success' | 'failed';
  hash?: string;
  amount?: string;
  to?: string;
}

export class BaseAccountService {
  private sdk: any;
  private provider: any;
  private config: BaseAccountConfig;

  constructor(config: BaseAccountConfig) {
    this.config = config;
    this.sdk = createBaseAccountSDK({
      appName: config.appName,
    });
    this.provider = this.sdk.getProvider();
  }

  /**
   * Initialize connection to Base Account
   */
  async connect(): Promise<string[]> {
    try {
      const addresses = await this.provider.request({
        method: 'eth_requestAccounts',
      });
      return addresses;
    } catch (error) {
      console.error('Failed to connect to Base Account:', error);
      throw error;
    }
  }

  /**
   * Get the current connected accounts
   */
  async getAccounts(): Promise<string[]> {
    try {
      return await this.provider.request({
        method: 'eth_accounts',
      });
    } catch (error) {
      console.error('Failed to get accounts:', error);
      throw error;
    }
  }

  /**
   * Get the current chain ID
   */
  async getChainId(): Promise<string> {
    try {
      return await this.provider.request({
        method: 'eth_chainId',
      });
    } catch (error) {
      console.error('Failed to get chain ID:', error);
      throw error;
    }
  }

  /**
   * Sign a message with Base Account
   */
  async signMessage(message: string, address: string): Promise<string> {
    try {
      const hexMessage = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
      return await this.provider.request({
        method: 'personal_sign',
        params: [hexMessage, address],
      });
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw error;
    }
  }

  /**
   * Make a USDC payment using Base Account
   */
  async pay(params: PaymentParams): Promise<PaymentResult> {
    try {
      // Use the global Base Account payment function
      const result = await (window as any).base.pay({
        amount: params.amount,
        to: params.to,
        testnet: params.testnet || this.config.testnet || false,
      });

      return {
        id: result.id,
        status: 'pending',
        hash: result.hash,
      };
    } catch (error) {
      console.error('Payment failed:', error);
      throw error;
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const status = await (window as any).base.getPaymentStatus({
        id: paymentId,
        testnet: this.config.testnet || false,
      });

      return {
        id: paymentId,
        status: status.status,
        hash: status.hash,
        amount: status.amount,
        to: status.to,
      };
    } catch (error) {
      console.error('Failed to get payment status:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for provider events
   */
  setupEventListeners(callbacks: {
    onConnect?: (info: any) => void;
    onDisconnect?: (error: any) => void;
    onAccountsChanged?: (accounts: string[]) => void;
    onChainChanged?: (chainId: string) => void;
    onMessage?: (message: any) => void;
  }) {
    if (callbacks.onConnect) {
      this.provider.on('connect', callbacks.onConnect);
    }
    if (callbacks.onDisconnect) {
      this.provider.on('disconnect', callbacks.onDisconnect);
    }
    if (callbacks.onAccountsChanged) {
      this.provider.on('accountsChanged', callbacks.onAccountsChanged);
    }
    if (callbacks.onChainChanged) {
      this.provider.on('chainChanged', callbacks.onChainChanged);
    }
    if (callbacks.onMessage) {
      this.provider.on('message', callbacks.onMessage);
    }
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    this.provider.removeAllListeners();
  }

  /**
   * Get the provider instance for direct use
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get the SDK instance for direct use
   */
  getSDK() {
    return this.sdk;
  }
}

// Create a singleton instance
let baseAccountService: BaseAccountService | null = null;

export function createBaseAccountService(config: BaseAccountConfig): BaseAccountService {
  if (!baseAccountService) {
    baseAccountService = new BaseAccountService(config);
  }
  return baseAccountService;
}

export function getBaseAccountService(): BaseAccountService | null {
  return baseAccountService;
}