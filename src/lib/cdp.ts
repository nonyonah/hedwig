// src/lib/cdp.ts
import { CdpClient as BaseCdpClient } from '@coinbase/cdp-sdk';

// Extend the CdpClient type to include the getOrCreateAccount method, which is not in the base SDK types
interface CdpClient extends BaseCdpClient {
  evm: BaseCdpClient['evm'] & {
    getOrCreateAccount: (args: { name: string }) => Promise<{ address: string }>;
  };
  solana: BaseCdpClient['solana'] & {
    getOrCreateAccount: (args: { name: string }) => Promise<{ address: string }>;
  };
}

// Balance types
interface Asset {
  symbol: string;
  decimals: number;
  contractAddress?: string;
  mint?: string;
}

interface Balance {
  asset: Asset;
  amount: string;
}
import { parseUnits } from 'viem';
import { loadServerEnvironment } from './serverEnv';
import { createClient } from '@supabase/supabase-js';
import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } from '@solana/spl-token';

// Ensure environment variables are loaded
loadServerEnvironment();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize CDP client
const cdp = new BaseCdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET
});

// Access EVM and Solana clients
const evmClient = cdp.evm;
const solanaClient = cdp.solana;

/**
 * Network configuration
 */
export interface NetworkConfig {
  name: string;
  chainId?: number; // For EVM networks
  networkId?: string; // For Solana networks
}

/**
 * Get Base Sepolia balances using Coinbase RPC endpoint
 * @param address - Wallet address
 * @returns Token balances
 */
async function getBaseSepoliaBalances(address: string) {
  try {
    const baseSepoliaRpc = 'https://api.developer.coinbase.com/rpc/v1/base-sepolia/QPwHIcurQPClYOPIGNmRONEHGmZUXikg';
    const usdcContractAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
    
    console.log(`[CDP] Fetching Base Sepolia balances using Coinbase RPC for ${address}`);
    console.log(`[CDP] Using USDC contract address: ${usdcContractAddress}`);

    // Get ETH balance
    const ethBalanceResponse = await fetch(baseSepoliaRpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest']
      })
    });

    const ethBalanceData = await ethBalanceResponse.json();
    console.log(`[CDP] ETH balance response:`, ethBalanceData);
    
    if (ethBalanceData.error) {
      throw new Error(`Base Sepolia ETH balance error: ${ethBalanceData.error.message}`);
    }

    // Get USDC balance using ERC-20 balanceOf method
    const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;
    console.log(`[CDP] USDC balanceOf call data: ${balanceOfData}`);
    
    const usdcBalanceResponse = await fetch(baseSepoliaRpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 2,
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: usdcContractAddress,
            data: balanceOfData
          },
          'latest'
        ]
      })
    });

    const usdcBalanceData = await usdcBalanceResponse.json();
    console.log(`[CDP] USDC balance response:`, usdcBalanceData);
    
    let usdcBalance = '0';
    if (!usdcBalanceData.error && usdcBalanceData.result) {
      usdcBalance = usdcBalanceData.result;
      console.log(`[CDP] USDC balance (hex): ${usdcBalance}`);
      // Convert hex to decimal for logging
      const usdcBalanceDecimal = parseInt(usdcBalance, 16);
      console.log(`[CDP] USDC balance (decimal): ${usdcBalanceDecimal}`);
    } else if (usdcBalanceData.error) {
      console.error(`[CDP] USDC balance error:`, usdcBalanceData.error);
    }

    // Format balances
    const balances: Balance[] = [];

    // Add ETH balance
    const ethBalanceWei = ethBalanceData.result;
    balances.push({
      asset: { symbol: 'ETH', decimals: 18 },
      amount: ethBalanceWei
    });

    // Add USDC balance
    balances.push({
      asset: { symbol: 'USDC', decimals: 6, contractAddress: usdcContractAddress },
      amount: usdcBalance
    });

    console.log(`[CDP] Final Base Sepolia balances:`, balances);
    return { data: balances };
  } catch (error) {
    console.error('[CDP] Failed to get Base Sepolia balances:', error);
    // Return default balances with 0 values instead of throwing
    return {
      data: [
        { asset: { symbol: 'ETH', decimals: 18 }, amount: '0' },
        { asset: { symbol: 'USDC', decimals: 6 }, amount: '0' }
      ]
    };
  }
}

/**
 * Supported networks configuration
 */
