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
 * @returns The Privy user ID.
 */
export async function getPrivyUserIdForSupabaseUser(supabaseUserId: string): Promise<string | null> {
  console.log(`[getPrivyUserIdForSupabaseUser] Looking up user by ID: ${supabaseUserId}`);
  const { data, error } = await supabase
    .from('users')
    .select('privy_user_id')
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

  if (!data?.privy_user_id) {
    console.log(`[getPrivyUserIdForSupabaseUser] Found user ${supabaseUserId}, but 'privy_user_id' is null or missing.`);
    return null;
  }

  return data.privy_user_id;
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

    const { error: supabaseError } = await supabase
      .from('users')
      .update({ privy_user_id: privyUser.id })
      .eq('id', supabaseUserId);

    if (supabaseError) {
      console.error(`[PrivyService] Error updating Supabase user with Privy ID:`, supabaseError);
      throw supabaseError;
    }
    return privyUser;
  }
}

export async function pregeneratePrivyWallet(supabaseUserId: string) {
  console.log(`[pregeneratePrivyWallet] Starting for user ${supabaseUserId}`);
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email')
    .eq('id', supabaseUserId)
    .single();

  if (userError || !user || !user.email) {
    throw new Error(`User ${supabaseUserId} not found or has no email.`);
  }

  const privyUser = await _createOrUpdatePrivyUser(supabaseUserId, user.email);
  const privyWallet = privyUser.wallet!;

  const { data: existingWallet } = await supabase
    .from('wallets')
    .select('id')
    .eq('privy_wallet_id', privyWallet.id)
    .maybeSingle();

  if (existingWallet) {
    console.log('Wallet already exists in DB.');
    return existingWallet;
  }

  const { data: newWallet, error: insertError } = await supabase
    .from('wallets')
    .insert({
      user_id: supabaseUserId,
      privy_user_id: privyUser.id,
      chain: 'base-sepolia',
      address: privyWallet.address,
      privy_wallet_id: privyWallet.id,
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
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', supabaseUserId)
    .eq('chain', 'base-sepolia')
    .maybeSingle();

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
    // Generate a proper authentication token using Privy's createUserAuthToken method
    const authToken = await privy.createUserAuthToken(privyUserId);
    return authToken;
  } catch (error) {
    console.error(`[getPrivyUserAuthToken] Error creating auth token for user ${privyUserId}:`, error);
    throw new Error(`Failed to create authentication token for user ${userId}`);
  }
}