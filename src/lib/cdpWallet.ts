/**
 * CDP Wallet Utilities
 * Handles CDP client initialization and wallet operations
 */
import { getCdpEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';

// Type for wallet data stored in database
export interface WalletData {
  user_id: string;
  address: string;
  network: string;
  wallet_type: string;
  created_at: string;
}

/**
 * Get CDP client for wallet operations
 * @returns Initialized CDP client
 */
export async function getCdpClient() {
  // Get CDP environment variables
  const { apiKeyId, apiKeySecret } = getCdpEnvironment();
  
  if (!apiKeyId || !apiKeySecret) {
    throw new Error('Missing CDP credentials (CDP_API_KEY_ID or CDP_API_KEY_SECRET)');
  }
  
  // Import CDP SDK dynamically
  const { CdpClient } = await import('@coinbase/cdp-sdk');
  
  // Initialize CDP client
  return new CdpClient({
    apiKeyId,
    apiKeySecret,
  });
}

/**
 * Get or create a wallet for a user using CDP SDK directly
 * @param userId User identifier
 * @param network Network to create wallet on (defaults to base-sepolia)
 * @returns Object containing wallet address and whether it was newly created
 */
export async function getOrCreateCdpWallet(
  userId: string, 
  network: string = 'base-sepolia'
): Promise<{ address: string; created: boolean }> {
  try {
    console.log(`[CDP] Getting or creating wallet for user: ${userId} on network: ${network}`);
    
    // First check if user already has a wallet in the database
    const existingWallet = await getWalletFromDb(userId, network);
    
    if (existingWallet) {
      console.log(`[CDP] User ${userId} already has wallet with address: ${existingWallet.address}`);
      return { address: existingWallet.address, created: false };
    }
    
    // If no existing wallet, create a new one using CDP SDK
    const cdp = await getCdpClient();
    
    // Create a deterministic name for the account based on the user ID
    // Account name must match regex "^[A-Za-z0-9][A-Za-z0-9-]{0,34}[A-Za-z0-9]$"
    const sanitizedUserId = userId.replace(/[^A-Za-z0-9-]/g, '-');
    const accountName = `hedwig${sanitizedUserId}`.substring(0, 36);
    
    // Generate a unique idempotency key
    const idempotencyKey = uuidv4();
    
    // Try to create a new account
    console.log(`[CDP] Creating EVM account for user ${userId} with name ${accountName}`);
    const account = await cdp.evm.createAccount({
      name: accountName,
      idempotencyKey
    });
    
    if (!account || !account.address) {
      throw new Error('Failed to create wallet: CDP returned empty account or address');
    }
    
    console.log(`[CDP] Created wallet for user ${userId} with address: ${account.address}`);
    
    // Store the wallet in the database
    await storeWalletInDb(userId, account.address, network);
    
    return { address: account.address, created: true };
  } catch (error) {
    console.error(`[CDP] Error creating wallet for user ${userId}:`, error);
    throw new Error(`Wallet creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Store a wallet in the database
 * @param userId User identifier
 * @param address Wallet address
 * @param network Network the wallet is on (not stored in DB)
 */
export async function storeWalletInDb(
  userId: string, 
  address: string, 
  network: string = 'base-sepolia'
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
    
    // Insert wallet into database - omitting network column
    const { error } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        address,
        wallet_type: 'cdp',
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
 * @param userId User identifier
 * @param network Network to check for wallet on (not used for filtering)
 * @returns True if user has a wallet, false otherwise
 */
export async function userHasWalletInDb(
  userId: string, 
  network: string = 'base-sepolia'
): Promise<boolean> {
  try {
    const wallet = await getWalletFromDb(userId, network);
    return !!wallet;
  } catch (error) {
    console.error(`[CDP] Error checking if user has wallet:`, error);
    return false;
  }
}

/**
 * Get a wallet from the database
 * @param userId User identifier
 * @param network Network to get wallet from (not used for filtering)
 * @returns Wallet data or null if not found
 */
export async function getWalletFromDb(
  userId: string, 
  network: string = 'base-sepolia'
): Promise<WalletData | null> {
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
    
    // Query for wallet - only filter by user_id
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
    
    // Add network to the returned data since it's expected in the WalletData interface
    const walletData = {
      ...data,
      network: network // Add default network since it's not stored in DB
    };
    
    console.log(`[CDP] Found wallet in database for user ${userId}: ${walletData.address}`);
    return walletData as WalletData;
  } catch (error) {
    console.error(`[CDP] Error getting wallet from database:`, error);
    return null;
  }
} 