export const SUPPORTED_NETWORKS: Record<string, NetworkConfig> = {
  'ethereum-sepolia': {
    name: 'ethereum-sepolia',
    chainId: 11155111,
  },
  'base-sepolia': {
    name: 'base-sepolia',
    chainId: 84532,
  },
  'ethereum': {
    name: 'ethereum',
    chainId: 1,
  },
  'base': {
    name: 'base',
    chainId: 8453,
  },
  'optimism-sepolia': {
    name: 'optimism-sepolia',
    chainId: 11155420,
  },
  'celo-alfajores': {
    name: 'celo-alfajores',
    chainId: 44787,
  },
  'solana-devnet': {
    name: 'solana-devnet',
    networkId: 'devnet',
  },
  'solana': {
    name: 'solana',
    networkId: 'mainnet-beta',
  },
  // DISABLED NETWORKS - BEP20 and Asset Chain are defined but not active
  'bsc': {
    name: 'bsc',
    chainId: 56,
  },
  'bsc-testnet': {
    name: 'bsc-testnet',
    chainId: 97,
  },
  'asset-chain': {
    name: 'asset-chain',
    chainId: 42421,
  },
  'asset-chain-testnet': {
    name: 'asset-chain-testnet',
    chainId: 42420,
  },
};

/**
 * Active networks - BEP20 and Asset Chain are DISABLED
 */
export const ACTIVE_NETWORKS = [
  'ethereum-sepolia',
  'base-sepolia', 
  'ethereum',
  'base',
  'optimism-sepolia',
  'celo-alfajores',
  'solana-devnet',
  'solana'
];

/**
 * Disabled networks - These are defined but not available for use
 */
export const DISABLED_NETWORKS = [
  'bsc',
  'bsc-testnet', 
  'asset-chain',
  'asset-chain-testnet'
];

/**
 * Format network name for CDP API
 * @param chain - Chain identifier
 * @returns Formatted network name
 */
export function formatNetworkName(chain: string): string {
  switch (chain.toLowerCase()) {
    case "base":
      return "base-sepolia";
    case "ethereum":
    case "evm":
      return "ethereum-sepolia";
    case "solana":
      return "solana-devnet";
    default:
      return chain;
  }
}

/**
 * Get block explorer URL for a transaction
 * @param txHash - Transaction hash
 * @param network - Network name
 * @returns Block explorer URL
 */
export function getBlockExplorerUrl(txHash: string, network: string): string {
  const actualNetwork = getActualNetworkName(network);
  
  switch (actualNetwork) {
    case 'base-sepolia':
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 'base':
      return `https://basescan.org/tx/${txHash}`;
    case 'ethereum-sepolia':
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case 'ethereum':
      return `https://etherscan.io/tx/${txHash}`;
    case 'optimism-sepolia':
      return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
    case 'solana-devnet':
      return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
    case 'solana':
      return `https://explorer.solana.com/tx/${txHash}`;
    default:
      return `https://explorer.solana.com/tx/${txHash}`;
  }
}

/**
 * Map simplified chain names to actual network names for API calls
 */
function getActualNetworkName(chain: string): string {
  switch (chain) {
    case 'evm':
      return 'base-sepolia';
    case 'solana':
      return 'solana-devnet';
    default:
      return chain; // Return as-is for backward compatibility
  }
}

/**
 * Create a new wallet
 * @param userId - User ID
 * @param network - Network name (default: 'base-sepolia')
 * @returns Created wallet information
 */
