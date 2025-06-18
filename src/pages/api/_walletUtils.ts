import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database';
import { userHasWalletInDb } from '@/lib/walletDb';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or key in _walletUtils.ts');
}

// Create Supabase client
export const supabase = createClient<Database>(supabaseUrl!, supabaseKey!);

// Add wallet creation throttling functions
const WALLET_CREATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown
// Keep in-memory cache as a backup but primarily use database
const walletCreationAttempts = new Map<string, number>();

/**
 * Check if a user should be allowed to create a wallet based on recent attempts
 * @param userId The user ID to check
 * @returns True if wallet creation should be allowed, false otherwise
 */
export async function shouldAllowWalletCreation(userId: string): Promise<boolean> {
  console.log(`[WalletUtils] Checking if user ${userId} is allowed to create a wallet`);
  
  try {
    // First check database for last attempt
    const { data, error } = await supabase
      .from('wallet_creation_attempts')
      .select('last_attempt_at')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      // Handle case where table doesn't exist
      if (error.code === '42P01') { // relation does not exist
        console.warn(`[WalletUtils] Table wallet_creation_attempts does not exist. Allowing wallet creation.`);
        return true;
      }
      
      if (error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is expected for new users
        console.error(`[WalletUtils] Error checking wallet creation attempts:`, error);
      }
      
      // Fall back to in-memory if database check fails
      return checkInMemoryRateLimit(userId);
    }
    
    if (!data) {
      console.log(`[WalletUtils] No previous wallet creation attempts for user ${userId} in database`);
      return true;
    }
    
    const lastAttemptTime = new Date(data.last_attempt_at).getTime();
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptTime;
    
    if (timeSinceLastAttempt < WALLET_CREATION_COOLDOWN_MS) {
      console.log(`[WalletUtils] User ${userId} attempted to create a wallet too soon (${Math.round(timeSinceLastAttempt / 1000)}s since last attempt, cooldown is ${WALLET_CREATION_COOLDOWN_MS / 1000}s)`);
      return false;
    }

    console.log(`[WalletUtils] User ${userId} is allowed to create a wallet (${Math.round(timeSinceLastAttempt / 1000)}s since last attempt)`);
    return true;
  } catch (error) {
    console.error(`[WalletUtils] Exception checking wallet creation attempts:`, error);
    // Fall back to in-memory if database check fails
    return checkInMemoryRateLimit(userId);
  }
}

/**
 * Fallback to check rate limit in memory if database check fails
 */
function checkInMemoryRateLimit(userId: string): boolean {
  console.log(`[WalletUtils] Falling back to in-memory rate limit check for user ${userId}`);
  
  const lastAttempt = walletCreationAttempts.get(userId);
  if (!lastAttempt) {
    console.log(`[WalletUtils] No previous wallet creation attempts for user ${userId} in memory`);
    return true;
  }
  
  const now = Date.now();
  const timeSinceLastAttempt = now - lastAttempt;
  
  if (timeSinceLastAttempt < WALLET_CREATION_COOLDOWN_MS) {
    console.log(`[WalletUtils] User ${userId} attempted to create a wallet too soon (${Math.round(timeSinceLastAttempt / 1000)}s since last attempt, cooldown is ${WALLET_CREATION_COOLDOWN_MS / 1000}s)`);
    return false;
  }

  console.log(`[WalletUtils] User ${userId} is allowed to create a wallet (${Math.round(timeSinceLastAttempt / 1000)}s since last attempt)`);
  return true;
}

/**
 * Record a wallet creation attempt for a user
 * @param userId The user ID to record the attempt for
 */
export async function recordWalletCreationAttempt(userId: string): Promise<void> {
  console.log(`[WalletUtils] Recording wallet creation attempt for user ${userId}`);
  
  try {
    // Record in database
    const { error } = await supabase
      .from('wallet_creation_attempts')
      .upsert([
        { 
          user_id: userId, 
          last_attempt_at: new Date().toISOString(),
          attempt_count: 1 // We'll increment this in a future version if needed
        }
      ], { 
        onConflict: 'user_id',
        ignoreDuplicates: false
      });
    
    if (error) {
      // Handle case where table doesn't exist
      if (error.code === '42P01') { // relation does not exist
        console.warn(`[WalletUtils] Table wallet_creation_attempts does not exist. Falling back to in-memory tracking.`);
        walletCreationAttempts.set(userId, Date.now());
        return;
      }
      
      console.error(`[WalletUtils] Error recording wallet creation attempt:`, error);
      // Fall back to in-memory
      walletCreationAttempts.set(userId, Date.now());
    } else {
      console.log(`[WalletUtils] Successfully recorded wallet creation attempt for ${userId} in database`);
      // Also update in-memory for double protection
      walletCreationAttempts.set(userId, Date.now());
    }
  } catch (error) {
    console.error(`[WalletUtils] Exception recording wallet creation attempt:`, error);
    // Fall back to in-memory
    walletCreationAttempts.set(userId, Date.now());
  }
}

