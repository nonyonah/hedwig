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
  // Main payment function
  "function pay(uint256 amount, address freelancer, string calldata invoiceId) external",
  
  // Admin functions
  "function setPlatformWallet(address _wallet) external",
  "function setPlatformFee(uint256 _feeInBasisPoints) external",
  "function whitelistToken(address _token, bool _status) external",
  "function batchWhitelistTokens(address[] calldata _tokens, bool[] calldata _statuses) external",

  // View functions
  "function platformFee() public view returns (uint256)",

  // Events
  "event PaymentReceived(address indexed payer, address indexed freelancer, uint256 amount, uint256 fee, string invoiceId)",
];

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
   * Admin Functions
   */

  async setPlatformWallet(walletAddress: string): Promise<string> {
    if (!this.signer) throw new Error('Admin signer required');
    const tx = await this.contract.setPlatformWallet(walletAddress);
    await tx.wait();
    return tx.hash;
  }

  async setPlatformFee(feeInBasisPoints: number): Promise<string> {
    if (!this.signer) throw new Error('Admin signer required');
    const tx = await this.contract.setPlatformFee(feeInBasisPoints);
    await tx.wait();
    return tx.hash;
  }

  async whitelistToken(tokenAddress: string, status: boolean): Promise<string> {
    if (!this.signer) throw new Error('Admin signer required');
    const tx = await this.contract.whitelistToken(tokenAddress, status);
    await tx.wait();
    return tx.hash;
  }

  async batchWhitelistTokens(tokens: { address: string; status: boolean }[]): Promise<string[]> {
    if (!this.signer) throw new Error('Admin signer required');
    
    const addresses = tokens.map(t => t.address);
    const statuses = tokens.map(t => t.status);
    
    const tx = await this.contract.batchWhitelistTokens(addresses, statuses);
    await tx.wait();
    
    // This is a single transaction, so we return a single hash in an array
    // to align with the expected return type of the calling API.
    return [tx.hash];
  }

  async getPlatformFee(): Promise<number> {
    const feeInBasisPoints = await this.contract.platformFee();
    return Number(feeInBasisPoints);
  }
}