export async function createWallet(userId: string, network: string = 'evm') {
  try {
    // Use simplified chain name for database storage
    const chain = network;
    // Get actual network name for CDP API calls
    const actualNetwork = getActualNetworkName(network);
    
    // First check if a wallet already exists for this user and chain
    const { data: existingWallets } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('chain', chain);
    
    // If wallet already exists, return the first one
    if (existingWallets && existingWallets.length > 0) {
      console.log(`[CDP] Wallet already exists for user ${userId} on chain ${chain}. Returning existing wallet.`);
      
      // Log warning if multiple wallets found
      if (existingWallets.length > 1) {
        console.warn(`[CDP] Multiple wallets found for user ${userId} on chain ${chain}. Using the first one.`);
      }
      
      return existingWallets[0];
    }
    
    // Fetch user details to get a unique name for the account
    // Handle both UUID and username identifiers
    let userQuery = supabase.from('users').select('phone_number, id');
    
    // Check if userId looks like a UUID (contains hyphens and is 36 chars) or is a username
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      userQuery = userQuery.eq('id', userId);
    } else {
      // Assume it's a username, query by telegram_username
      userQuery = userQuery.eq('telegram_username', userId);
    }
    
    const { data: user, error: userError } = await userQuery.single();

    if (userError || !user) {
      console.error(`[CDP] Failed to fetch user details for ${userId}:`, userError);
      throw new Error('Could not fetch user details to create a named wallet.');
    }

    // Use the actual user UUID for wallet creation
    const actualUserId = user.id;

    // Format the phone number to create a valid account name
    // CDP requires alphanumeric characters and hyphens, between 2 and 36 characters
    let accountName = user.phone_number;
    // Remove any non-alphanumeric characters except hyphens
    accountName = accountName.replace(/[^a-zA-Z0-9-]/g, '');
    // If it starts with a plus, replace it with 'p'
    if (accountName.startsWith('+')) {
      accountName = 'p' + accountName.substring(1);
    }
    // Ensure it's between 2 and 36 characters
    if (accountName.length < 2) {
      accountName = 'user-' + accountName;
    } else if (accountName.length > 36) {
      accountName = accountName.substring(0, 36);
    }
    
    console.log(`[CDP] Formatted account name: ${accountName}`);
    
    // Basic validation for account name
    if (!accountName || !/^[a-zA-Z0-9-]{2,36}$/.test(accountName)) {
        console.error(`[CDP] Invalid account name after formatting: ${accountName}`);
        throw new Error('Cannot create wallet with an invalid account name.');
    }

    console.log(`[CDP] Creating wallet for user ${userId} on network ${network} (actual: ${actualNetwork}) with name ${accountName}`);
    
    // Get network configuration using actual network name
    const networkConfig = SUPPORTED_NETWORKS[actualNetwork];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${actualNetwork}`);
    }
    
    // Create account based on network type
    let account;
    if (networkConfig.chainId) {
      // Create EVM account
      account = await (evmClient as any).getOrCreateAccount({ name: accountName });
    } else if (networkConfig.networkId) {
      // Create Solana account
      account = await (solanaClient as any).getOrCreateAccount({ name: accountName });
    } else {
      throw new Error(`Invalid network configuration for ${network}`);
    }
    
    console.log(`[CDP] Created wallet with address ${account.address}`);
    
    try {
      // Store wallet in database
      const { data: wallet, error } = await supabase
        .from('wallets')
        .insert({
          user_id: actualUserId, // Use the actual UUID from the database
          address: account.address,
          cdp_wallet_id: account.address, // Use address as identifier since CDP manages the account
          chain: chain,
          // No need to store wallet_secret separately as it's managed by CDP
        })
        .select();
      
      if (error) {
        console.error(`[CDP] Failed to store wallet in database:`, error);
        
        // If error is due to unique constraint, try to fetch the existing wallet
        if (typeof error === 'object' && 'code' in error && error.code === '23505' && 
            'message' in error && typeof error.message === 'string' && error.message.includes('wallets_user_id_chain_key')) {
          console.log(`[CDP] Wallet already exists for user ${actualUserId} on chain ${chain}. Fetching existing wallet.`);
          const { data: existingWallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', actualUserId)
            .eq('chain', chain);
          
          if (existingWallet && existingWallet.length > 0) {
            return existingWallet[0];
          }
        }
        
        throw error;
      }
      
      return Array.isArray(wallet) ? wallet[0] : wallet;
    } catch (dbError) {
      console.error(`[CDP] Database error when storing wallet:`, dbError);
      
      // If we can't store the wallet, check if one already exists (race condition)
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', actualUserId)
        .eq('chain', chain);
      
      if (existingWallet && existingWallet.length > 0) {
        console.log(`[CDP] Found existing wallet after creation failure. Using that instead.`);
        return existingWallet[0];
      }
      
      throw dbError;
    }
  } catch (error) {
    console.error(`[CDP] Failed to create wallet:`, error);
    throw error;
  }
}

/**
 * Get or create CDP wallet for a user
 * @param userId - User ID
 * @param network - Network to create wallet on (default: base-sepolia)
 * @returns Wallet information
 */
export async function getOrCreateCdpWallet(userId: string, network: string = 'evm') {
  console.log(`[CDP] Getting or creating wallet for user ${userId} on network ${network}`);
  
  // Use simplified chain name for database storage
  const chain = network;
  // Get actual network name for CDP API calls
  const actualNetwork = getActualNetworkName(network);
  
  // Determine if userId is a UUID or username and get the actual user UUID
  let actualUserId: string | undefined;
  
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID) {
      actualUserId = userId;
    } else {
      // userId is a username, fetch the actual UUID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_username', userId)
        .single();
      
      if (userError || !user) {
        console.error(`[CDP] Failed to find user with username ${userId}:`, userError);
        throw new Error(`User not found: ${userId}`);
      }
      
      actualUserId = user.id;
    }
    
    // Check if user already has a wallet on this chain
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', actualUserId)
      .eq('chain', chain);
      
    // If multiple wallets found, use the first one
    const existingWallet = wallets && wallets.length > 0 ? wallets[0] : null;
    
    if (existingWallet) {
      console.log(`[CDP] Found existing wallet for user ${userId}:`, existingWallet.address);
      
      // If there are multiple wallets, log a warning
      if (wallets && wallets.length > 1) {
        console.warn(`[CDP] Multiple wallets found for user ${userId} on chain ${chain}. Using the first one.`);
      }
      
      return existingWallet;
    }
    
    console.log(`[CDP] No existing wallet found, creating new one for user ${userId}`);
    
    // Create new wallet using CDP
    const newWallet = await createWallet(userId, network);
    return newWallet;
  } catch (error: any) {
    console.error(`[CDP] Failed to get or create wallet:`, error);
    
    // If the error is related to a unique constraint violation, try to fetch the existing wallet
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505' && 
        'message' in error && typeof error.message === 'string' && error.message.includes('wallets_user_id_chain_key')) {
      console.log(`[CDP] Wallet creation failed due to unique constraint. Attempting to fetch existing wallet.`);
      
      // Only try to fetch if we have actualUserId (user lookup was successful)
      if (actualUserId) {
        const { data: existingWallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', actualUserId)
          .eq('chain', chain);
        
        if (existingWallet && existingWallet.length > 0) {
          console.log(`[CDP] Found existing wallet after creation failure. Using that instead.`);
          return existingWallet[0];
        }
      }
    }
    
    throw error;
  }
}

/**
 * Get wallet by address
 * @param address - Wallet address
 * @returns Wallet information
 */
export async function getWallet(address: string) {
  try {
    console.log(`[CDP] Getting wallet with address ${address}`);
    
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('address', address)
      .single();
    
    if (error) {
      console.error(`[CDP] Failed to get wallet from database:`, error);
      throw error;
    }
    
    return wallet;
  } catch (error) {
    console.error(`[CDP] Failed to get wallet:`, error);
    throw error;
  }
}

/**
 * Get wallet balances
 * @param address - Wallet address
 * @param network - Network name
 * @returns Wallet balances
 */
export async function getBalances(address: string, network: string) {
  try {
    // Convert simplified chain name to actual network name if needed
    const actualNetwork = getActualNetworkName(network);
    console.log(`[CDP] Getting balances for wallet ${address} on network ${network} (actual: ${actualNetwork})`);
    
    // Get network configuration using actual network name
    const networkConfig = SUPPORTED_NETWORKS[actualNetwork];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${actualNetwork}`);
    }
    
    // Get balances based on network type
    let balances;
    if (networkConfig.chainId) {
      // For Ethereum Sepolia, use Alchemy API since CDP doesn't support it
      if (actualNetwork === 'ethereum-sepolia') {
        balances = await getEthereumSepoliaBalances(address);
      } else if (actualNetwork === 'base-sepolia') {
        // Try CDP first, fallback to Coinbase RPC if needed
        try {
          balances = await evmClient.listTokenBalances({
            address: address as `0x${string}`,
            network: networkConfig.name as any,
          });
          
          // Check if we got valid balances
           if (!balances || !(balances as any).data || (Array.isArray((balances as any).data) && (balances as any).data.length === 0)) {
             console.log('[CDP] CDP returned empty balances for Base Sepolia, trying Coinbase RPC fallback');
             balances = await getBaseSepoliaBalances(address);
           }
        } catch (cdpError) {
          console.warn('[CDP] CDP failed for Base Sepolia, trying Coinbase RPC fallback:', cdpError);
          balances = await getBaseSepoliaBalances(address);
        }
      } else {
        // Get EVM balances using CDP for other supported networks
        balances = await evmClient.listTokenBalances({
          address: address as `0x${string}`,
          network: networkConfig.name as any,
        });
      }
    } else if (networkConfig.networkId) {
      // Get Solana balances with SOL and USDC SPL token
      balances = await getSolanaBalances(address, networkConfig.networkId);
    } else {
      throw new Error(`Invalid network configuration for ${network}`);
    }
    
    return balances;
  } catch (error) {
    console.error(`[CDP] Failed to get balances:`, error);
    throw error;
  }
}

