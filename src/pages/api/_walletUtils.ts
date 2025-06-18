import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database';
import { getCachedWalletCredentials } from '@/lib/wallet';
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

/**
 * Checks if a user has a wallet.
 * Returns true if wallet exists, false otherwise.
 */
export async function userHasWallet(userId: string): Promise<boolean> {
  console.log(`[WalletUtils] Checking if user ${userId} has a wallet`);
  
  try {
    // First check the in-memory wallet cache which is our source of truth
    const cachedWallet = getCachedWalletCredentials(userId);
    if (cachedWallet) {
      console.log(`[WalletUtils] Found wallet in cache for user ${userId}`);
      return true;
    }
    
    // If not in cache, check the database
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
    
    if (error && error.code !== 'PGRST116') {
      console.error(`[WalletUtils] Error checking if prompt shown:`, error);
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