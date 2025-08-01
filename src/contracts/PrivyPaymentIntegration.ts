import { ethers } from 'ethers';
import { HedwigPaymentService } from './HedwigPaymentService';
import { PaymentRequest, PaymentResponse } from './types';

/**
 * Integration helper for Privy wallets with HedwigPaymentService
 * This class handles the connection between Privy embedded wallets and the smart contract
 */
export class PrivyPaymentIntegration {
  private paymentService: HedwigPaymentService;
  private contractAddress: string;
  private rpcUrl: string;

  constructor(contractAddress: string, rpcUrl: string) {
    this.contractAddress = contractAddress;
    this.rpcUrl = rpcUrl;
    this.paymentService = new HedwigPaymentService(contractAddress, rpcUrl);
  }

  /**
   * Create a payment service instance connected to a Privy wallet
   * @param privyProvider - The provider from Privy wallet
   * @param walletAddress - The wallet address from Privy
   */
  async createConnectedService(privyProvider: any, walletAddress: string): Promise<HedwigPaymentService> {
    try {
      // Create ethers provider from Privy provider
      const ethersProvider = new ethers.BrowserProvider(privyProvider);
      
      // Get signer for the specific wallet
      const signer = await ethersProvider.getSigner(walletAddress);
      
      // Create new payment service instance with the signer
      const connectedService = new HedwigPaymentService(this.contractAddress, this.rpcUrl);
      
      // Connect the signer to the contract
      (connectedService as any).signer = signer;
      (connectedService as any).contract = (connectedService as any).contract.connect(signer);
      
      return connectedService;
    } catch (error) {
      console.error('Failed to connect Privy wallet to payment service:', error);
      throw new Error('Failed to connect wallet to payment service');
    }
  }

  /**
   * Process payment using Privy wallet
   * @param privyProvider - The provider from Privy wallet
   * @param walletAddress - The wallet address from Privy
   * @param paymentRequest - Payment details
   */
  async processPaymentWithPrivy(
    privyProvider: any,
    walletAddress: string,
    paymentRequest: PaymentRequest
  ): Promise<PaymentResponse> {
    try {
      const connectedService = await this.createConnectedService(privyProvider, walletAddress);
      return await connectedService.processPayment(paymentRequest);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Payment processing failed'
      };
    }
  }

  /**
   * Check if user has sufficient token balance for payment
   * @param privyProvider - The provider from Privy wallet
   * @param walletAddress - The wallet address from Privy
   * @param tokenAddress - Token contract address
   * @param amount - Amount to check (in wei/smallest unit)
   */
  async checkTokenBalance(
    privyProvider: any,
    walletAddress: string,
    tokenAddress: string,
    amount: bigint
  ): Promise<{ hasBalance: boolean; currentBalance: bigint; required: bigint }> {
    try {
      const ethersProvider = new ethers.BrowserProvider(privyProvider);
      
      // ERC20 ABI for balance checking
      const erc20Abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, ethersProvider);
      const balance = await tokenContract.balanceOf(walletAddress);
      
      return {
        hasBalance: balance >= amount,
        currentBalance: BigInt(balance.toString()),
        required: amount
      };
    } catch (error) {
      console.error('Failed to check token balance:', error);
      return {
        hasBalance: false,
        currentBalance: BigInt(0),
        required: amount
      };
    }
  }

  /**
   * Check if user has approved sufficient token allowance for the contract
   * @param privyProvider - The provider from Privy wallet
   * @param walletAddress - The wallet address from Privy
   * @param tokenAddress - Token contract address
   * @param amount - Amount to check allowance for
   */
  async checkTokenAllowance(
    privyProvider: any,
    walletAddress: string,
    tokenAddress: string,
    amount: bigint
  ): Promise<{ hasAllowance: boolean; currentAllowance: bigint; required: bigint }> {
    try {
      const ethersProvider = new ethers.BrowserProvider(privyProvider);
      
      const erc20Abi = [
        "function allowance(address owner, address spender) view returns (uint256)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, ethersProvider);
      const allowance = await tokenContract.allowance(walletAddress, this.contractAddress);
      
      return {
        hasAllowance: allowance >= amount,
        currentAllowance: BigInt(allowance.toString()),
        required: amount
      };
    } catch (error) {
      console.error('Failed to check token allowance:', error);
      return {
        hasAllowance: false,
        currentAllowance: BigInt(0),
        required: amount
      };
    }
  }

  /**
   * Approve token spending for the contract
   * @param privyProvider - The provider from Privy wallet
   * @param walletAddress - The wallet address from Privy
   * @param tokenAddress - Token contract address
   * @param amount - Amount to approve (use ethers.MaxUint256 for unlimited)
   */
  async approveToken(
    privyProvider: any,
    walletAddress: string,
    tokenAddress: string,
    amount: bigint = ethers.MaxUint256
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const ethersProvider = new ethers.BrowserProvider(privyProvider);
      const signer = await ethersProvider.getSigner(walletAddress);
      
      const erc20Abi = [
        "function approve(address spender, uint256 amount) returns (bool)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
      const tx = await tokenContract.approve(this.contractAddress, amount);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Token approval failed'
      };
    }
  }

  /**
   * Get token information
   * @param tokenAddress - Token contract address
   */
  async getTokenInfo(tokenAddress: string): Promise<{
    symbol: string;
    decimals: number;
    name: string;
    isWhitelisted: boolean;
  }> {
    try {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl);
      
      const erc20Abi = [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function name() view returns (string)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      
      const [symbol, decimals, name, isWhitelisted] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name(),
        this.paymentService.isTokenWhitelisted(tokenAddress)
      ]);
      
      return {
        symbol,
        decimals: Number(decimals),
        name,
        isWhitelisted
      };
    } catch (error) {
      console.error('Failed to get token info:', error);
      throw new Error('Failed to retrieve token information');
    }
  }

  /**
   * Format amount for display (convert from wei to human readable)
   * @param amount - Amount in wei/smallest unit
   * @param decimals - Token decimals
   */
  formatAmount(amount: bigint, decimals: number): string {
    return ethers.formatUnits(amount, decimals);
  }

  /**
   * Parse amount from human readable to wei
   * @param amount - Human readable amount
   * @param decimals - Token decimals
   */
  parseAmount(amount: string, decimals: number): bigint {
    return ethers.parseUnits(amount, decimals);
  }

  /**
   * Get the base payment service (for read-only operations)
   */
  getPaymentService(): HedwigPaymentService {
    return this.paymentService;
  }
}

/**
 * Factory function to create PrivyPaymentIntegration instance
 */
export function createPrivyPaymentIntegration(
  contractAddress?: string,
  rpcUrl?: string
): PrivyPaymentIntegration {
  const defaultContractAddress = process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET || 
                                process.env.NEXT_PUBLIC_HEDWIG_PAYMENT_CONTRACT_ADDRESS || '';
  const defaultRpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 
                       process.env.NEXT_PUBLIC_BASE_RPC_URL || 
                       'https://sepolia.base.org';

  return new PrivyPaymentIntegration(
    contractAddress || defaultContractAddress,
    rpcUrl || defaultRpcUrl
  );
}