/**
 * Get Ethereum Sepolia balances using Alchemy API
 * @param address - Wallet address
 * @returns Token balances
 */
async function getEthereumSepoliaBalances(address: string) {
  try {
    const alchemyApiKey = process.env.ALCHEMY_API_KEY;
    const alchemyUrl = process.env.ALCHEMY_URL_ETH_SEPOLIA || `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`;
    
    if (!alchemyApiKey) {
      throw new Error('ALCHEMY_API_KEY not configured');
    }

    console.log(`[CDP] Fetching Ethereum Sepolia balances using Alchemy for ${address}`);

    // Get ETH balance
    const ethBalanceResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest']
      })
    });

    const ethBalanceData = await ethBalanceResponse.json();
    if (ethBalanceData.error) {
      throw new Error(`Alchemy ETH balance error: ${ethBalanceData.error.message}`);
    }

    // Get token balances using Alchemy's getTokenBalances endpoint
    const tokenBalancesResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getTokenBalances',
        params: [
          address,
          [
            '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Ethereum Sepolia
            '0x779877A7B0D9E8603169DdbD7836e478b4624789' // LINK on Ethereum Sepolia (example)
          ]
        ]
      })
    });

    const tokenBalancesData = await tokenBalancesResponse.json();
    if (tokenBalancesData.error) {
      console.warn(`Alchemy token balances warning: ${tokenBalancesData.error.message}`);
    }

    // Format balances
    const balances: Balance[] = [];

    // Add ETH balance
    const ethBalanceWei = ethBalanceData.result;
    balances.push({
      asset: { symbol: 'ETH', decimals: 18 },
      amount: ethBalanceWei
    });

    // Add token balances
    if (tokenBalancesData.result && tokenBalancesData.result.tokenBalances) {
      const tokenBalances = tokenBalancesData.result.tokenBalances;
      
      for (const tokenBalance of tokenBalances) {
        if (tokenBalance.tokenBalance && tokenBalance.tokenBalance !== '0x0' && tokenBalance.tokenBalance !== '0x') {
          // Get token metadata
          try {
            const metadataResponse = await fetch(alchemyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'alchemy_getTokenMetadata',
                params: [tokenBalance.contractAddress]
              })
            });

            const metadataData = await metadataResponse.json();
            if (!metadataData.error && metadataData.result) {
              const metadata = metadataData.result;
              balances.push({
                asset: { 
                  symbol: metadata.symbol || 'UNKNOWN', 
                  decimals: metadata.decimals || 18,
                  contractAddress: tokenBalance.contractAddress
                },
                amount: tokenBalance.tokenBalance
              });
            }
          } catch (metadataError) {
            console.warn(`Failed to get metadata for token ${tokenBalance.contractAddress}:`, metadataError);
            // Add token with default values if metadata fails
            balances.push({
              asset: { 
                symbol: 'UNKNOWN', 
                decimals: 18,
                contractAddress: tokenBalance.contractAddress
              },
              amount: tokenBalance.tokenBalance
            });
          }
        }
      }
    }

    // If no USDC found, add it with 0 balance for consistency
    const hasUsdc = balances.some(b => b.asset.symbol === 'USDC');
    if (!hasUsdc) {
      balances.push({
        asset: { symbol: 'USDC', decimals: 6 },
        amount: '0'
      });
    }

    return { data: balances };
  } catch (error) {
    console.error('[CDP] Failed to get Ethereum Sepolia balances:', error);
    // Return default balances with 0 values instead of throwing
    return {
      data: [
        { asset: { symbol: 'ETH', decimals: 18 }, amount: '0' },
        { asset: { symbol: 'USDC', decimals: 6 }, amount: '0' }
      ]
    };
  }
}

