import { ethers } from "ethers";

// Define types for Alchemy SDK since we may not have the package installed yet
interface AlchemySettings {
  apiKey: string;
  network: string;
}

interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logo?: string;
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

interface TokenBalancesResponse {
  tokenBalances: AlchemyTokenBalance[];
}

interface AssetTransfer {
  hash: string;
  from: string;
  to: string;
  value: number;
  asset: string;
  category: string;
  blockNum: string;
}

interface AssetTransfersResponse {
  transfers: AssetTransfer[];
}

// Mock Network enum
const Network = {
  ETH_MAINNET: "eth-mainnet",
  ETH_SEPOLIA: "eth-sepolia",
  BASE_MAINNET: "base-mainnet",
  BASE_SEPOLIA: "base-sepolia"
} as const;

// Mock AssetTransfersCategory enum
const AssetTransfersCategory = {
  EXTERNAL: "external",
  INTERNAL: "internal",
  ERC20: "erc20",
  ERC721: "erc721"
} as const;

// Mock Alchemy class until we can install the real package
class Alchemy {
  core: {
    getBalance: (address: string) => Promise<bigint>;
    getTokenBalances: (address: string) => Promise<TokenBalancesResponse>;
    getTokenMetadata: (address: string) => Promise<TokenMetadata>;
    getAssetTransfers: (options: any) => Promise<AssetTransfersResponse>;
  };

  constructor(settings: AlchemySettings) {
    this.core = {
      getBalance: async (address: string) => {
        console.log(`[Mock Alchemy] Getting balance for ${address}`);
        return BigInt(1000000000000000000); // 1 ETH
      },
      getTokenBalances: async (address: string) => {
        console.log(`[Mock Alchemy] Getting token balances for ${address}`);
        return { tokenBalances: [] };
      },
      getTokenMetadata: async (address: string) => {
        console.log(`[Mock Alchemy] Getting token metadata for ${address}`);
        return { name: "Mock Token", symbol: "MOCK", decimals: 18 };
      },
      getAssetTransfers: async (options: any) => {
        console.log(`[Mock Alchemy] Getting asset transfers`);
        return { transfers: [] };
      }
    };
  }
}

// Initialize Alchemy SDK
const settings = {
  apiKey: process.env.ALCHEMY_API_KEY || "",
  network: process.env.ALCHEMY_NETWORK || Network.BASE_SEPOLIA
};

const alchemy = new Alchemy(settings);

// Interface for wallet balance data
export interface WalletBalance {
  address: string;
  nativeBalance: string;
  formattedBalance: string;
  tokens: TokenBalance[];
}

// Interface for token balance data
export interface TokenBalance {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  formattedBalance: string;
}

/**
 * Fetches wallet balance using Alchemy
 * @param address Wallet address to check balance for
 * @returns Promise with wallet balance data
 */
export async function getWalletBalance(address: string): Promise<WalletBalance> {
  try {
    console.log(`[Alchemy] Fetching balance for address: ${address}`);
    
    // Get native token balance
    const balanceWei = await alchemy.core.getBalance(address);
    const formattedBalance = ethers.formatEther(balanceWei.toString());
    
    // Get token balances
    const tokenBalancesResponse = await alchemy.core.getTokenBalances(address);
    
    const tokens: TokenBalance[] = [];
    
    // Process token balances that are non-zero
    const nonZeroBalances = tokenBalancesResponse.tokenBalances.filter(
      (token) => token.tokenBalance !== "0"
    );
    
    // Get metadata for each token
    for (const token of nonZeroBalances) {
      const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
      
      if (metadata && token.tokenBalance) {
        const decimals = metadata.decimals || 18;
        const rawBalance = token.tokenBalance;
        const formattedTokenBalance = ethers.formatUnits(rawBalance, decimals);
        
        tokens.push({
          contractAddress: token.contractAddress,
          name: metadata.name || "Unknown Token",
          symbol: metadata.symbol || "???",
          decimals,
          balance: rawBalance,
          formattedBalance: formattedTokenBalance
        });
      }
    }
    
    return {
      address,
      nativeBalance: balanceWei.toString(),
      formattedBalance,
      tokens
    };
  } catch (error) {
    console.error("[Alchemy] Error fetching wallet balance:", error);
    throw error;
  }
}

