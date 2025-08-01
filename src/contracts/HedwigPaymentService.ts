import { ethers } from 'ethers';
import { 
  HedwigPaymentContract, 
  PaymentReceivedEvent, 
  PaymentRequest, 
  PaymentResponse,
  BASE_CHAIN_CONFIG 
} from './types';

// Contract ABI (simplified for key functions)
const HEDWIG_PAYMENT_ABI = [
  // Main payment function
  "function pay(address token, uint256 amount, address freelancer, string calldata invoiceId) external",
  
  // Admin functions
  "function setTokenWhitelist(address token, bool status) external",
  "function setPlatformFee(uint256 fee) external",
  "function setPlatformWallet(address newWallet) external",
  
  // View functions
  "function isTokenWhitelisted(address token) external view returns (bool)",
  "function calculateFee(uint256 amount) external view returns (uint256 fee, uint256 freelancerPayout)",
  "function platformFee() external view returns (uint256)",
  "function platformWallet() external view returns (address)",
  "function version() external pure returns (string memory)",
  
  // Events
  "event PaymentReceived(address indexed payer, address indexed freelancer, address indexed token, uint256 amount, uint256 fee, string invoiceId)",
  "event TokenWhitelisted(address indexed token, bool status)",
  "event PlatformFeeUpdated(uint256 oldFee, uint256 newFee)"
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
      
      const { token, amount, freelancer, invoiceId } = paymentRequest;
      
      // Validate token is whitelisted
      const isWhitelisted = await this.contract.isTokenWhitelisted(token);
      if (!isWhitelisted) {
        return {
          success: false,
          error: 'Token is not whitelisted'
        };
      }
      
      // Calculate fees
      const amountBigInt = BigInt(amount);
      const [fee, freelancerPayout] = await this.contract.calculateFee(amountBigInt);
      
      // Execute payment
      const tx = await this.contract.pay(token, amountBigInt, freelancer, invoiceId);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash,
        paymentDetails: {
          amount: amount,
          fee: fee.toString(),
          freelancerPayout: freelancerPayout.toString(),
          token,
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
    this.contract.on('PaymentReceived', async (payer: string, freelancer: string, token: string, amount: bigint, fee: bigint, invoiceId: string, event: any) => {
      const block = await this.provider.getBlock(event.blockNumber);
      
      const paymentEvent: PaymentReceivedEvent = {
        payer,
        freelancer,
        token,
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
    const filter = this.contract.filters.PaymentReceived(null, null, null, null, null, invoiceId);
    const events = await this.contract.queryFilter(filter, fromBlock);
    
    const payments: PaymentReceivedEvent[] = [];
    
    for (const event of events) {
      const block = await this.provider.getBlock(event.blockNumber);
      const eventLog = event as ethers.EventLog;
      
      if (eventLog.args) {
        payments.push({
          payer: eventLog.args[0],
          freelancer: eventLog.args[1],
          token: eventLog.args[2],
          amount: BigInt(eventLog.args[3].toString()),
          fee: BigInt(eventLog.args[4].toString()),
          invoiceId: eventLog.args[5],
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
          token: eventLog.args[2],
          amount: BigInt(eventLog.args[3].toString()),
          fee: BigInt(eventLog.args[4].toString()),
          invoiceId: eventLog.args[5],
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          timestamp: block?.timestamp || 0
        });
      }
    }
    
    return payments;
  }
  
  /**
   * Check if a token is whitelisted
   */
  async isTokenWhitelisted(tokenAddress: string): Promise<boolean> {
    return await this.contract.isTokenWhitelisted(tokenAddress);
  }
  
  /**
   * Calculate fee for an amount
   */
  async calculateFee(amount: bigint): Promise<{ fee: bigint; freelancerPayout: bigint }> {
    const [fee, freelancerPayout] = await this.contract.calculateFee(amount);
    return {
      fee: BigInt(fee.toString()),
      freelancerPayout: BigInt(freelancerPayout.toString())
    };
  }
  
  /**
   * Get current platform fee (admin only)
   */
  async getPlatformFee(): Promise<number> {
    const fee = await this.contract.platformFee();
    return Number(fee);
  }
  
  /**
   * Get platform wallet address
   */
  async getPlatformWallet(): Promise<string> {
    return await this.contract.platformWallet();
  }
  
  /**
   * Get contract version
   */
  async getVersion(): Promise<string> {
    return await this.contract.version();
  }
  
  /**
   * Admin: Whitelist a token
   */
  async whitelistToken(tokenAddress: string, status: boolean): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for admin operations');
    }
    
    const tx = await this.contract.setTokenWhitelist(tokenAddress, status);
    const receipt = await tx.wait();
    return receipt.hash;
  }
  
  /**
   * Admin: Set platform fee
   */
  async setPlatformFee(feeInBasisPoints: number): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for admin operations');
    }
    
    if (feeInBasisPoints > 500) {
      throw new Error('Fee cannot exceed 5% (500 basis points)');
    }
    
    const tx = await this.contract.setPlatformFee(feeInBasisPoints);
    const receipt = await tx.wait();
    return receipt.hash;
  }
  
  /**
   * Admin: Update platform wallet
   */
  async setPlatformWallet(newWalletAddress: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for admin operations');
    }
    
    // Validate wallet address format
    if (!ethers.isAddress(newWalletAddress)) {
      throw new Error('Invalid wallet address format');
    }
    
    const tx = await this.contract.setPlatformWallet(newWalletAddress);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get contract configuration summary
   */
  async getContractConfig(): Promise<{
    platformWallet: string;
    platformFee: number;
    version: string;
    whitelistedTokens: { address: string; symbol: string; isWhitelisted: boolean }[];
  }> {
    const [platformWallet, platformFee, version] = await Promise.all([
      this.getPlatformWallet(),
      this.getPlatformFee(),
      this.getVersion()
    ]);

    // Check common stablecoins on Base
    const commonTokens = [
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
      { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC' }
    ];

    const whitelistedTokens = await Promise.all(
      commonTokens.map(async (token) => ({
        ...token,
        isWhitelisted: await this.isTokenWhitelisted(token.address)
      }))
    );

    return {
      platformWallet,
      platformFee,
      version,
      whitelistedTokens
    };
  }

  /**
   * Admin: Batch whitelist multiple tokens
   */
  async batchWhitelistTokens(tokens: { address: string; status: boolean }[]): Promise<string[]> {
    if (!this.signer) {
      throw new Error('Signer required for admin operations');
    }

    const txHashes: string[] = [];
    
    for (const token of tokens) {
      if (!ethers.isAddress(token.address)) {
        throw new Error(`Invalid token address: ${token.address}`);
      }
      
      const txHash = await this.whitelistToken(token.address, token.status);
      txHashes.push(txHash);
    }

    return txHashes;
  }

  /**
   * Emergency: Recover tokens sent to contract by mistake
   */
  async emergencyRecoverToken(tokenAddress: string, amount: bigint, recipient: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for admin operations');
    }

    if (!ethers.isAddress(tokenAddress) || !ethers.isAddress(recipient)) {
      throw new Error('Invalid address format');
    }

    // This would require an emergencyRecoverToken function in the smart contract
    // For now, we'll throw an error indicating this needs to be implemented
    throw new Error('Emergency recovery function not implemented in contract ABI');
  }
}