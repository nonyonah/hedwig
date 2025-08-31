// Hedwig Payment Contract Configuration
export interface WalletConfig {
  platformWallet: string;
  platformFeePercentage: number; // In basis points (100 = 1%)
  contractAddress: string;
  rpcUrl: string;
  chainId: number;
}

// Base Chain Configuration
export const BASE_MAINNET_CONFIG: WalletConfig = {
  platformWallet: process.env.HEDWIG_PLATFORM_WALLET_MAINNET || '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc',
  platformFeePercentage: parseInt(process.env.HEDWIG_PLATFORM_FEE || '100'), // Default 1%
  contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS || '',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  chainId: 8453
};

// Testnet Configuration (for development)
export const BASE_SEPOLIA_CONFIG: WalletConfig = {
  platformWallet: process.env.HEDWIG_PLATFORM_WALLET_TESTNET || '0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d',
  platformFeePercentage: parseInt(process.env.HEDWIG_PLATFORM_FEE || '100'),
  contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_TESTNET || '',
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  chainId: 84532
};

// Supported Tokens on Base Mainnet
export const SUPPORTED_TOKENS = {
  USDC: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin'
  },
  USDbC: {
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    symbol: 'USDbC',
    decimals: 6,
    name: 'USD Base Coin'
  }
};

// Validation functions
export function validateWalletConfig(config: WalletConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.platformWallet) {
    errors.push('Platform wallet address is required');
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(config.platformWallet)) {
    errors.push('Invalid platform wallet address format');
  }

  if (!config.contractAddress) {
    errors.push('Contract address is required');
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(config.contractAddress)) {
    errors.push('Invalid contract address format');
  }

  if (config.platformFeePercentage < 0 || config.platformFeePercentage > 500) {
    errors.push('Platform fee must be between 0 and 500 basis points (0-5%)');
  }

  if (!config.rpcUrl) {
    errors.push('RPC URL is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Get current configuration based on environment
export function getWalletConfig(): WalletConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? BASE_MAINNET_CONFIG : BASE_MAINNET_CONFIG;
}

// Alias for getCurrentConfig (used by admin API)
export function getCurrentConfig(): WalletConfig {
  return getWalletConfig();
}

// Environment variables documentation
export const REQUIRED_ENV_VARS = [
  'HEDWIG_PLATFORM_WALLET',
  'HEDWIG_PAYMENT_CONTRACT_ADDRESS',
  'HEDWIG_PLATFORM_FEE',
  'BASE_RPC_URL',
  'PLATFORM_PRIVATE_KEY'
];

export function checkRequiredEnvVars(): { isValid: boolean; missing: string[] } {
  const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  
  return {
    isValid: missing.length === 0,
    missing
  };
}