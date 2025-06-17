import { supabase } from '@/lib/supabaseClient';
import { getCachedWalletCredentials } from '@/lib/wallet';

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
    
    // If not in cache, check the database as fallback
    // Note: This is a fallback and may be removed in the future
    const { data, error } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
      
    if (error) {
      console.error('[WalletUtils] Error checking wallet in database:', error);
      return false;
    }
    
    const hasWallet = !!data;
    console.log(`[WalletUtils] Database wallet check for user ${userId}: ${hasWallet ? 'Found' : 'Not found'}`);
    return hasWallet;
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
