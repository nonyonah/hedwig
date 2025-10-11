import { ethers } from 'ethers';
import { PaymentRequest, PaymentResponse, PaymentReceivedEvent } from './types';

/**
 * TypeScript service class for interacting with the HedwigPayment smart contract
 */
export class HedwigPaymentService {
  private contract: ethers.Contract;
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private isListening: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  // Contract ABI for the HedwigPayment contract
  private static readonly ABI = [
    {
      "inputs": [
        { "internalType": "address", "name": "token", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "internalType": "address", "name": "freelancer", "type": "address" },
        { "internalType": "string", "name": "invoiceId", "type": "string" }
      ],
      "name": "pay",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "platformWallet",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "platformFee",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "USDC",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "version",
      "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "_amount", "type": "uint256" }],
      "name": "calculateFee",
      "outputs": [
        { "internalType": "uint256", "name": "fee", "type": "uint256" },
        { "internalType": "uint256", "name": "freelancerPayout", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "_token", "type": "address" }],
      "name": "isTokenWhitelisted",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "payer", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "freelancer", "type": "address" },
        { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "fee", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "freelancerPayout", "type": "uint256" },
        { "indexed": false, "internalType": "string", "name": "invoiceId", "type": "string" },
        { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "name": "PaymentReceived",
      "type": "event"
    }
  ];

  constructor(
    contractAddress: string,
    rpcUrl: string,
    privateKey?: string
  ) {
    // Use WebSocket provider if available, fallback to HTTP
    if (rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')) {
      this.provider = new ethers.WebSocketProvider(rpcUrl);
    } else {
      // Convert HTTP to WebSocket if possible for better event handling
      const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      try {
        this.provider = new ethers.WebSocketProvider(wsUrl);
      } catch {
        // Fallback to HTTP provider
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
      }
    }
    
    if (privateKey) {
      this.signer = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddress, HedwigPaymentService.ABI, this.signer);
    } else {
      this.contract = new ethers.Contract(contractAddress, HedwigPaymentService.ABI, this.provider);
    }