/**
 * Get Solana balances including SOL and USDC SPL token
 * @param address - Wallet address
 * @param networkId - Network ID (devnet or mainnet-beta)
 * @returns Token balances
 */
async function getSolanaBalances(address: string, networkId: string) {
  try {
    const connection = new Connection(
      networkId === 'devnet' 
        ? 'https://api.devnet.solana.com' 
        : 'https://api.mainnet-beta.solana.com'
    );
    const publicKey = new PublicKey(address);

    console.log(`[CDP] Fetching Solana balances for ${address} on ${networkId}`);

    // Get SOL balance
    const solBalance = await connection.getBalance(publicKey);

    // Get SPL token accounts (including USDC)
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID,
    });

    const balances: Balance[] = [];

    // Add SOL balance
    balances.push({
      asset: { symbol: 'SOL', decimals: 9 },
      amount: solBalance.toString()
    });

    // Add SPL token balances
    for (const tokenAccount of tokenAccounts.value) {
      const accountData = tokenAccount.account.data.parsed;
      const tokenAmount = accountData.info.tokenAmount;
      const mint = accountData.info.mint;

      // Check if this is USDC (different mint addresses for devnet/mainnet)
      const usdcMints = {
        devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet mint (updated)
        mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC mainnet mint
      };

      let symbol = 'UNKNOWN';
      if (mint === usdcMints.devnet || mint === usdcMints.mainnet) {
        symbol = 'USDC';
      } else {
        // Try to get token metadata for other tokens
        try {
          // For now, we'll just use the mint address as identifier
          symbol = mint.substring(0, 8) + '...';
        } catch (e) {
          // Ignore metadata fetch errors
        }
      }

      // Include all tokens, even with 0 balance for USDC
      if (symbol === 'USDC' || (tokenAmount.uiAmount && tokenAmount.uiAmount > 0)) {
        balances.push({
          asset: { 
            symbol: symbol, 
            decimals: tokenAmount.decimals,
            mint: mint
          },
          amount: tokenAmount.amount
        });
      }
    }

    // If no USDC found, add it with 0 balance for consistency
    const hasUsdc = balances.some(b => b.asset.symbol === 'USDC');
    if (!hasUsdc) {
      balances.push({
        asset: { symbol: 'USDC', decimals: 6, mint: 'none' },
        amount: '0'
      });
    }

    return balances;
  } catch (error) {
    console.error('[CDP] Failed to get Solana balances:', error);
    throw error;
  }
}

