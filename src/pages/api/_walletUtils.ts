import { supabase } from '@/lib/supabaseClient';

/**
 * Checks if a user has a wallet in the database.
 * Returns true if wallet exists, false otherwise.
 */
// Simple UUID v4 validation (8-4-4-4-12 format)
function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export async function userHasWallet(userId: string): Promise<boolean> {
  // If the supplied userId is not a valid UUID, assume the user has no wallet yet
  if (!isUuid(userId)) {
    return false;
  }

  const { data, error } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('Error checking wallet:', error);
    return false;
  }
  return !!data;
}

/**
 * Marks that the wallet prompt has been shown to the user (could be in a new table or metadata).
 * For now, this is a stub for future extension.
 */
export async function markWalletPromptShown(userId: string): Promise<void> {
  // Implement if you want to persist this info (e.g. in a metadata table)
}

/**
 * Checks if the wallet prompt has already been shown to the user (stub for now).
 */
export async function walletPromptAlreadyShown(userId: string): Promise<boolean> {
  // Implement if you want to persist this info (e.g. in a metadata table)
  return false;
}
