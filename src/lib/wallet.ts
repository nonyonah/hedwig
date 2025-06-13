import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';

let walletProvider: CdpV2EvmWalletProvider | null = null;

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Gets or creates a wallet for a user
 * @param userId - Unique identifier for the user
 * @param address - Optional address of an existing wallet to use
 */
export async function getOrCreateWallet(userId: string, address?: string) {
  if (walletProvider) {
    return walletProvider;
  }

  try {
    const config = {
      // CDP v2 wallet configuration
      apiKeyId: getRequiredEnvVar('NEXT_PUBLIC_CDP_API_KEY_ID'),
      apiKeySecret: getRequiredEnvVar('NEXT_PUBLIC_CDP_API_KEY_SECRET'),
      walletSecret: getRequiredEnvVar('NEXT_PUBLIC_CDP_WALLET_SECRET'),
      networkId: process.env.NEXT_PUBLIC_NETWORK_ID || 'base-sepolia',
      idempotencyKey: `user-${userId}-${Date.now()}`,
      ...(address && { address }),
      
      // CDP v2 specific configuration
      walletType: 'v2',
      walletConfig: {
        // Add any v2 specific configuration here
        // Example:
        // chainId: 84532, // Base Sepolia testnet
        // rpcUrl: process.env.NEXT_PUBLIC_RPC_URL
      }
    };

    walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    return walletProvider;
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}