/**
 * Transfer ETH or native token
 * @param fromAddress - Sender address
 * @param toAddress - Recipient address
 * @param amount - Amount to send (in ETH/native token)
 * @param network - Network name
 * @returns Transaction hash
 */
export async function transferNativeToken(
  fromAddress: string,
  toAddress: string,
  amount: string,
  network: string = 'base-sepolia'
) {
  try {
    console.log(`[CDP] Transferring ${amount} native tokens from ${fromAddress} to ${toAddress} on network ${network}`);
    
    // Get network configuration first to determine wallet type
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    // Get wallet from database - filter by chain type to avoid multiple rows
    const isEVM = !!networkConfig.chainId;
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('cdp_wallet_id, chain')
      .eq('address', fromAddress)
      .eq('chain', isEVM ? 'evm' : 'solana')
      .single();
    
    if (error || !wallet) {
      console.error(`[CDP] Failed to get wallet from database:`, error);
      throw error || new Error(`Wallet not found: ${fromAddress}`);
    }
    
    // Convert amount to wei (for EVM) or lamports (for Solana)
    let parsedAmount;
    if (networkConfig.chainId) {
      // EVM - convert to wei
      parsedAmount = parseUnits(amount, 18).toString();
    } else {
      // Solana - convert to lamports (1 SOL = 10^9 lamports)
      parsedAmount = (parseFloat(amount) * 1e9).toString();
    }
    
    // Send transaction
    let txHash;
    if (networkConfig.chainId) {
      // EVM transfer
      const tx = await evmClient.sendTransaction({
        address: fromAddress as `0x${string}`,
        network: networkConfig.name as any,
        transaction: {
          to: toAddress as `0x${string}`,
          value: BigInt(parsedAmount) as bigint,
        },
      });
      txHash = tx.transactionHash;
    } else {
      // Solana transfer - build and sign transaction
      const connection = new Connection(
        networkConfig.networkId === 'devnet' 
          ? 'https://api.devnet.solana.com' 
          : 'https://api.mainnet-beta.solana.com'
      );
      
      const fromPubkey = new PublicKey(fromAddress);
      const toPubkey = new PublicKey(toAddress);
      
      // Create transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: BigInt(parsedAmount),
      });
      
      // Create transaction
      const transaction = new Transaction();
      transaction.add(transferInstruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;
      
      // Sign transaction with CDP
       const signedTx = await solanaClient.signTransaction({
         address: fromAddress,
         transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
       });
       
       // Send signed transaction
       const signature = await connection.sendRawTransaction(Buffer.from(signedTx.signature, 'base64'));
      txHash = signature;
    }
    
    console.log(`[CDP] Native token transfer successful with hash: ${txHash}`);
    
    return { hash: txHash };
  } catch (error) {
    console.error(`[CDP] Failed to transfer native token:`, error);
    throw error;
  }
}