/**
 * Fetches recent transactions for a wallet address
 * @param address Wallet address to check transactions for
 * @param limit Number of transactions to fetch
 * @returns Promise with transaction data
 */
export async function getRecentTransactions(address: string, limit = 10): Promise<AssetTransfersResponse> {
  try {
    console.log(`[Alchemy] Fetching recent transactions for address: ${address}`);
    
    const transfers = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      toAddress: address,
      category: [
        AssetTransfersCategory.EXTERNAL,
        AssetTransfersCategory.INTERNAL,
        AssetTransfersCategory.ERC20,
        AssetTransfersCategory.ERC721
      ],
      maxCount: limit
    });
    
    return transfers;
  } catch (error) {
    console.error("[Alchemy] Error fetching recent transactions:", error);
    throw error;
  }
}

// Interface for Alchemy webhook event
interface AlchemyWebhookEvent {
  eventType: string;
  address: string;
  value?: string;
  to?: string;
  from?: string;
  asset?: string;
  [key: string]: any;
}

/**
 * Sets up a webhook to monitor wallet address events
 * @param address Wallet address to monitor
 * @param webhookUrl URL to call when events occur
 * @returns Promise with webhook setup result
 */
export async function setupWalletMonitoring(address: string, webhookUrl: string): Promise<any> {
  try {
    console.log(`[Alchemy] Setting up monitoring for address: ${address}`);
    
    // This would typically be done via Alchemy dashboard or their Notify API
    // For this example, we'll just log the intent
    console.log(`[Alchemy] Would set up webhook at ${webhookUrl} for address ${address}`);
    
    // In a real implementation, you would use Alchemy's Notify API to register the webhook
    // This requires additional setup in the Alchemy dashboard
    
    return {
      success: true,
      message: `Monitoring set up for address ${address}`
    };
  } catch (error) {
    console.error("[Alchemy] Error setting up wallet monitoring:", error);
    throw error;
  }
}

/**
 * Process a wallet event from Alchemy webhook
 * @param event Wallet event data from Alchemy webhook
 * @returns Promise with processing result
 */
export async function processWalletEvent(event: AlchemyWebhookEvent): Promise<any> {
  try {
    console.log(`[Alchemy] Processing wallet event:`, event);
    
    // Extract event details
    const eventType = event.eventType; // e.g., "MINED_TRANSACTION", "TOKEN_TRANSFER"
    const address = event.address;
    
    // Log the event for now instead of sending notifications
    switch (eventType) {
      case "MINED_TRANSACTION":
        console.log(`[Alchemy] Transaction mined for ${address}: ${event.value} ETH to ${event.to}`);
        break;
      case "TOKEN_TRANSFER":
        console.log(`[Alchemy] Token transfer for ${address}: ${event.value} ${event.asset} from ${event.from}`);
        break;
      default:
        console.log(`[Alchemy] Unhandled event type: ${eventType}`);
    }
    
    return {
      success: true,
      message: `Processed ${eventType} event for ${address}`
    };
  } catch (error) {
    console.error("[Alchemy] Error processing wallet event:", error);
    throw error;
  }
}

/**
 * Get user phone number by wallet address
 * @param address Wallet address
 * @returns Promise with user phone number
 */
async function getUserPhonesByAddress(address: string): Promise<string[]> {
  try {
    // In a real implementation, this would query your database
    // For this example, we'll use a mock implementation
    
    // Import supabase client
    const { supabase } = await import("./supabaseClient");
    
    // Query the database for the user with this wallet address
    const { data, error } = await supabase
      .from("wallets")
      .select("user_phone")
      .eq("address", address.toLowerCase());
    
    if (error || !data || data.length === 0) {
      console.log(`[Alchemy] No users found for address ${address}`);
      return [];
    }
    
    // Return all user phone numbers
    return data.map(row => row.user_phone);
  } catch (error) {
    console.error("[Alchemy] Error getting users by address:", error);
    return [];
  }
} 