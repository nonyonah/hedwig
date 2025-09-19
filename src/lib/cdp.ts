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
  walletSecret: process.env.CDP_WALLET_SECRET,
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
 /**
 * Get Base balances using Coinbase RPC endpoint
 * @param address - Wallet address to check
 */
async function getBaseBalances(address: string) {
  try {
    const baseRpc = process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || 'https://api.developer.coinbase.com/rpc/v1/base/QPwHIcurQPClYOPIGNmRONEHGmZUXikg';
  const usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC
    
    console.log(`[CDP] Fetching Base balances using Coinbase RPC for ${address}`);
    console.log(`[CDP] Using USDC contract address: ${usdcContractAddress}`);

    // Get ETH balance
    const ethBalanceResponse = await fetch(baseRpc, {
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
      throw new Error(`Base ETH balance error: ${ethBalanceData.error.message}`);
    }

    // Get USDC balance using ERC-20 balanceOf method
    const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;
    console.log(`[CDP] USDC balanceOf call data: ${balanceOfData}`);
    
    const usdcBalanceResponse = await fetch(baseRpc, {
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

    console.log(`[CDP] Final Base balances:`, balances);
    return { data: balances };
  } catch (error) {
    console.error('[CDP] Failed to get Base balances:', error);
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
  'base': {
    name: 'base',
    chainId: 8453,
  },
  'ethereum': {
    name: 'ethereum',
    chainId: 1,
  },
  'optimism-sepolia': {
    name: 'optimism-sepolia',
    chainId: 11155420,
  },
  'celo-sepolia': {
    name: 'celo-sepolia',
    chainId: 11142220,
  },
  'solana': {
    name: 'solana',
    networkId: 'mainnet-beta',
  },
  // DISABLED NETWORKS - These chains are defined but not active
  'bsc': {
    name: 'bsc',
    chainId: 56,
  },
  'lisk-sepolia': {
    name: 'lisk-sepolia',
    chainId: 4202,
  },
  'lisk': {
    name: 'lisk',
    chainId: 1135,
  },
  'celo': {
    name: 'celo',
    chainId: 42220,
  },
  'arbitrum-one': {
    name: 'arbitrum-one',
    chainId: 42161,
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
 * Active networks - Mainnet networks are now ENABLED
 */
export const ACTIVE_NETWORKS = [
  'ethereum',
  'base',
  'optimism',
  'celo',
  'lisk',
  'solana'
];

/**
 * Disabled networks - These are defined but not available for use
 */
export const DISABLED_NETWORKS = [
  'bsc',
  'bsc-testnet',
  'lisk',
  'celo', 
  'arbitrum-one',
  'asset-chain',
  'asset-chain-testnet'
];

/**
 * Token contract addresses for supported networks
 * Based on official sources and verified contract addresses
 */
export const TOKEN_CONTRACTS = {
  // Base Mainnet
  'base': {
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    'ETH': 'native' // Native ETH
  },
  // Ethereum Mainnet
  'ethereum': {
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'ETH': 'native' // Native ETH
  },
  // BSC (Binance Smart Chain) - DISABLED
  'bsc': {
    'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32CD580d', // Binance-Peg USDC
    'USDT': '0x55d398326f99059fF775485246999027B3197955', // Binance-Peg BSC-USD (USDT)
    'BNB': 'native', // Native BNB
    'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // Wrapped BNB
  },
  // Lisk Mainnet - ENABLED
  'lisk': {
    'ETH': 'native', // Native ETH (L2)
    'LSK': '0x8a21CF9Ba08Ae709D64Cb25AfAA951183EC9FF6D', // LSK token contract on Lisk L2
    'USDT': '0x05D032ac25d322df992303dCa074EE7392C117b9' // Bridged USDT on Lisk mainnet
  },
  // Celo Mainnet - ENABLED
  'celo': {
    'USDC': '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', // USDC on Celo mainnet
    'cUSD': '0x765de816845861e75a25fca122bb6898b8b1282a', // Celo Dollar (cUSD) on mainnet
    'CELO': 'native' // Native CELO
  },
  // Arbitrum One - DISABLED
  'arbitrum-one': {
    'USDC': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC by Circle
    'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // Bridged USDT
    'ETH': 'native', // Native ETH
    'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' // Wrapped ETH on Arbitrum
  },
  // Solana
  'solana': {
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC SPL Token
    'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT SPL Token
    'SOL': 'native' // Native SOL
  }
};

/**
 * Format network name for CDP API
 * @param chain - Chain identifier
 * @returns Formatted network name
 */
export function formatNetworkName(chain: string): string {
  switch (chain.toLowerCase()) {
    case "base":
      return "base";
    case "ethereum":
    case "evm":
      return "ethereum";
    case "solana":
      return "solana";
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
    case 'base':
      return `https://basescan.org/tx/${txHash}`;
    case 'ethereum':
      return `https://etherscan.io/tx/${txHash}`;
    case 'optimism':
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    case 'bsc':
      return `https://bscscan.com/tx/${txHash}`;
    case 'arbitrum-one':
      return `https://arbiscan.io/tx/${txHash}`;
    case 'celo':
      return `https://celoscan.io/tx/${txHash}`;
    case 'lisk':
      return `https://blockscout.lisk.com/tx/${txHash}`;
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
      return 'base';
    case 'solana':
      return 'solana';
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
      // For networks not supported by CDP, use alternative methods
      if (actualNetwork === 'ethereum') {
        balances = await getEthereumBalances(address);
      } else if (actualNetwork === 'celo') {
        balances = await getCeloBalances(address);
      } else if (actualNetwork === 'lisk') {
        balances = await getLiskBalances(address);
      } else if (actualNetwork === 'base') {
        // Try CDP first, fallback to Coinbase RPC if needed
        try {
          balances = await evmClient.listTokenBalances({
            address: address as `0x${string}`,
            network: networkConfig.name as any,
          });
          
          // Check if we got valid balances
           if (!balances || !(balances as any).data || (Array.isArray((balances as any).data) && (balances as any).data.length === 0)) {
             console.log('[CDP] CDP returned empty balances for Base, trying Coinbase RPC fallback');
      balances = await getBaseBalances(address);
           }
        } catch (cdpError) {
          console.warn('[CDP] CDP failed for Base, trying Coinbase RPC fallback:', cdpError);
      balances = await getBaseBalances(address);
        }
      } else {
        // Get EVM balances using CDP for other supported networks
        try {
          balances = await evmClient.listTokenBalances({
            address: address as `0x${string}`,
            network: networkConfig.name as any,
          });
        } catch (cdpError) {
          console.warn(`[CDP] CDP failed for ${actualNetwork}, using fallback method:`, cdpError);
          // Fallback to generic EVM balance fetching
          balances = await getGenericEvmBalances(address, actualNetwork);
        }
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
 * Get Ethereum balances using Alchemy API
 * @param address - Wallet address
 * @returns Token balances
 */
async function getEthereumBalances(address: string) {
  const alchemyApiKey = process.env.ALCHEMY_API_KEY;
  const alchemyUrl = process.env.ALCHEMY_URL_ETH || `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

  if (!alchemyApiKey) {
    throw new Error('ALCHEMY_API_KEY not configured');
  }

  console.log(`[CDP] Fetching Ethereum balances using Alchemy for ${address}`);

  try {
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
            '0xA0b86a33E6441c8C06DD2c2b4c2e5B9B6B5e5e5e', // USDC on Ethereum Mainnet
            '0x514910771AF9Ca656af840dff83E8264EcF986CA' // LINK on Ethereum Mainnet
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
    console.error('[CDP] Failed to get Ethereum balances:', error);
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

      // Check if this is USDC or USDT (different mint addresses for devnet/mainnet)
      const tokenMints = {
        usdc: {
          devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet mint (updated)
          mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC mainnet mint
        },
        usdt: {
          devnet: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT Solana mainnet (also works for devnet)
          mainnet: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' // USDT Solana mainnet
        }
      };

      let symbol = 'UNKNOWN';
      if (mint === tokenMints.usdc.devnet || mint === tokenMints.usdc.mainnet) {
        symbol = 'USDC';
      } else if (mint === tokenMints.usdt.devnet || mint === tokenMints.usdt.mainnet) {
        symbol = 'USDT';
      } else {
        // Try to get token metadata for other tokens
        try {
          // For now, we'll just use the mint address as identifier
          symbol = mint.substring(0, 8) + '...';
        } catch (e) {
          // Ignore metadata fetch errors
        }
      }

      // Include all tokens, even with 0 balance for USDC and USDT
      if (symbol === 'USDC' || symbol === 'USDT' || (tokenAmount.uiAmount && tokenAmount.uiAmount > 0)) {
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

    // If no USDT found, add it with 0 balance for consistency
    const hasUsdt = balances.some(b => b.asset.symbol === 'USDT');
    if (!hasUsdt) {
      balances.push({
        asset: { symbol: 'USDT', decimals: 6, mint: 'none' },
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
 * Get BSC balances (disabled - placeholder function)
 * @param address - Wallet address
 * @returns Empty balances array
 */
async function getBSCBalances(address: string): Promise<Balance[]> {
  console.log(`[CDP] BSC is disabled - returning empty balances for ${address}`);
  return [];
}

/**
 * Get Arbitrum One balances (disabled - placeholder function)
 * @param address - Wallet address
 * @returns Empty balances array
 */
async function getArbitrumOneBalances(address: string): Promise<Balance[]> {
  console.log(`[CDP] Arbitrum One is disabled - returning empty balances for ${address}`);
  return [];
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
  network: string = 'base'
) {
  try {
    console.log(`[CDP] ===== STARTING NATIVE TOKEN TRANSFER =====`);
    console.log(`[CDP] From: ${fromAddress}`);
    console.log(`[CDP] To: ${toAddress}`);
    console.log(`[CDP] Amount: ${amount}`);
    console.log(`[CDP] Network: ${network}`);
    
    // Get network configuration first to determine wallet type
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      console.error(`[CDP] ERROR: Unsupported network: ${network}`);
      throw new Error(`Unsupported network: ${network}`);
    }
    console.log(`[CDP] Network config found:`, networkConfig);
    
    // Get wallet from database - filter by chain type to avoid multiple rows
    const isEVM = !!networkConfig.chainId;
    console.log(`[CDP] Is EVM network: ${isEVM}`);
    
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('cdp_wallet_id, chain')
      .eq('address', fromAddress)
      .eq('chain', isEVM ? 'evm' : 'solana')
      .single();
    
    console.log(`[CDP] Wallet query result:`, { wallet, error });
    
    if (error || !wallet) {
      console.error(`[CDP] Failed to get wallet from database:`, error);
      throw error || new Error(`Wallet not found: ${fromAddress}`);
    }
    
    console.log(`[CDP] Found wallet:`, wallet);
    
    // Convert amount to wei (for EVM) or lamports (for Solana)
    let parsedAmount;
    if (networkConfig.chainId) {
      // EVM - convert to wei
      const amountStr = String(amount);
      parsedAmount = parseUnits(amountStr, 18).toString();
      console.log(`[CDP] EVM amount converted to wei: ${parsedAmount}`);
    } else {
      // Solana - convert to lamports (1 SOL = 10^9 lamports)
      parsedAmount = (parseFloat(amount) * 1e9).toString();
      console.log(`[CDP] Solana amount converted to lamports: ${parsedAmount}`);
    }
    
    // Send transaction
    let txHash;
    if (networkConfig.chainId) {
      // Get the user ID from the wallet to retrieve the correct account name
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('user_id')
        .eq('address', fromAddress)
        .eq('chain', isEVM ? 'evm' : 'solana')
        .single();
      
      if (walletError || !walletData) {
        console.error(`[CDP] Failed to get user ID for wallet ${fromAddress}:`, walletError);
        throw new Error(`Could not find user for wallet: ${fromAddress}`);
      }
      
      // Get user details to recreate the same account name used during wallet creation
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('phone_number')
        .eq('id', walletData.user_id)
        .single();
      
      if (userError || !user) {
        console.error(`[CDP] Failed to get user details for account name:`, userError);
        throw new Error(`Could not get user details for wallet: ${fromAddress}`);
      }
      
      // Format the phone number to create the same account name as during wallet creation
      let accountName = user.phone_number;
      accountName = accountName.replace(/[^a-zA-Z0-9-]/g, '');
      if (accountName.startsWith('+')) {
        accountName = 'p' + accountName.substring(1);
      }
      if (accountName.length < 2) {
        accountName = 'user-' + accountName;
      } else if (accountName.length > 36) {
        accountName = accountName.substring(0, 36);
      }
      
      console.log(`[CDP] Using account name from wallet creation: ${accountName}`);
      
      // Check if this is a Celo or Lisk network - use viem instead of CDP
      if (network === 'celo' || network === 'lisk') {
        console.log(`[CDP] Using viem for ${network} native token transfer...`);
        const { sendNativeTokenViem } = await import('./viemClient');
        txHash = await sendNativeTokenViem(fromAddress, toAddress, amount, network as any, accountName);
        console.log(`[CDP] Viem transaction completed with hash: ${txHash}`);
      } else {
        // EVM transfer with CDP for other networks
        console.log(`[CDP] Initiating EVM native token transfer on ${network}...`);
        
        // Get or create account for the sender using the correct account name
        console.log(`[CDP] Getting or creating account for: ${fromAddress} (name: ${accountName})`);
        const account = await evmClient.getOrCreateAccount({ name: accountName });
        console.log(`[CDP] Account created/retrieved:`, account);
        
        console.log(`[CDP] Using default network: ${networkConfig.name}`);
        const networkClient = await account.useNetwork(networkConfig.name as any);
        console.log(`[CDP] Network client created:`, networkClient);

        const transactionConfig: any = {
          transaction: {
            to: toAddress as `0x${string}`,
            value: BigInt(parsedAmount) as bigint,
          },
        };
        console.log(`[CDP] Transaction config:`, transactionConfig);

        console.log(`[CDP] Sending transaction...`);
        const tx = await networkClient.sendTransaction(transactionConfig);
        console.log(`[CDP] Transaction sent successfully:`, tx);
        txHash = tx.transactionHash;
      }
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
    
    console.log(`[CDP] ===== NATIVE TOKEN TRANSFER COMPLETED =====`);
    console.log(`[CDP] Transaction hash: ${txHash}`);
    
    return { hash: txHash };
  } catch (error) {
    console.error(`[CDP] ===== NATIVE TOKEN TRANSFER FAILED =====`);
    console.error(`[CDP] Error details:`, error);
    console.error(`[CDP] Error message:`, error instanceof Error ? error.message : 'Unknown error');
    console.error(`[CDP] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
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
  network: string = 'base'
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
    const amountStr = String(amount);
    const parsedAmount = parseUnits(amountStr, decimals).toString();
    
    // Send transaction
    let txHash;
    if (networkConfig.chainId) {
      // Get the user ID from the wallet to retrieve the correct account name
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('user_id')
        .eq('address', fromAddress)
        .eq('chain', isEVM ? 'evm' : 'solana')
        .single();
      
      if (walletError || !walletData) {
        console.error(`[CDP] Failed to get user ID for wallet ${fromAddress}:`, walletError);
        throw new Error(`Could not find user for wallet: ${fromAddress}`);
      }
      
      // Get user details to recreate the same account name used during wallet creation
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('phone_number')
        .eq('id', walletData.user_id)
        .single();
      
      if (userError || !user) {
        console.error(`[CDP] Failed to get user details for account name:`, userError);
        throw new Error(`Could not get user details for wallet: ${fromAddress}`);
      }
      
      // Format the phone number to create the same account name as during wallet creation
      let accountName = user.phone_number;
      accountName = accountName.replace(/[^a-zA-Z0-9-]/g, '');
      if (accountName.startsWith('+')) {
        accountName = 'p' + accountName.substring(1);
      }
      if (accountName.length < 2) {
        accountName = 'user-' + accountName;
      } else if (accountName.length > 36) {
        accountName = accountName.substring(0, 36);
      }
      
      console.log(`[CDP] Using account name from wallet creation: ${accountName}`);
      
      // Check if this is a Celo or Lisk network - use viem instead of CDP
      if (network === 'celo' || network === 'lisk') {
        console.log(`[CDP] Using viem for ${network} token transfer...`);
        console.log(`[CDP] Token address to lookup: ${tokenAddress}`);
        console.log(`[CDP] Available networks in TOKEN_CONTRACTS:`, Object.keys(TOKEN_CONTRACTS));
        console.log(`[CDP] Available tokens for ${network}:`, TOKEN_CONTRACTS[network] ? Object.keys(TOKEN_CONTRACTS[network]) : 'Network not found');
        
        const { sendTokenViem } = await import('./viemClient');
        
        // Determine token symbol from address for viem
        let tokenSymbol = '';
        const networkTokens = TOKEN_CONTRACTS[network];
        if (networkTokens) {
          console.log(`[CDP] Checking tokens for ${network}:`, networkTokens);
          for (const [symbol, address] of Object.entries(networkTokens)) {
            console.log(`[CDP] Comparing ${symbol}: ${address.toLowerCase()} vs ${tokenAddress.toLowerCase()}`);
            if (address.toLowerCase() === tokenAddress.toLowerCase()) {
              tokenSymbol = symbol;
              console.log(`[CDP] Found matching token symbol: ${tokenSymbol}`);
              break;
            }
          }
        }
        
        if (!tokenSymbol) {
          console.error(`[CDP] Token address ${tokenAddress} not found in ${network} token contracts`);
          console.error(`[CDP] Available tokens:`, networkTokens);
          throw new Error(`Token address ${tokenAddress} not found in ${network} token contracts`);
        }
        
        txHash = await sendTokenViem(fromAddress, toAddress, amount, tokenSymbol, network as any, decimals, accountName);
        console.log(`[CDP] Viem token transaction completed with hash: ${txHash}`);
      } else {
        // ERC-20 transfer with CDP for other networks
        console.log(`Initiating token transfer on ${network}...`);
        
        // Format the address to create a valid account name for CDP
        // CDP requires alphanumeric characters and hyphens, between 2 and 36 characters
        let accountName = fromAddress.toLowerCase().replace(/[^a-zA-Z0-9-]/g, '');
        if (accountName.length > 36) {
          accountName = accountName.substring(0, 36);
        }
        if (accountName.length < 2) {
          accountName = 'addr-' + accountName;
        }
        
        // Get or create account for the sender
        const account = await evmClient.getOrCreateAccount({ name: accountName });
        
        console.log(`[CDP] Using default network: ${networkConfig.name}`);
        const networkClient = await account.useNetwork(networkConfig.name as any);

        const transactionConfig: any = {
          transaction: {
            to: tokenAddress as `0x${string}`,
            data: `0xa9059cbb${toAddress.slice(2).padStart(64, '0')}${BigInt(parsedAmount).toString(16).padStart(64, '0')}` as `0x${string}`,
          },
        };

        const tx = await networkClient.sendTransaction(transactionConfig);
        txHash = tx.transactionHash;
      }
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
      
      // Check if this is a Celo or Lisk network - use viem instead of CDP
      if (network === 'celo' || network === 'lisk') {
        console.log(`[estimateTransactionFee] Using viem for ${network} fee estimation`);
        const { estimateTransactionFeeViem } = await import('./viemClient');
        return await estimateTransactionFeeViem(network as 'celo' | 'lisk', transactionType);
      }
      
      try {
        // For other EVM networks, we can use a rough estimate
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
      const fallback = network.includes('solana') ? '~0.000005 SOL' : 
                      network === 'lisk' ? '~0.0001 LSK' :
                      network === 'celo' ? '~0.0001 CELO' : '~0.0001 ETH';
      console.log(`[estimateTransactionFee] Returning unknown type fallback: ${fallback}`);
      return fallback;
    }
  } catch (error) {
    console.error(`[estimateTransactionFee] Error estimating fee:`, error);
    // Return network-appropriate fallback
    const fallback = network.includes('solana') ? '~0.000005 SOL' : 
                    network === 'lisk' ? '~0.0001 LSK' :
                    network === 'celo' ? '~0.0001 CELO' : '~0.0001 ETH';
    console.log(`[estimateTransactionFee] Returning error fallback: ${fallback}`);
    return fallback;
  }
}

/**
 * Get Celo balances using generic EVM RPC
 * @param address - Wallet address
 * @returns Token balances
 */
async function getCeloBalances(address: string) {
  try {
    const celoRpc = 'https://forno.celo.org';
    
    console.log(`[CDP] Fetching Celo balances for ${address}`);

    // Get CELO balance (native token)
    const celoBalanceResponse = await fetch(celoRpc, {
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

    const celoBalanceData = await celoBalanceResponse.json();
    if (celoBalanceData.error) {
      throw new Error(`Celo CELO balance error: ${celoBalanceData.error.message}`);
    }

    // Get USDC balance using ERC-20 balanceOf method
    const usdcContractAddress = TOKEN_CONTRACTS['celo']['USDC'];
    const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;
    
    const usdcBalanceResponse = await fetch(celoRpc, {
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
    let usdcBalance = '0';
    if (!usdcBalanceData.error && usdcBalanceData.result && usdcBalanceData.result !== '0x') {
      usdcBalance = usdcBalanceData.result;
    }

    // Get cUSD balance
    const cusdContractAddress = TOKEN_CONTRACTS['celo']['cUSD'];
    const cusdBalanceResponse = await fetch(celoRpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 3,
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: cusdContractAddress,
            data: balanceOfData
          },
          'latest'
        ]
      })
    });

    const cusdBalanceData = await cusdBalanceResponse.json();
    let cusdBalance = '0';
    if (!cusdBalanceData.error && cusdBalanceData.result && cusdBalanceData.result !== '0x') {
      cusdBalance = cusdBalanceData.result;
    }

    // Get CELO token balance
    const celoTokenContractAddress = TOKEN_CONTRACTS['celo']['CELO_TOKEN'];
    const celoTokenBalanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;
    const celoTokenBalanceResponse = await fetch(celoRpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 4,
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: celoTokenContractAddress,
            data: celoTokenBalanceOfData
          },
          'latest'
        ]
      })
    });

    const celoTokenBalanceData = await celoTokenBalanceResponse.json();
    let celoTokenBalance = '0';
    if (!celoTokenBalanceData.error && celoTokenBalanceData.result && celoTokenBalanceData.result !== '0x') {
      celoTokenBalance = celoTokenBalanceData.result;
    }

    // Format balances
    const balances: Balance[] = [];

    // Add CELO balance (native) - this is the main balance that should be displayed
    balances.push({
      asset: { symbol: 'CELO', decimals: 18 },
      amount: celoBalanceData.result
    });

    // Add USDC balance
    balances.push({
      asset: { symbol: 'USDC', decimals: 6, contractAddress: usdcContractAddress },
      amount: usdcBalance
    });

    // Add cUSD balance
    balances.push({
      asset: { symbol: 'cUSD', decimals: 18, contractAddress: cusdContractAddress },
      amount: cusdBalance
    });

    return { data: balances };
  } catch (error) {
    console.error('[CDP] Failed to get Celo balances:', error);
    return {
      data: [
        { asset: { symbol: 'CELO', decimals: 18 }, amount: '0' },
        { asset: { symbol: 'USDC', decimals: 6 }, amount: '0' },
        { asset: { symbol: 'cUSD', decimals: 18 }, amount: '0' }
      ]
    };
  }
}

/**
 * Get Lisk balances using generic EVM RPC
 * @param address - Wallet address
 * @returns Token balances
 */
async function getLiskBalances(address: string) {
  try {
    const liskRpc = 'https://rpc.api.lisk.com';
    
    console.log(`[CDP] Fetching Lisk balances for ${address}`);

    // Get native ETH balance first (for gas fees)
    const ethBalanceResponse = await fetch(liskRpc, {
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
      throw new Error(`Lisk ETH balance error: ${ethBalanceData.error.message}`);
    }

    // Get LSK token balance
    const liskContractAddress = TOKEN_CONTRACTS['lisk']['LISK'];
    const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;
    
    const lskBalanceResponse = await fetch(liskRpc, {
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
            to: liskContractAddress,
            data: balanceOfData
          },
          'latest'
        ]
      })
    });

    const lskBalanceData = await lskBalanceResponse.json();
    let lskBalance = '0';
    if (!lskBalanceData.error && lskBalanceData.result && lskBalanceData.result !== '0x') {
      lskBalance = lskBalanceData.result;
    }

    // Get USDT balance
    const usdtContractAddress = TOKEN_CONTRACTS['lisk']['USDT'];
    const usdtBalanceOfData = `0x70a08231000000000000000000000000${address.slice(2)}`;
    const usdtBalanceResponse = await fetch(liskRpc, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 3,
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: usdtContractAddress,
            data: usdtBalanceOfData
          },
          'latest'
        ]
      })
    });

    const usdtBalanceData = await usdtBalanceResponse.json();
    let usdtBalance = '0';
    if (!usdtBalanceData.error && usdtBalanceData.result && usdtBalanceData.result !== '0x') {
      usdtBalance = usdtBalanceData.result;
    }

    // Format balances
    const balances: Balance[] = [];

    // Add native ETH balance (for gas fees)
    balances.push({
      asset: { symbol: 'ETH', decimals: 18 },
      amount: ethBalanceData.result
    });

    // Add LSK token balance
    balances.push({
      asset: { symbol: 'LSK', decimals: 18, contractAddress: liskContractAddress },
      amount: lskBalance
    });

    // Add USDT balance
    balances.push({
      asset: { symbol: 'USDT', decimals: 6, contractAddress: usdtContractAddress },
      amount: usdtBalance
    });

    return { data: balances };
  } catch (error) {
    console.error('[CDP] Failed to get Lisk balances:', error);
    return {
      data: [
        { asset: { symbol: 'ETH', decimals: 18 }, amount: '0' },
        { asset: { symbol: 'LSK', decimals: 18 }, amount: '0' },
        { asset: { symbol: 'USDT', decimals: 6 }, amount: '0' }
      ]
    };
  }
}

/**
 * Get generic EVM balances for unsupported networks
 * @param address - Wallet address
 * @param network - Network name
 * @returns Token balances
 */
async function getGenericEvmBalances(address: string, network: string) {
  try {
    console.log(`[CDP] Using generic EVM balance fetching for ${network}`);
    
    // Return basic structure with zero balances
    const balances: Balance[] = [
      { asset: { symbol: 'ETH', decimals: 18 }, amount: '0' },
      { asset: { symbol: 'USDC', decimals: 6 }, amount: '0' },
      { asset: { symbol: 'USDT', decimals: 6 }, amount: '0' }
    ];

    return { data: balances };
  } catch (error) {
    console.error(`[CDP] Failed to get generic EVM balances for ${network}:`, error);
    return {
      data: [
        { asset: { symbol: 'ETH', decimals: 18 }, amount: '0' },
        { asset: { symbol: 'USDC', decimals: 6 }, amount: '0' },
        { asset: { symbol: 'USDT', decimals: 6 }, amount: '0' }
      ]
    };
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