/**
 * Transfer ERC-20 or SPL token
 * @param fromAddress - Sender address
 * @param toAddress - Recipient address
 * @param tokenAddress - Token contract address
 * @param amount - Amount to send (in token units)
 * @param decimals - Token decimals
 * @param network - Network name
 * @returns Transaction hash
 */
export async function transferToken(
  fromAddress: string,
  toAddress: string,
  tokenAddress: string,
  amount: string,
  decimals: number = 18,
  network: string = 'base-sepolia'
) {
  try {
    console.log(`[CDP] Transferring ${amount} tokens (${tokenAddress}) from ${fromAddress} to ${toAddress} on network ${network}`);
    
    // Get network configuration first to determine wallet type
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    // Get wallet from database - filter by chain type to avoid multiple rows
    const isEVM = !!networkConfig.chainId;
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('cdp_wallet_id, chain')
      .eq('address', fromAddress)
      .eq('chain', isEVM ? 'evm' : 'solana')
      .single();
    
    if (error || !wallet) {
      console.error(`[CDP] Failed to get wallet from database:`, error);
      throw error || new Error(`Wallet not found: ${fromAddress}`);
    }
    
    // Convert amount to token units
    const parsedAmount = parseUnits(amount, decimals).toString();
    
    // Send transaction
    let txHash;
    if (networkConfig.chainId) {
      // ERC-20 transfer
      const tx = await evmClient.sendTransaction({
        address: fromAddress as `0x${string}`,
        network: networkConfig.name as any,
        transaction: {
          to: tokenAddress as `0x${string}`,
          data: `0xa9059cbb${toAddress.slice(2).padStart(64, '0')}${BigInt(parsedAmount).toString(16).padStart(64, '0')}` as `0x${string}`,
        },
      });
      txHash = tx.transactionHash;
    } else {
      // SPL token transfer - build and sign transaction
      const connection = new Connection(
        networkConfig.networkId === 'devnet' 
          ? 'https://api.devnet.solana.com' 
          : 'https://api.mainnet-beta.solana.com'
      );
      
      const fromPubkey = new PublicKey(fromAddress);
      const toPubkey = new PublicKey(toAddress);
      const mintPubkey = new PublicKey(tokenAddress);
      
      // Get associated token addresses
      const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
      const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, toPubkey);
      
      // Create transaction
      const transaction = new Transaction();
      
      // Check if recipient's ATA exists, if not, create it
      try {
        await getAccount(connection, toTokenAccount);
        console.log(`[CDP] Recipient ATA exists: ${toTokenAccount.toString()}`);
      } catch (error) {
        console.log(`[CDP] Recipient ATA does not exist, creating: ${toTokenAccount.toString()}`);
        // Add instruction to create the ATA
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          fromPubkey, // payer
          toTokenAccount, // ata
          toPubkey, // owner
          mintPubkey // mint
        );
        transaction.add(createATAInstruction);
      }
      
      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPubkey,
        BigInt(parsedAmount),
        [],
        TOKEN_PROGRAM_ID
      );
      
      transaction.add(transferInstruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;
      
      // Sign transaction with CDP
       const signedTx = await solanaClient.signTransaction({
         address: fromAddress,
         transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
       });
       
       // Send signed transaction
       const signature = await connection.sendRawTransaction(Buffer.from(signedTx.signature, 'base64'));
      txHash = signature;
    }
    
    console.log(`[CDP] Token transfer successful with hash: ${txHash}`);
    
    return { hash: txHash };
  } catch (error) {
    console.error(`[CDP] Failed to transfer token:`, error);
    throw error;
  }
}

/**
 * Get transaction by hash
 * @param txHash - Transaction hash
 * @param network - Network name
 * @returns Transaction information
 */
export async function getTransaction(txHash: string, network: string) {
  try {
    console.log(`[CDP] Getting transaction ${txHash} on network ${network}`);
    
    // Get network configuration
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    // For now, just return basic transaction info
    // In the future, this could query blockchain explorers or CDP APIs
    return {
      tx_hash: txHash,
      network: network,
      status: 'confirmed'
    };
  } catch (error) {
    console.error(`[CDP] Failed to get transaction:`, error);
    throw error;
  }
}

