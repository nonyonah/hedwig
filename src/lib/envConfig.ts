/**
 * Environment Configuration Helper
 * Dynamically selects between testnet and mainnet configurations
 */

export type NetworkEnvironment = 'mainnet' | 'testnet';

/**
 * Get the current network environment from environment variables
 */
export function getCurrentNetworkEnvironment(): NetworkEnvironment {
  const networkId = process.env.NETWORK_ID || process.env.NEXT_PUBLIC_NETWORK_ID;
  
  // Base Mainnet chain ID is 8453, Base Sepolia (testnet) is 84532
  if (networkId === 'base-mainnet' || networkId === '8453') {
    return 'mainnet';
  }
  
  // Default to mainnet for production safety
  return 'mainnet';
}

/**
 * Get environment variable with network-specific fallback
 */
export function getNetworkEnvVar(baseKey: string, network?: NetworkEnvironment): string | undefined {
  const env = network || getCurrentNetworkEnvironment();
  
  // Try network-specific variable first
  const networkSpecificKey = `${baseKey}_${env.toUpperCase()}`;
  const networkSpecificValue = process.env[networkSpecificKey];
  
  if (networkSpecificValue) {
    return networkSpecificValue;
  }
  
  // Fallback to base key
  return process.env[baseKey];
}

/**
 * Configuration object for network-specific settings
 */
export const NetworkConfig = {
  // Alchemy Configuration
  alchemy: {
    apiKey: () => process.env.ALCHEMY_API_KEY,
    baseUrl: () => process.env.ALCHEMY_URL_BASE_MAINNET,
    ethUrl: () => process.env.ALCHEMY_URL_ETH_MAINNET,
    authToken: (currentNetwork: string) => process.env.ALCHEMY_AUTH_TOKEN,
    signingKey: (currentNetwork: string) => process.env.ALCHEMY_SIGNING_KEY,
    solana: {
      apiKey: () => process.env.ALCHEMY_SOLANA_API_KEY,
      url: () => process.env.ALCHEMY_SOLANA_URL,
      authToken: () => process.env.ALCHEMY_SOLANA_AUTH_TOKEN,
      signingKey: () => process.env.ALCHEMY_SOLANA_SIGNING_KEY,
    },
  },
  
  // CDP Configuration
  cdp: {
    apiKeyId: (network?: NetworkEnvironment) => getNetworkEnvVar('CDP_API_KEY_ID', network),
    apiKeySecret: (network?: NetworkEnvironment) => getNetworkEnvVar('CDP_API_KEY_SECRET', network),
    walletSecret: (network?: NetworkEnvironment) => getNetworkEnvVar('CDP_WALLET_SECRET', network),
  },
  
  // Paycrest Configuration
  paycrest: {
    apiKey: (network?: NetworkEnvironment) => getNetworkEnvVar('PAYCREST_API_KEY', network),
    apiToken: (network?: NetworkEnvironment) => getNetworkEnvVar('PAYCREST_API_TOKEN', network),
    apiSecret: (network?: NetworkEnvironment) => getNetworkEnvVar('PAYCREST_API_SECRET', network),
  },
  
  // Fonbnk Configuration
  fonbnk: {
    apiKey: (network?: NetworkEnvironment) => getNetworkEnvVar('FONBNK_API_KEY', network),
    apiSecret: (network?: NetworkEnvironment) => getNetworkEnvVar('FONBNK_API_SECRET', network),
    webhookSecret: (network?: NetworkEnvironment) => getNetworkEnvVar('FONBNK_WEBHOOK_SECRET', network),
    baseUrl: (network?: NetworkEnvironment) => {
      const env = network || getCurrentNetworkEnvironment();
      return env === 'mainnet' 
        ? 'https://api.fonbnk.com/v1'
        : 'https://sandbox-api.fonbnk.com/v1';
    },
  },
  
  // Helius Configuration
  helius: {
    apiKey: (network?: NetworkEnvironment) => getNetworkEnvVar('HELIUS_API_KEY', network),
  },
  
  // Contract Addresses
  contracts: {
    hedwigPayment: (network?: NetworkEnvironment) => getNetworkEnvVar('HEDWIG_PAYMENT_CONTRACT_ADDRESS', network),
    platformWallet: (network?: NetworkEnvironment) => getNetworkEnvVar('HEDWIG_PLATFORM_WALLET', network),
  },
  
  // RPC URLs
  rpc: {
    base: (network?: NetworkEnvironment) => {
      const env = network || getCurrentNetworkEnvironment();
      return env === 'mainnet' 
        ? process.env.BASE_MAINNET_RPC_URL 
        : process.env.BASE_MAINNET_RPC_URL;
    },
    solana: (network?: NetworkEnvironment) => {
      const env = network || getCurrentNetworkEnvironment();
      return env === 'mainnet' 
        ? process.env.SOLANA_MAINNET_RPC_URL 
        : process.env.SOLANA_DEVNET_RPC_URL;
    },
  },
};

