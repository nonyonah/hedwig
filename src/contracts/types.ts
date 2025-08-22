// TypeScript interface for HedwigPayment contract
export interface HedwigPaymentContract {
  // Contract address
  address: string;
  
  // Main payment function
  pay(
    token: string,
    amount: bigint,
    freelancer: string,
    invoiceId: string
  ): Promise<string>; // Returns transaction hash
}

// Event interfaces
export interface PaymentReceivedEvent {
  payer: string;
  freelancer: string;
  amount: bigint;
  fee: bigint;
  invoiceId: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

// Contract configuration
export interface HedwigPaymentConfig {
  contractAddress: string;
  platformWallet: string;
  rpcUrl: string;
  chainId: number; // 8453 for Base mainnet
}

// Base chain configuration
export const BASE_CHAIN_CONFIG: HedwigPaymentConfig = {
  contractAddress: '', // To be set after deployment
  platformWallet: '', // To be set during deployment
  rpcUrl: 'https://mainnet.base.org',
  chainId: 8453
};

// Payment request interface for API
export interface PaymentRequest {
  token: string; // Token contract address
  amount: bigint; // Amount in token units (e.g., 1000000n for 1 USDC)
  freelancer: string; // Freelancer wallet address
  invoiceId: string; // Invoice or payment link ID
  payer?: string; // Optional payer address for validation
}

// Payment response interface
export interface PaymentResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
  paymentDetails?: {
    amount: string;
    freelancer: string;
    invoiceId: string;
  };
}

// Contract deployment interface
export interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  platformWallet: string;
  gasUsed: number;
  deploymentCost: string;
}