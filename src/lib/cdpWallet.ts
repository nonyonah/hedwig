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
 * Ensures the UUID is in the correct format required by CDP API
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where x is any hex digit and y is 8, 9, a, or b
 * @param uuid UUID to validate
 * @returns A valid UUID in the required format
 */
function ensureValidUuid(uuid: string): string {
  // Check if the UUID matches the required pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  
  if (uuidPattern.test(uuid)) {
    return uuid; // UUID is already valid
  }
  
  // If not valid, generate a new one that matches the pattern
  return uuidv4();
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
      console.log(`[CDP] User ${userId} already has wallet with address: ${existingWallet}`);
      
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
        address: existingWallet,
        networkId: 'base-sepolia'
      });
      
      return { 
        address: existingWallet, 
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
    const idempotencyKey = ensureValidUuid(uuid);
    
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
    
    // First, check if user exists
    console.log(`[CDP] Checking if user ${userId} exists in database`);
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', userId)
      .single();
    
    let userUuid: string;
    
    if (userError || !existingUser) {
      console.log(`[CDP] User ${userId} does not exist, creating new user`);
      // Create user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ phone_number: userId }])
        .select('id')
        .single();
      
      if (createError || !newUser) {
        console.error(`[CDP] Error creating user:`, createError);
        throw new Error(`Failed to create user: ${createError?.message || 'Unknown error'}`);
      }
      
      userUuid = newUser.id;
      console.log(`[CDP] Created user ${userId} with UUID ${userUuid}`);
    } else {
      userUuid = existingUser.id;
      console.log(`[CDP] Found existing user ${userId} with UUID ${userUuid}`);
    }
    
    // Check if wallet already exists for this user
    console.log(`[CDP] Checking if wallet exists for user ${userId} (UUID: ${userUuid})`);
    const { data: existingWallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userUuid)
      .single();
    
    if (!walletError && existingWallet) {
      console.log(`[CDP] Wallet already exists for user ${userId}, updating`);
      // Update existing wallet
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          address,
          username: username || null,
          wallet_type: imported ? 'imported' : 'cdp',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingWallet.id);
      
      if (updateError) {
        console.error(`[CDP] Error updating wallet:`, updateError);
        throw new Error(`Failed to update wallet: ${updateError.message}`);
      }
      
      console.log(`[CDP] Successfully updated wallet for user ${userId}`);
    } else {
      console.log(`[CDP] No wallet found for user ${userId}, creating new wallet`);
      // Upsert wallet (insert or update if exists)
      const { error } = await supabase
        .from('wallets')
        .upsert([
          {
            user_id: userUuid,
            address,
            username: username || null,
            wallet_type: imported ? 'imported' : 'cdp',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ], { onConflict: 'user_id' });
      
      if (error) {
        console.error(`[CDP] Error upserting wallet:`, error);
        throw new Error(`Database error: ${error.message}`);
      }
      
      console.log(`[CDP] Successfully upserted wallet for user ${userId}`);
    }
    
    // Verify wallet was stored correctly
    console.log(`[CDP] Verifying wallet storage for user ${userId}`);
    const { data: verifyWallet, error: verifyError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userUuid)
      .single();
    
    if (verifyError || !verifyWallet) {
      console.error(`[CDP] Error verifying wallet:`, verifyError);
      throw new Error(`Failed to verify wallet storage: ${verifyError?.message || 'Wallet not found after insert/update'}`);
    }
    
    console.log(`[CDP] Successfully verified wallet storage for user ${userId} with address ${verifyWallet.address}`);
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
 * @returns Wallet address or null if not found
 */
export async function getWalletFromDb(userId: string): Promise<string | null> {
  try {
    console.log(`[CDP] Looking up wallet for user ${userId}`);
    // Import Supabase client dynamically to avoid SSR issues
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[CDP] Missing Supabase credentials');
      throw new Error('Missing Supabase credentials');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // First, get the user ID
    console.log(`[CDP] Finding user UUID for phone number ${userId}`);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', userId)
      .single();
    if (userError || !user) {
      console.log(`[CDP] User ${userId} not found in database`);
      return null;
    }
    const userUuid = user.id;
    console.log(`[CDP] Found user ${userId} with UUID ${userUuid}`);
    // Now get the wallet
    console.log(`[CDP] Looking up wallet for user UUID ${userUuid}`);
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userUuid)
      .single();
    if (walletError) {
      console.log(`[CDP] Error looking up wallet for user UUID ${userUuid}: ${walletError.message}`);
      return null;
    }
    if (!wallet) {
      console.log(`[CDP] No wallet found for user UUID ${userUuid}`);
      return null;
    }
    console.log(`[CDP] Found wallet for user UUID ${userUuid}: ${wallet.address}`);
    return wallet.address;
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