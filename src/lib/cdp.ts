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
import { parseUnits } from 'viem';
import { loadServerEnvironment } from './serverEnv';
import { createClient } from '@supabase/supabase-js';
import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

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
  'optimism': {
    name: 'optimism',
    chainId: 10,
  },
  'arbitrum': {
    name: 'arbitrum',
    chainId: 42161,
  },
  'solana-devnet': {
    name: 'solana-devnet',
    networkId: 'devnet',
  },
  'solana': {
    name: 'solana',
    networkId: 'mainnet-beta',
  },
};

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
 * Create a new wallet
 * @param userId - User ID
 * @param network - Network name (default: 'base-sepolia')
 * @returns Created wallet information
 */
export async function createWallet(userId: string, network: string = 'base-sepolia') {
  try {
    // First check if a wallet already exists for this user and chain
    const chain = network.includes('solana') ? 'solana' : 'evm';
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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error(`[CDP] Failed to fetch user details for ${userId}:`, userError);
      throw new Error('Could not fetch user details to create a named wallet.');
    }

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

    console.log(`[CDP] Creating wallet for user ${userId} on network ${network} with name ${accountName}`);
    
    // Get network configuration
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
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
          user_id: userId,
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
          console.log(`[CDP] Wallet already exists for user ${userId} on chain ${chain}. Fetching existing wallet.`);
          const { data: existingWallet } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', userId)
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
        .eq('user_id', userId)
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
export async function getOrCreateCdpWallet(userId: string, network: string = 'base-sepolia') {
  try {
    console.log(`[CDP] Getting or creating wallet for user ${userId} on network ${network}`);
    
    // Determine the chain type based on the network
    const chain = network.includes('solana') ? 'solana' : 'evm';
    
    // Check if user already has a wallet on this chain
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
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
      const chain = network.includes('solana') ? 'solana' : 'evm';
      
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('chain', chain);
      
      if (existingWallet && existingWallet.length > 0) {
        console.log(`[CDP] Found existing wallet after creation failure. Using that instead.`);
        return existingWallet[0];
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
    console.log(`[CDP] Getting balances for wallet ${address} on network ${network}`);
    
    // Get network configuration
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
    }
    
    // Get balances based on network type
    let balances;
    if (networkConfig.chainId) {
      // Get EVM balances
      balances = await evmClient.listTokenBalances({
        address: address as `0x${string}`,
        network: networkConfig.name as any,
      });
    } else if (networkConfig.networkId) {
      // Get Solana balances - use connection directly
      const connection = new Connection(
        networkConfig.networkId === 'devnet' 
          ? 'https://api.devnet.solana.com' 
          : 'https://api.mainnet-beta.solana.com'
      );
      const publicKey = new PublicKey(address);
      const balance = await connection.getBalance(publicKey);
      balances = [{
        asset: { symbol: 'SOL', decimals: 9 },
        amount: balance.toString()
      }];
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
    
    // Get wallet from database
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('cdp_wallet_id, wallet_secret')
      .eq('address', fromAddress)
      .single();
    
    if (error || !wallet) {
      console.error(`[CDP] Failed to get wallet from database:`, error);
      throw error || new Error(`Wallet not found: ${fromAddress}`);
    }
    
    // Get network configuration
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
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
    
    console.log(`[CDP] Transfer successful with hash: ${txHash}`);
    
    // Record transaction in database
    await recordTransaction(fromAddress, toAddress, amount, txHash, network);
    
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
    
    // Get wallet from database
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('cdp_wallet_id, wallet_secret')
      .eq('address', fromAddress)
      .single();
    
    if (error || !wallet) {
      console.error(`[CDP] Failed to get wallet from database:`, error);
      throw error || new Error(`Wallet not found: ${fromAddress}`);
    }
    
    // Get network configuration
    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
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
      
      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPubkey,
        BigInt(parsedAmount),
        [],
        TOKEN_PROGRAM_ID
      );
      
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
    
    console.log(`[CDP] Token transfer successful with hash: ${txHash}`);
    
    // Record transaction in database
    await recordTransaction(fromAddress, toAddress, amount, txHash, network, tokenAddress);
    
    return { hash: txHash };
  } catch (error) {
    console.error(`[CDP] Failed to transfer token:`, error);
    throw error;
  }
}

/**
 * Record transaction in database
 * @param fromAddress - Sender address
 * @param toAddress - Recipient address
 * @param amount - Amount sent
 * @param txHash - Transaction hash
 * @param network - Network name
 * @param tokenAddress - Token address (optional)
 */
async function recordTransaction(
  fromAddress: string,
  toAddress: string,
  amount: string,
  txHash: string,
  network: string,
  tokenAddress?: string
) {
  try {
    console.log(`[CDP] Recording transaction ${txHash} in database`);
    
    const { error } = await supabase
      .from('transactions')
      .insert({
        from_address: fromAddress,
        to_address: toAddress,
        amount,
        tx_hash: txHash,
        network,
        token_address: tokenAddress,
        status: 'confirmed',
      });
    
    if (error) {
      console.error(`[CDP] Failed to record transaction in database:`, error);
    }
  } catch (error) {
    console.error(`[CDP] Failed to record transaction:`, error);
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
    
    // Get transaction from database
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('tx_hash', txHash)
      .single();
    
    if (error) {
      console.error(`[CDP] Failed to get transaction from database:`, error);
      throw error;
    }
    
    return transaction;
  } catch (error) {
    console.error(`[CDP] Failed to get transaction:`, error);
    throw error;
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
  formatNetworkName,
  SUPPORTED_NETWORKS,
};