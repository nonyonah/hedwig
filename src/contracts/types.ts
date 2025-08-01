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
  
  // Admin functions
  setTokenWhitelist(token: string, status: boolean): Promise<string>;
  batchSetTokenWhitelist(tokens: string[], statuses: boolean[]): Promise<string>;
  setPlatformFee(fee: number): Promise<string>;
  setPlatformWallet(newWallet: string): Promise<string>;
  
  // View functions
  isTokenWhitelisted(token: string): Promise<boolean>;
  calculateFee(amount: bigint): Promise<{ fee: bigint; freelancerPayout: bigint }>;
  platformFee(): Promise<number>;
  platformWallet(): Promise<string>;
  version(): Promise<string>;
}

// Event interfaces
export interface PaymentReceivedEvent {
  payer: string;
  freelancer: string;
  token: string;
  amount: bigint;
  fee: bigint;
  invoiceId: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

export interface TokenWhitelistedEvent {
  token: string;
  status: boolean;
  transactionHash: string;
  blockNumber: number;
}

export interface PlatformFeeUpdatedEvent {
  oldFee: number;
  newFee: number;
  transactionHash: string;
  blockNumber: number;
}

// Contract configuration
export interface HedwigPaymentConfig {
  contractAddress: string;
  platformWallet: string;
  rpcUrl: string;
  chainId: number; // 8453 for Base mainnet
  whitelistedTokens: {
    USDC: string; // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    USDbC: string; // 0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA
  };
}

// Base chain configuration
export const BASE_CHAIN_CONFIG: HedwigPaymentConfig = {
  contractAddress: '', // To be set after deployment
  platformWallet: '', // To be set during deployment
  rpcUrl: 'https://mainnet.base.org',
  chainId: 8453,
  whitelistedTokens: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'
  }
};

// Payment request interface for API
export interface PaymentRequest {
  token: string; // Token contract address
  amount: string; // Amount in token units (e.g., "1000000" for 1 USDC)
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
    fee: string;
    freelancerPayout: string;
    token: string;
    freelancer: string;
    invoiceId: string;
  };
}

// Contract deployment interface
export interface DeploymentResult {
  contractAddress: string;
  transactionHash: string;
  platformWallet: string;
  whitelistedTokens: string[];
  gasUsed: number;
  deploymentCost: string;
}