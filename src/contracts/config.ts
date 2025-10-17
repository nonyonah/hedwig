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
  contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE || '',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  chainId: 8453
};

// Celo Chain Configuration
export const CELO_MAINNET_CONFIG: WalletConfig = {
  platformWallet: process.env.HEDWIG_PLATFORM_WALLET_CELO || '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc',
  platformFeePercentage: parseInt(process.env.HEDWIG_PLATFORM_FEE || '100'), // Default 1%
  contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO || '',
  rpcUrl: process.env.CELO_RPC_URL || 'https://forno.celo.org',
  chainId: 42220
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
  USDT: {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD'
  },
  USDbC: {
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    symbol: 'USDbC',
    decimals: 6,
    name: 'USD Base Coin'
  }
};

// Supported Tokens on Celo Mainnet
export const CELO_SUPPORTED_TOKENS = {
  cUSD: {
    address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    symbol: 'cUSD',
    decimals: 18,
    name: 'Celo Dollar'
  },
  USDC: {
    address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin'
  },
  USDT: {
    address: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD'
  }
};

// Token addresses for other chains (disabled)
export const CHAIN_TOKENS = {
  ethereum: {
    USDC: '0xA0b86a33E6441b8C4505E2c52C6b6046d5b0b6e6',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    ETH: 'native'
  },
  bsc: {
    USDC: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    BNB: 'native',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
  },
  'arbitrum-one': {
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    ETH: 'native',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
  },
  celo: {
    USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    USDT: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
    CELO: '0x471EcE3750Da237f93B8E339c536989b8978a438'
  },
  lisk: {
    USDC: '', // To be added when enabled
    USDT: '', // To be added when enabled
    ETH: 'native',
    LSK: '0x6033F7f88332B8db6ad452B7C6d5bB643990aE3f'
  }
}

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

// Get current configuration based on environment and chain
export function getWalletConfig(chainId?: number): WalletConfig {
  if (chainId === 42220) {
    return CELO_MAINNET_CONFIG;
  }
  // Always use mainnet configuration for Base chain
  // TODO: Implement proper environment-based selection when needed
  return BASE_MAINNET_CONFIG;
}

// Get supported tokens for a specific chain
export function getSupportedTokens(chainId: number) {
  switch (chainId) {
    case 42220: // Celo
      return CELO_SUPPORTED_TOKENS;
    case 8453: // Base
    default:
      return SUPPORTED_TOKENS;
  }
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