    // Set up provider error handling
    this.setupProviderErrorHandling();
  }

  /**
   * Set up provider error handling for filter-related errors
   */
  private setupProviderErrorHandling(): void {
    if (this.provider instanceof ethers.WebSocketProvider) {
      this.provider.on('error', (error: any) => {
        console.debug('WebSocket provider error:', error.message);
        if (error.message?.includes('filter not found') || 
            error.message?.includes('eth_getFilterChanges') ||
            error.code === -32600) {
          console.debug('Filter error detected, will attempt reconnection');
        }
      });

      // Note: ethers.js WebSocketProvider doesn't support 'close' event
      // Instead, we'll handle disconnections through error events and periodic health checks
    }
  }

  /**
   * Attempt to reconnect the WebSocket provider
   */
  private async attemptReconnection(): Promise<void> {
    try {
      this.reconnectAttempts++;
      console.debug(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      // Reset the provider connection
      if (this.provider instanceof ethers.WebSocketProvider) {
        await this.provider.destroy();
      }
      
      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.debug('Reconnection successful');
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Reconnection failed:', error);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.attemptReconnection();
        }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
      }
    }
  }

  /**
   * Process a payment through the smart contract
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      if (!this.signer) {
        throw new Error('Signer required for payment processing');
      }

      const tx = await this.contract.pay(
        request.token,
        request.amount,
        request.freelancer,
        request.invoiceId
      );

      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: receipt.hash,
        paymentDetails: {
          amount: request.amount.toString(),
          freelancer: request.freelancer,
          invoiceId: request.invoiceId
        }
      };
    } catch (error) {
      console.error('Payment processing failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get the platform fee in basis points
   */
  async getPlatformFee(): Promise<number> {
    const fee = await this.contract.platformFee();
    return Number(fee);
  }

  /**
   * Get the platform wallet address
   */
  async getPlatformWallet(): Promise<string> {
    return await this.contract.platformWallet();
  }

  /**
   * Get the USDC token address
   */
  async getUSDCAddress(): Promise<string> {
    return await this.contract.USDC();
  }

  /**
   * Get the contract version
   */
  async getVersion(): Promise<string> {
    return await this.contract.version();
  }

  /**
   * Calculate fee and freelancer payout for a given amount
   */
  async calculateFee(amount: bigint): Promise<{ fee: bigint; freelancerPayout: bigint }> {
    const result = await this.contract.calculateFee(amount);
    return {
      fee: result[0],
      freelancerPayout: result[1]
    };
  }

  /**
   * Check if a token is whitelisted
   */
  async isTokenWhitelisted(tokenAddress: string): Promise<boolean> {
    return await this.contract.isTokenWhitelisted(tokenAddress);
  }

  /**
   * Listen for payment events with error handling
   */
  async listenForPayments(callback: (event: PaymentReceivedEvent) => void): Promise<void> {
    this.isListening = true;
    this.reconnectAttempts = 0;

    const setupListener = () => {
      try {
        // Remove any existing listeners first
        this.contract.removeAllListeners('PaymentReceived');

        this.contract.on('PaymentReceived', (
          payer: string,
          freelancer: string,
          token: string,
          amount: bigint,
          fee: bigint,
          freelancerPayout: bigint,
          invoiceId: string,
          timestamp: bigint,
          event: any
        ) => {
          try {
            const paymentEvent: PaymentReceivedEvent = {
              payer,
              freelancer,
              token,
              amount,
              fee,
              invoiceId,
              transactionHash: event.transactionHash,
              blockNumber: event.blockNumber,
              timestamp: Number(timestamp)
            };
            
            callback(paymentEvent);
          } catch (error) {
            console.error('Error processing payment event:', error);
            this.handleEventError(error, callback);
          }
        });

        // Set up error handler for the contract
        this.contract.on('error', (error: any) => {
          console.debug('Contract event error:', error.message);
          this.handleEventError(error, callback);
        });

        console.debug('Payment event listener set up successfully');
      } catch (error) {
        console.error('Error setting up payment listener:', error);
        this.handleEventError(error, callback);
      }
    };

    setupListener();
  }

  /**
   * Handle event-related errors with intelligent recovery
   */
  private handleEventError(error: any, callback: (event: PaymentReceivedEvent) => void): void {
    const errorMessage = error?.message || error?.toString() || '';
    
    if (errorMessage.includes('filter not found') || 
        errorMessage.includes('eth_getFilterChanges') ||
        errorMessage.includes('eth_getFilterLogs') ||
        error?.code === -32600) {
      
      console.debug('Filter error detected, attempting graceful recovery');
      
      // Don't restart immediately if we're already attempting reconnection
      if (this.reconnectAttempts === 0) {
        setTimeout(() => {
          this.restartEventListener(callback);
        }, 2000); // Wait 2 seconds before restarting
      }
    } else {
      console.error('Non-filter related event error:', error);
    }
  }

  /**
   * Restart event listener after filter expiration
   */
  private async restartEventListener(callback: (event: PaymentReceivedEvent) => void): Promise<void> {
    if (!this.isListening) {
      console.debug('Event listener is not active, skipping restart');
      return;
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached, stopping event listener');
      this.isListening = false;
      return;
    }

    console.debug(`Restarting event listener (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    try {
      // Remove existing listeners
      this.contract.removeAllListeners('PaymentReceived');
      this.contract.removeAllListeners('error');
      
      // Wait before restarting with exponential backoff
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Restart the listener
      await this.listenForPayments(callback);
      
      // Reset reconnect attempts on successful restart
      this.reconnectAttempts = 0;
      console.debug('Event listener restarted successfully');
      
    } catch (error) {
      console.error('Failed to restart event listener:', error);
      
      // Try again after a delay
      setTimeout(() => {
        this.restartEventListener(callback);
      }, this.reconnectDelay);
    }
  }

  /**
   * Get past payment events
   */
  async getPaymentEvents(
    fromBlock: number = 0,
    toBlock: number | string = 'latest'
  ): Promise<PaymentReceivedEvent[]> {
    const filter = this.contract.filters.PaymentReceived();
    const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
    
    return events.map(event => {
      // Type guard to ensure event is EventLog with args
      if (!('args' in event) || !event.args) {
        throw new Error('Invalid event format: missing args');
      }
      const args = event.args;
      return {
        payer: args[0],
        freelancer: args[1],
        token: args[2],
        amount: args[3],
        fee: args[4],
        invoiceId: args[6],
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: Number(args[7])
      };
    });
  }

  /**
   * Get payment events for a specific invoice
   */
  async getPaymentEventsByInvoice(invoiceId: string): Promise<PaymentReceivedEvent[]> {
    const allEvents = await this.getPaymentEvents();
    return allEvents.filter(event => event.invoiceId === invoiceId);
  }

  /**
   * Get payment events for a specific freelancer
   */
  async getPaymentEventsByFreelancer(freelancerAddress: string): Promise<PaymentReceivedEvent[]> {
    const allEvents = await this.getPaymentEvents();
    return allEvents.filter(event => event.freelancer.toLowerCase() === freelancerAddress.toLowerCase());
  }

  /**
   * Stop listening for payment events
   */
  stopListening(): void {
    console.debug('Stopping payment event listener');
    this.isListening = false;
    this.reconnectAttempts = 0;
    
    // Remove all event listeners
    this.contract.removeAllListeners('PaymentReceived');
    this.contract.removeAllListeners('error');
    
    // If using WebSocket provider, close the connection
    if (this.provider && 'destroy' in this.provider) {
      try {
        (this.provider as any).destroy();
      } catch (error) {
        console.debug('Error closing provider connection:', error);
      }
    }
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contract.target as string;
  }
}