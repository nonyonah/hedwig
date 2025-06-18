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

// In-memory tracking of wallet prompts to avoid showing multiple times
const walletPromptsShown = new Set<string>();

/**
 * Marks that the wallet prompt has been shown to the user.
 */
export async function markWalletPromptShown(userId: string): Promise<void> {
  console.log(`[WalletUtils] Marking wallet prompt as shown for user ${userId}`);
  walletPromptsShown.add(userId);
}

/**
 * Checks if the wallet prompt has already been shown to the user.
 */
export async function walletPromptAlreadyShown(userId: string): Promise<boolean> {
  const shown = walletPromptsShown.has(userId);
  console.log(`[WalletUtils] Wallet prompt shown check for user ${userId}: ${shown}`);
  return shown;
} 