/**
 * Checks if a user has a wallet.
 * Returns true if wallet exists, false otherwise.
 */
export async function userHasWallet(userId: string): Promise<boolean> {
  console.log(`[WalletUtils] Checking if user ${userId} has a wallet`);
  
  try {
    // Check the database
    const hasWalletInDb = await userHasWalletInDb(userId);
    console.log(`[WalletUtils] Database wallet check for user ${userId}: ${hasWalletInDb ? 'Found' : 'Not found'}`);
    return hasWalletInDb;
  } catch (error) {
    console.error(`[WalletUtils] Error checking wallet for user ${userId}:`, error);
    return false;
  }
}

// More reliable wallet prompt tracking that persists in database between server restarts
/**
 * Tracks wallet prompts shown to users in DB
 * @param userId The user ID
 */
export async function markWalletPromptShown(userId: string): Promise<void> {
  console.log(`[WalletUtils] Marking wallet prompt as shown for user ${userId}`);
  
  try {
    // Set a flag in the database
    const { error } = await supabase
      .from('wallet_prompts')
      .upsert([
        { 
          user_id: userId, 
          prompt_shown: true,
          shown_at: new Date().toISOString() 
        }
      ]);
    
    if (error) {
      // Handle case where table doesn't exist
      if (error.code === '42P01') { // relation does not exist
        console.warn(`[WalletUtils] Table wallet_prompts does not exist. Falling back to in-memory tracking.`);
        walletPromptsShown.add(userId);
        return;
      }
      
      console.error(`[WalletUtils] Error marking prompt as shown:`, error);
      // Add to in-memory as fallback
      walletPromptsShown.add(userId);
    } else {
      console.log(`[WalletUtils] Successfully marked wallet prompt as shown for ${userId} in database`);
      // Also add to in-memory for double protection
      walletPromptsShown.add(userId);
    }
  } catch (error) {
    console.error(`[WalletUtils] Exception marking prompt as shown:`, error);
    // In-memory fallback
    walletPromptsShown.add(userId);
  }
}

// In-memory tracking of wallet prompts as fallback
const walletPromptsShown = new Set<string>();

/**
 * Checks if the wallet prompt has already been shown to the user.
 * Checks both database and in-memory storage.
 */
export async function walletPromptAlreadyShown(userId: string): Promise<boolean> {
  console.log(`[WalletUtils] Checking if wallet prompt already shown for user ${userId}`);
  
  // First check in-memory for performance
  const shownInMemory = walletPromptsShown.has(userId);
  if (shownInMemory) {
    console.log(`[WalletUtils] Wallet prompt already shown in memory for user ${userId}`);
    return true;
  }
  
  try {
    // Check the database for persistence across restarts
    const { data, error } = await supabase
      .from('wallet_prompts')
      .select('prompt_shown')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      // Handle case where table doesn't exist
      if (error.code === '42P01') { // relation does not exist
        console.warn(`[WalletUtils] Table wallet_prompts does not exist. Assuming prompt not shown.`);
        return false;
      }
      
      if (error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is expected for new users
        console.error(`[WalletUtils] Error checking if prompt shown:`, error);
      }
      return shownInMemory;
    }
    
    const shownInDb = data?.prompt_shown === true;
    if (shownInDb) {
      // Sync with in-memory for future checks
      walletPromptsShown.add(userId);
      console.log(`[WalletUtils] Wallet prompt shown found in database for user ${userId}`);
    }
    
    console.log(`[WalletUtils] Wallet prompt shown check for user ${userId}: ${shownInDb ? 'Shown' : 'Not shown'}`);
    return shownInDb;
  } catch (error) {
    console.error(`[WalletUtils] Exception checking if prompt shown:`, error);
    return shownInMemory;
  }
} 