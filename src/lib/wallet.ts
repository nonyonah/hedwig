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
      apiKeyId: getRequiredEnvVar('CDP_API_KEY_ID'),
      apiKeySecret: getRequiredEnvVar('CDP_API_KEY_SECRET'),
      walletSecret: getRequiredEnvVar('CDP_WALLET_SECRET'),
      networkId: process.env.NETWORK_ID || 'base-sepolia',
      idempotencyKey: `user-${userId}-${Date.now()}`,
      ...(address && { address }),
    };

    walletProvider = await CdpV2EvmWalletProvider.configureWithWallet(config);
    return walletProvider;
  } catch (error) {
    console.error('Wallet operation failed:', error);
    throw new Error(`Wallet operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}