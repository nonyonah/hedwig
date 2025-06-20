/**
 * CDP Wallet Utilities
 * Handles wallet operations using AgentKit's CdpV2EvmWalletProvider
 */
import { getCdpEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import { CdpV2EvmWalletProvider } from '@coinbase/agentkit';

// Type for wallet data stored in database
export interface WalletData {
  user_id: string;
  address: string;
  username?: string;
  wallet_type: string;
  created_at: string;
}

/**
 * Get or create a wallet for a user using AgentKit's CdpV2EvmWalletProvider
 * @param userId User identifier (phone number)
 * @param username User's WhatsApp name
 * @param importedAddress Optional address to import (if user is importing a wallet)
 * @returns Object containing wallet address and whether it was newly created
 */
export async function getOrCreateWallet(
  userId: string, 
  username?: string,
  importedAddress?: string
): Promise<{ address: string; created: boolean; provider: CdpV2EvmWalletProvider }> {
  try {
    console.log(`[CDP] Getting or creating wallet for user: ${userId}${username ? ` (${username})` : ''}`);
    
    // First check if user already has a wallet in the database
    const existingWallet = await getWalletFromDb(userId);
    
    if (existingWallet) {
      console.log(`[CDP] User ${userId} already has wallet with address: ${existingWallet.address}`);
      
      // Get CDP environment variables
      const { apiKeyId, apiKeySecret, walletSecret } = getCdpEnvironment();
      
      if (!apiKeyId || !apiKeySecret || !walletSecret) {
        throw new Error('Missing CDP credentials (CDP_API_KEY_ID, CDP_API_KEY_SECRET, or CDP_WALLET_SECRET)');
      }
      
      // Configure wallet provider with existing wallet address
      const provider = await CdpV2EvmWalletProvider.configureWithWallet({
        apiKeyId,
        apiKeySecret,
        walletSecret,
        address: existingWallet.address,
        networkId: 'base-sepolia'
      });
      
      return { 
        address: existingWallet.address, 
        created: false,
        provider
      };
    }
    
    // If importing a wallet, use that address
    if (importedAddress) {
      console.log(`[CDP] Importing wallet with address: ${importedAddress} for user ${userId}`);
      
      // Get CDP environment variables
      const { apiKeyId, apiKeySecret, walletSecret } = getCdpEnvironment();
      
      if (!apiKeyId || !apiKeySecret || !walletSecret) {
        throw new Error('Missing CDP credentials');
      }
      
      // Configure wallet provider with imported address
      const provider = await CdpV2EvmWalletProvider.configureWithWallet({
        apiKeyId,
        apiKeySecret,
        walletSecret,
        address: importedAddress,
        networkId: 'base-sepolia'
      });
      
      // Verify the address
      const verifiedAddress = await provider.getAddress();
      
      if (verifiedAddress.toLowerCase() !== importedAddress.toLowerCase()) {
        throw new Error('Imported wallet address verification failed');
      }
      
      // Store the wallet in the database
      await storeWalletInDb(userId, verifiedAddress, username, true);
      
      return { 
        address: verifiedAddress, 
        created: true,
        provider
      };
    }
    
    // If no existing wallet and not importing, create a new one
    // Get CDP environment variables
    const { apiKeyId, apiKeySecret, walletSecret } = getCdpEnvironment();
    
    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      throw new Error('Missing CDP credentials');
    }
    
    // Generate a UUID that matches the required format pattern
    // The format must be: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where x is any hex digit and y is 8, 9, a, or b
    const uuid = uuidv4();
    const idempotencyKey = uuid;
    
    console.log(`[CDP] Creating new wallet for user ${userId} with idempotency key: ${idempotencyKey}`);
    
    // Create wallet provider with idempotency key to create a new wallet
    const provider = await CdpV2EvmWalletProvider.configureWithWallet({
      apiKeyId,
      apiKeySecret,
      walletSecret,
      idempotencyKey,
      networkId: 'base-sepolia'
    });
    
    // Get the address of the new wallet
    const address = await provider.getAddress();
    
    console.log(`[CDP] Created wallet for user ${userId} with address: ${address}`);
    
    // Store the wallet in the database
    await storeWalletInDb(userId, address, username);
    
    return { 
      address, 
      created: true,
      provider
    };
  } catch (error) {
    console.error(`[CDP] Error creating wallet for user ${userId}:`, error);
    throw new Error(`Wallet creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Store a wallet in the database
 * @param userId User identifier (phone number)
 * @param address Wallet address
 * @param username User's WhatsApp name
 * @param imported Whether the wallet was imported
 */
export async function storeWalletInDb(
  userId: string, 
  address: string,
  username?: string,
  imported: boolean = false
): Promise<void> {
  try {
    console.log(`[CDP] Storing wallet in database for user ${userId} with address ${address}`);
    
    // Import Supabase client dynamically to avoid SSR issues
    const { createClient } = await import('@supabase/supabase-js');
    
    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user exists, create if it doesn't
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', userId)
      .single();
      
    if (!existingUser) {
      console.log(`[CDP] User ${userId} doesn't exist, creating new user`);
      const { error: userError } = await supabase
        .from('users')
        .insert({
          phone_number: userId
        });
        
      if (userError) {
        console.error(`[CDP] Error creating user:`, userError);
        throw new Error(`Failed to create user: ${userError.message}`);
      }
    }
    
    // Get the user ID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', userId)
      .single();
      
    if (!user) {
      throw new Error(`Failed to find or create user with phone number ${userId}`);
    }
    
    // Insert wallet into database
    const { error } = await supabase
      .from('wallets')
      .insert({
        user_id: user.id,
        address,
        username: username || null,
        wallet_type: imported ? 'imported' : 'cdp',
        created_at: new Date().toISOString()
      });
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
    
    console.log(`[CDP] Successfully stored wallet in database for user ${userId}`);
  } catch (error) {
    console.error(`[CDP] Error storing wallet in database:`, error);
    throw new Error(`Failed to store wallet: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if a user has a wallet in the database
 * @param userId User identifier (phone number)
 * @returns True if user has a wallet, false otherwise
 */
export async function userHasWalletInDb(userId: string): Promise<boolean> {
  try {
    const wallet = await getWalletFromDb(userId);
    return !!wallet;
  } catch (error) {
    console.error(`[CDP] Error checking if user has wallet:`, error);
    return false;
  }
}

/**
 * Get a wallet from the database
 * @param userId User identifier (phone number)
 * @returns Wallet data or null if not found
 */
export async function getWalletFromDb(userId: string): Promise<WalletData | null> {
  try {
    console.log(`[CDP] Getting wallet from database for user ${userId}`);
    
    // Import Supabase client dynamically to avoid SSR issues
    const { createClient } = await import('@supabase/supabase-js');
    
    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Query for wallet
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is expected
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!data) {
      console.log(`[CDP] No wallet found in database for user ${userId}`);
      return null;
    }
    
    console.log(`[CDP] Found wallet in database for user ${userId}: ${data.address}`);
    return data as WalletData;
  } catch (error) {
    console.error(`[CDP] Error getting wallet from database:`, error);
    return null;
  }
}

/**
 * Get wallet balance
 * @param address Wallet address
 * @returns Balance in ETH
 */
export async function getWalletBalance(address: string): Promise<string> {
  try {
    console.log(`[CDP] Getting balance for wallet: ${address}`);
    
    // Use ethers.js to get balance
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
    
    const balanceWei = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balanceWei);
    
    console.log(`[CDP] Balance for wallet ${address}: ${balanceEth} ETH`);
    
    return balanceEth;
  } catch (error) {
    console.error(`[CDP] Error getting wallet balance:`, error);
    throw new Error(`Failed to get wallet balance: ${error instanceof Error ? error.message : String(error)}`);
  }
}