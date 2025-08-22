import { ethers } from 'ethers';
import { 
  HedwigPaymentContract, 
  PaymentReceivedEvent, 
  PaymentRequest, 
  PaymentResponse,
  BASE_CHAIN_CONFIG 
} from './types';

// Contract ABI (simplified for key functions)
export const HEDWIG_PAYMENT_ABI = [
  {
    "type": "function",
    "name": "pay",
    "inputs": [
      { "type": "uint256", "name": "amount" },
      { "type": "address", "name": "freelancer" },
      { "type": "string", "name": "invoiceId" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "OWNER",
    "inputs": [],
    "outputs": [{ "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATFORM_FEE",
    "inputs": [],
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATFORM_WALLET",
    "inputs": [],
    "outputs": [{ "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC",
    "inputs": [],
    "outputs": [{ "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "version",
    "inputs": [],
    "outputs": [{ "type": "string" }],
    "stateMutability": "pure"
  },
  {
    "type": "event",
    "name": "PaymentReceived",
    "inputs": [
      { "type": "address", "name": "payer", "indexed": true },
      { "type": "address", "name": "freelancer", "indexed": true },
      { "type": "uint256", "name": "amount", "indexed": false },
      { "type": "uint256", "name": "fee", "indexed": false },
      { "type": "string", "name": "invoiceId", "indexed": false }
    ]
  }
] as const;

export class HedwigPaymentService {
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private signer?: ethers.Signer;
  
  constructor(
    contractAddress: string,
    rpcUrl: string = BASE_CHAIN_CONFIG.rpcUrl,
    privateKey?: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, HEDWIG_PAYMENT_ABI, this.provider);
    
    if (privateKey) {
      this.signer = new ethers.Wallet(privateKey, this.provider);
      this.contract = this.contract.connect(this.signer) as ethers.Contract;
    }
  }
  
  /**
   * Process a payment through the contract
   */
  async processPayment(paymentRequest: PaymentRequest): Promise<PaymentResponse> {
    try {
      if (!this.signer) {
        throw new Error('Signer required for payment processing');
      }
      
      const { amount, freelancer, invoiceId } = paymentRequest;
      
      // Execute payment
      const tx = await this.contract.pay(amount, freelancer, invoiceId);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash,
        paymentDetails: {
          amount: amount.toString(),
          freelancer,
          invoiceId
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Payment processing failed'
      };
    }
  }
  
  /**
   * Listen for payment events
   */
  async listenForPayments(callback: (event: PaymentReceivedEvent) => void): Promise<void> {
    this.contract.on('PaymentReceived', async (payer: string, freelancer: string, amount: bigint, fee: bigint, invoiceId: string, event: any) => {
      const block = await this.provider.getBlock(event.blockNumber);
      
      const paymentEvent: PaymentReceivedEvent = {
        payer,
        freelancer,
        amount: BigInt(amount.toString()),
        fee: BigInt(fee.toString()),
        invoiceId,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: block?.timestamp || 0
      };
      
      callback(paymentEvent);
    });
  }
  
  /**
   * Get payment events for a specific invoice
   */
  async getPaymentsByInvoice(invoiceId: string, fromBlock: number = 0): Promise<PaymentReceivedEvent[]> {
    const filter = this.contract.filters.PaymentReceived(null, null, null, null, invoiceId);
    const events = await this.contract.queryFilter(filter, fromBlock);
    
    const payments: PaymentReceivedEvent[] = [];
    
    for (const event of events) {
      const block = await this.provider.getBlock(event.blockNumber);
      const eventLog = event as ethers.EventLog;
      
      if (eventLog.args) {
        payments.push({
          payer: eventLog.args[0],
          freelancer: eventLog.args[1],
          amount: BigInt(eventLog.args[2].toString()),
          fee: BigInt(eventLog.args[3].toString()),
          invoiceId: eventLog.args[4],
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: block?.timestamp || 0
        });
      }
    }
    
    return payments;
  }
  
  /**
   * Get payment events for a specific freelancer
   */
  async getPaymentsByFreelancer(freelancerAddress: string, fromBlock: number = 0): Promise<PaymentReceivedEvent[]> {
    const filter = this.contract.filters.PaymentReceived(null, freelancerAddress);
    const events = await this.contract.queryFilter(filter, fromBlock);
    
    const payments: PaymentReceivedEvent[] = [];
    
    for (const event of events) {
      const block = await this.provider.getBlock(event.blockNumber);
      const eventLog = event as ethers.EventLog;
      
      if (eventLog.args) {
        payments.push({
          payer: eventLog.args[0],
          freelancer: eventLog.args[1],
          amount: BigInt(eventLog.args[2].toString()),
          fee: BigInt(eventLog.args[3].toString()),
          invoiceId: eventLog.args[4],
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: block?.timestamp || 0
        });
      }
    }
    
    return payments;
  }

  /**
   * Get platform fee from contract
   */
  async getPlatformFee(): Promise<number> {
    const feeInBasisPoints = await this.contract.PLATFORM_FEE();
    return Number(feeInBasisPoints);
  }

  /**
   * Get platform wallet address from contract
   */
  async getPlatformWallet(): Promise<string> {
    return await this.contract.PLATFORM_WALLET();
  }

  /**
   * Get USDC contract address from contract
   */
  async getUSDCAddress(): Promise<string> {
    return await this.contract.USDC();
  }

  /**
   * Get contract owner address
   */
  async getOwner(): Promise<string> {
    return await this.contract.OWNER();
  }

  /**
   * Get contract version
   */
  async getVersion(): Promise<string> {
    return await this.contract.version();
  }
}