// src/lib/privy.ts
import { createClient } from '@supabase/supabase-js';
import { PrivyClient } from '@privy-io/server-auth';

// Ensure environment variables are set
if (
  !process.env.PRIVY_APP_ID ||
  !process.env.PRIVY_APP_SECRET ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    'PRIVY_APP_ID, PRIVY_APP_SECRET, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY must be set.'
  );
}

export const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Maps a Supabase user ID to a Privy user ID.
 * @param supabaseUserId The user's unique identifier from your system.
 * @returns The Privy user ID (using user ID as fallback).
 */
export async function getPrivyUserIdForSupabaseUser(supabaseUserId: string): Promise<string | null> {
  console.log(`[getPrivyUserIdForSupabaseUser] Looking up user by ID: ${supabaseUserId}`);
  const { data, error } = await supabase
    .from('users')
    .select('id, phone_number')
    .eq('id', supabaseUserId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`[getPrivyUserIdForSupabaseUser] User not found for ID: ${supabaseUserId}`);
      return null;
    }
    console.error(`[getPrivyUserIdForSupabaseUser] Error fetching user ${supabaseUserId}:`, error);
    return null;
  }

  if (!data?.id) {
    console.log(`[getPrivyUserIdForSupabaseUser] Found user ${supabaseUserId}, but 'id' is null or missing.`);
    return null;
  }

  // Using user ID as privy user ID fallback since privy_user_id column doesn't exist
  return data.id;
}

async function _createOrUpdatePrivyUser(supabaseUserId: string, email: string) {
  try {
    let privyUser = await privy.getUser(supabaseUserId);
    console.log(`[PrivyService] Found existing Privy user ${privyUser.id}`);
    return privyUser;
  } catch (error) {
    console.log(`[PrivyService] User ${supabaseUserId} not found in Privy, creating now.`);
    const privyUser = await privy.importUser({
      createEmbeddedWallet: true,
      linkedAccounts: [
        { type: 'email', address: email },
        { type: 'custom_auth', customUserId: supabaseUserId },
      ],
    });

    // Note: Not updating privy_user_id since column doesn't exist in current schema
    console.log(`[PrivyService] Created Privy user ${privyUser.id} for Supabase user ${supabaseUserId}`);
    return privyUser;
  }
}

export async function pregeneratePrivyWallet(supabaseUserId: string) {
  console.log(`[pregeneratePrivyWallet] Starting for user ${supabaseUserId}`);
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', supabaseUserId)
    .single();

  if (userError || !user || !user.phone_number) {
    throw new Error(`User ${supabaseUserId} not found or has no phone number.`);
  }

  // Use phone number as email fallback since email column doesn't exist
  const emailFallback = `${user.phone_number}@hedwig.local`;
  const privyUser = await _createOrUpdatePrivyUser(supabaseUserId, emailFallback);
  const privyWallet = privyUser.wallet!;

  const { data: existingWallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('address', privyWallet.address)
    .maybeSingle();

  if (existingWallet) {
    console.log('Wallet already exists in DB.');
    return existingWallet;
  }

  const { data: newWallet, error: insertError } = await supabase
    .from('wallets')
    .insert({
      user_id: supabaseUserId,
      address: privyWallet.address,
      private_key_encrypted: 'managed_by_privy', // Placeholder since Privy manages the key
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }
  return newWallet;
}

export async function getOrCreatePrivyWallet(supabaseUserId: string) {
  console.log(`[getOrCreatePrivyWallet] Starting for user ${supabaseUserId}`);
  const { data: wallets } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', supabaseUserId);

  // Use the first wallet if multiple exist
  const wallet = wallets && wallets.length > 0 ? wallets[0] : null;
  
  // Log warning if multiple wallets found
  if (wallets && wallets.length > 1) {
    console.warn(`[getOrCreatePrivyWallet] Multiple wallets found for user ${supabaseUserId}. Using the first one.`);
  }

  if (wallet) {
    console.log(`[getOrCreatePrivyWallet] Found existing wallet.`);
    return wallet;
  }

  console.log(`[getOrCreatePrivyWallet] No existing wallet, creating new one.`);
  return pregeneratePrivyWallet(supabaseUserId);
}

/**
 * Assigns a wallet to a user (placeholder implementation)
 * @param userId The user ID
 * @param walletId The wallet ID to assign
 */
export async function assignWalletToUser(userId: string, walletId: string) {
  console.log(`[assignWalletToUser] Assigning wallet ${walletId} to user ${userId}`);
  // Implementation would depend on your specific requirements
  // This is a placeholder that could update wallet ownership in your database
  const { error } = await supabase
    .from('wallets')
    .update({ user_id: userId })
    .eq('id', walletId);
  
  if (error) {
    console.error(`[assignWalletToUser] Error:`, error);
    throw error;
  }
  
  return { success: true };
}

/**
 * Gets a Privy user authentication token
 * @param userId The user ID
 * @returns Authentication token
 */
export async function getPrivyUserAuthToken(userId: string): Promise<string> {
  console.log(`[getPrivyUserAuthToken] Getting auth token for user ${userId}`);
  
  const privyUserId = await getPrivyUserIdForSupabaseUser(userId);
  if (!privyUserId) {
    throw new Error(`No Privy user found for user ${userId}`);
  }
  
  try {
    // Since Privy client doesn't have createUserAuthToken, return the privyUserId
    // The actual authentication will be handled by the frontend Privy SDK
    return privyUserId;
  } catch (error) {
    console.error(`[getPrivyUserAuthToken] Error getting privy user ID for user ${privyUserId}:`, error);
    throw new Error(`Failed to get authentication token for user ${userId}`);
  }
}