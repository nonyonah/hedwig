import { ethers } from 'ethers';
import { PaymentRequest, PaymentResponse, PaymentReceivedEvent } from './types';

/**
 * TypeScript service class for interacting with the HedwigPayment smart contract
 */
export class HedwigPaymentService {
  private contract: ethers.Contract;
  private provider: ethers.Provider;
  private signer?: ethers.Signer;

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
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    if (privateKey) {
      this.signer = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddress, HedwigPaymentService.ABI, this.signer);
    } else {
      this.contract = new ethers.Contract(contractAddress, HedwigPaymentService.ABI, this.provider);
    }
  }

  /**
   * Process a payment through the contract
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
   * Listen for payment events
   */
  async listenForPayments(callback: (event: PaymentReceivedEvent) => void): Promise<void> {
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
      const paymentEvent: PaymentReceivedEvent = {
        payer,
        freelancer,
        amount,
        fee,
        invoiceId,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: Number(timestamp)
      };
      
      callback(paymentEvent);
    });
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
   * Stop listening for events
   */
  stopListening(): void {
    this.contract.removeAllListeners('PaymentReceived');
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contract.target as string;
  }
}