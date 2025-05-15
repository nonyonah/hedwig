import { AgentKit } from "@coinbase/agentkit";
import { cdpApiActionProvider } from "@coinbase/agentkit";
import { CdpWalletProvider } from "@coinbase/agentkit";

// Server component to initialize Coinbase AgentKit
export async function initializeCoinbaseAgent() {
  try {
    // Create a wallet provider
    const walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyName: process.env.NEXT_PUBLIC_COINBASE_API_KEY_NAME as string,
      apiKeyPrivateKey: process.env.NEXT_PUBLIC_COINBASE_API_KEY as string,
      networkId: "base-mainnet", // Or your preferred network
    });

    // Initialize AgentKit
    const agentKit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        cdpApiActionProvider({
          apiKeyName: process.env.NEXT_PUBLIC_COINBASE_API_KEY_NAME as string,
          apiKeyPrivateKey: process.env.NEXT_PUBLIC_COINBASE_API_KEY as string,
        }),
      ],
    });

    return agentKit;
  } catch (error) {
    console.error("Failed to initialize Coinbase Agent Kit:", error);
    return null;
  }
}