/**
 * Get current active configuration
 */
export function getCurrentConfig() {
  const network = getCurrentNetworkEnvironment();
  
  return {
    network,
    alchemy: {
      apiKey: NetworkConfig.alchemy.apiKey(),
      baseUrl: NetworkConfig.alchemy.baseUrl(),
      ethUrl: NetworkConfig.alchemy.ethUrl(),
      authToken: NetworkConfig.alchemy.authToken(network),
      signingKey: NetworkConfig.alchemy.signingKey(network),
      solana: {
        apiKey: NetworkConfig.alchemy.solana.apiKey(),
        url: NetworkConfig.alchemy.solana.url(),
        authToken: NetworkConfig.alchemy.solana.authToken(),
        signingKey: NetworkConfig.alchemy.solana.signingKey(),
      },
    },
    cdp: {
      apiKeyId: NetworkConfig.cdp.apiKeyId(network),
      apiKeySecret: NetworkConfig.cdp.apiKeySecret(network),
      walletSecret: NetworkConfig.cdp.walletSecret(network),
    },
    paycrest: {
      apiKey: NetworkConfig.paycrest.apiKey(network),
      apiToken: NetworkConfig.paycrest.apiToken(network),
      apiSecret: NetworkConfig.paycrest.apiSecret(network),
    },
    fonbnk: {
      apiKey: NetworkConfig.fonbnk.apiKey(network),
      apiSecret: NetworkConfig.fonbnk.apiSecret(network),
      webhookSecret: NetworkConfig.fonbnk.webhookSecret(network),
      baseUrl: NetworkConfig.fonbnk.baseUrl(network),
    },
    helius: {
      apiKey: NetworkConfig.helius.apiKey(network),
    },
    contracts: {
      hedwigPayment: NetworkConfig.contracts.hedwigPayment(network),
      platformWallet: NetworkConfig.contracts.platformWallet(network),
    },
    rpc: {
      base: NetworkConfig.rpc.base(network),
      solana: NetworkConfig.rpc.solana(network),
    },
  };
}

/**
 * Validate that all required environment variables are set for the current network
 */
export function validateNetworkConfig(network?: NetworkEnvironment): { valid: boolean; missing: string[] } {
  const env = network || getCurrentNetworkEnvironment();
  const missing: string[] = [];
  
  // Required variables for each network
  const requiredVars = [
    'ALCHEMY_API_KEY',
    'CDP_API_KEY_ID',
    'CDP_API_KEY_SECRET',
    'HEDWIG_PAYMENT_CONTRACT_ADDRESS',
    'HEDWIG_PLATFORM_WALLET',
  ];
  
  for (const baseKey of requiredVars) {
    const value = getNetworkEnvVar(baseKey, env);
    if (!value) {
      missing.push(`${baseKey}_${env.toUpperCase()}`);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Log current configuration (without sensitive data)
 */
export function logCurrentConfig() {
  const config = getCurrentConfig();
  
  console.log('🔧 Current Network Configuration:', {
    network: config.network,
    hasAlchemyKey: !!config.alchemy.apiKey,
    hasCdpKey: !!config.cdp.apiKeyId,
    hasPaycrestKey: !!config.paycrest.apiKey,
    hasFonbnkKey: !!config.fonbnk.apiKey,
    hasHeliusKey: !!config.helius.apiKey,
    contractAddress: config.contracts.hedwigPayment,
    platformWallet: config.contracts.platformWallet,
    baseRpc: config.rpc.base,
    solanaRpc: config.rpc.solana,
  });
  
  const validation = validateNetworkConfig();
  if (!validation.valid) {
    console.warn('⚠️ Missing required environment variables:', validation.missing);
  }
}