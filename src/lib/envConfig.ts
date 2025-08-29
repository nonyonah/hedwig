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
  
  if (networkId === 'base-sepolia' || networkId === '84532') {
    return 'testnet';
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
    apiKey: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_API_KEY', network),
    baseUrl: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_URL_BASE', network),
    ethUrl: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_URL_ETH', network),
    authToken: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_AUTH_TOKEN', network),
    signingKey: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_SIGNING_KEY', network),
    solana: {
      apiKey: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_SOLANA_API_KEY', network),
      url: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_SOLANA_URL', network),
      authToken: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_SOLANA_AUTH_TOKEN', network),
      signingKey: (network?: NetworkEnvironment) => getNetworkEnvVar('ALCHEMY_SOLANA_SIGNING_KEY', network),
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
        : process.env.BASE_SEPOLIA_RPC_URL;
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
      apiKey: NetworkConfig.alchemy.apiKey(network),
      baseUrl: NetworkConfig.alchemy.baseUrl(network),
      ethUrl: NetworkConfig.alchemy.ethUrl(network),
      authToken: NetworkConfig.alchemy.authToken(network),
      signingKey: NetworkConfig.alchemy.signingKey(network),
      solana: {
        apiKey: NetworkConfig.alchemy.solana.apiKey(network),
        url: NetworkConfig.alchemy.solana.url(network),
        authToken: NetworkConfig.alchemy.solana.authToken(network),
        signingKey: NetworkConfig.alchemy.solana.signingKey(network),
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