/**
 * Estimate transaction fee for a network
 * @param network - Network name
 * @param transactionType - Type of transaction ('native' or 'token')
 * @returns Estimated fee string
 */
export async function estimateTransactionFee(
  network: string,
  transactionType: 'native' | 'token' = 'native'
): Promise<string> {
  try {
    console.log(`[estimateTransactionFee] Starting estimation for network: "${network}", type: "${transactionType}"`);
    
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      console.error(`[estimateTransactionFee] Unsupported network: ${network}`);
      console.error(`[estimateTransactionFee] Available networks:`, Object.keys(SUPPORTED_NETWORKS));
      throw new Error(`Unsupported network: ${network}`);
    }

    console.log(`[estimateTransactionFee] Network config found:`, networkConfig);
    console.log(`[estimateTransactionFee] Network includes 'solana':`, network.includes('solana'));
    console.log(`[estimateTransactionFee] Network config has chainId:`, !!networkConfig.chainId);
    console.log(`[estimateTransactionFee] Network config has networkId:`, !!networkConfig.networkId);

    // Check if this is a Solana network first
    if (network.includes('solana')) {
      // Solana network - estimate SOL fee
      console.log(`[estimateTransactionFee] Processing Solana network`);
       try {
         const connection = new Connection(
           networkConfig.networkId === 'devnet' 
             ? 'https://api.devnet.solana.com' 
             : 'https://api.mainnet-beta.solana.com'
         );
         
         console.log(`[estimateTransactionFee] Solana connection created for ${networkConfig.networkId}`);
         
         // Solana fees are typically very low
         // Native transfers: ~5,000 lamports
         // Token transfers: ~10,000 lamports (may need to create ATA)
         const estimatedLamports = transactionType === 'native' ? 5000 : 10000;
         const estimatedSol = estimatedLamports / LAMPORTS_PER_SOL;
         
         const result = `~${estimatedSol.toFixed(6)} SOL`;
         console.log(`[estimateTransactionFee] Solana fee calculated: ${result} (${estimatedLamports} lamports)`);
         return result;
       } catch (error) {
         console.warn(`[estimateTransactionFee] Failed to estimate Solana fee:`, error);
         const fallback = '~0.000005 SOL';
         console.log(`[estimateTransactionFee] Returning Solana fallback: ${fallback}`);
         return fallback;
       }
    } else if (networkConfig.chainId) {
      // EVM network - estimate gas fee
      console.log(`[estimateTransactionFee] Processing EVM network with chainId: ${networkConfig.chainId}`);
      try {
        // For EVM networks, we can use a rough estimate
        // Native transfers typically cost ~21,000 gas
        // Token transfers typically cost ~65,000 gas
        const gasLimit = transactionType === 'native' ? 21000 : 65000;
        
        // Use a conservative gas price estimate (in gwei)
        // Base Sepolia typically has low gas prices
        const gasPriceGwei = 0.1; // 0.1 gwei
        const gasPriceWei = gasPriceGwei * 1e9;
        
        const estimatedFeeWei = gasLimit * gasPriceWei;
        const estimatedFeeEth = estimatedFeeWei / 1e18;
        
        const result = `~${estimatedFeeEth.toFixed(6)} ETH`;
        console.log(`[estimateTransactionFee] EVM fee calculated: ${result}`);
        return result;
      } catch (error) {
        console.warn(`[estimateTransactionFee] Failed to estimate EVM fee:`, error);
        const fallback = '~0.0001 ETH';
        console.log(`[estimateTransactionFee] Returning EVM fallback: ${fallback}`);
        return fallback;
      }
    } else {
      // Unknown network type
      console.warn(`[estimateTransactionFee] Unknown network type for: ${network}`);
      const fallback = network.includes('solana') ? '~0.000005 SOL' : '~0.0001 ETH';
      console.log(`[estimateTransactionFee] Returning unknown type fallback: ${fallback}`);
      return fallback;
    }
  } catch (error) {
    console.error(`[estimateTransactionFee] Error estimating fee:`, error);
    // Return network-appropriate fallback
    const fallback = network.includes('solana') ? '~0.000005 SOL' : '~0.0001 ETH';
    console.log(`[estimateTransactionFee] Returning error fallback: ${fallback}`);
    return fallback;
  }
}

export default {
  createWallet,
  getOrCreateCdpWallet,
  getWallet,
  getBalances,
  transferNativeToken,
  transferToken,
  getTransaction,
  estimateTransactionFee,
  formatNetworkName,
  getBlockExplorerUrl,
  SUPPORTED_NETWORKS,
};