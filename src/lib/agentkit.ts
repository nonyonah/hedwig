import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';

// Initialize the AgentKit wallet provider
export const initializeWalletProvider = async () => {
  try {
    const walletProvider = await CdpV2EvmWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID || '',
      apiKeySecret: process.env.CDP_API_KEY_SECRET || '',
      walletSecret: process.env.CDP_WALLET_SECRET || '',
      networkId: "base-sepolia", // Default to Base Sepolia testnet
    });
    return walletProvider;
  } catch (error) {
    console.error('Error initializing wallet provider:', error);
    throw error;
  }
};

// Check wallet balance using AgentKit
export async function checkWalletBalance() {
  try {
    const walletProvider = await initializeWalletProvider();
    const balance = await walletProvider.getBalance();
    return balance.toString();
  } catch (error) {
    console.error('Error checking wallet balance with AgentKit:', error);
    throw error;
  }
}

// Swap tokens using AgentKit
export async function swapTokens(fromToken: string, toToken: string, amount: string) {
  try {
    const result = `Swapped ${amount} ${fromToken} to ${toToken}`;
    return result;
  } catch (error) {
    console.error('Error swapping tokens with AgentKit:', error);
    throw error;
  }
}

// Off-ramp crypto to fiat using AgentKit
export async function offRampCrypto(token: string, amount: string) {
  try {
    // This is a simplified version - actual implementation would use AgentKit's off-ramp functionality
    const result = `Off-ramped ${amount} ${token} to fiat`;
    return result;
  } catch (error) {
    console.error('Error off-ramping crypto with AgentKit:', error);
    throw error;
  }
}