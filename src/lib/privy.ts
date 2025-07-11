// src/lib/privy.ts
import { createClient } from '@supabase/supabase-js';
import { PrivyClient } from '@privy-io/server-auth';

// Ensure environment variables are set
if (
  !process.env.PRIVY_APP_ID ||
  !process.env.PRIVY_APP_SECRET ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY
) {
  throw new Error(
    'PRIVY_APP_ID, PRIVY_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PRIVY_AUTHORIZATION_PRIVATE_KEY must be set.'
  );
}

export const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
const privyApiUrl = 'https://api.privy.io/v1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const privyClient = new PrivyClient(appId, appSecret, {
  walletApi: {
    authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!,
  },
});

/**
 * Generates a Basic Auth header for server-to-server Privy API requests.
 */


/**
 * Assigns an existing Privy wallet to a user.
 * @param walletId The Privy ID of the wallet (e.g., 'so1...')
 * @param supabaseUserId The user's unique identifier from your system.
 * @returns The updated wallet object from Privy.
 */
export async function assignWalletToUser(walletId: string, supabaseUserId: string): Promise<void> {
  // Map Supabase user ID to Privy user ID
  const privyUserId = await getPrivyUserIdForSupabaseUser(supabaseUserId);
  if (!privyUserId) throw new Error(`[assignWalletToUser] No Privy user ID found for Supabase user ${supabaseUserId}`);
  try {
    // 1. Call Privy's API to update the wallet's owner
    const response = await fetch(`${privyApiUrl}/wallets/${walletId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': getPrivyServerAuthHeader(),
          'privy-app-id': appId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          owner: { user_id: `did:privy:${privyUserId}` },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[assignWalletToUser] Privy API error: ${response.status}`, errorBody);
      throw new Error(`Failed to assign wallet ${walletId} to user ${privyUserId}.`);
    }

    // 2. Update the wallet's user_id in your Supabase 'wallets' table
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ user_id: supabaseUserId, privy_user_id: privyUserId })
      .eq('privy_wallet_id', walletId);

    if (updateError) {
      console.error(`[assignWalletToUser] Supabase update error:`, updateError);
      // Note: You might want to handle this more gracefully, e.g., by reverting the Privy change
      throw new Error(`Failed to update wallet ownership in Supabase for wallet ${walletId}.`);
    }

    console.log(`Successfully assigned wallet ${walletId} to user ${supabaseUserId} (Privy ID: ${privyUserId})`);
  } catch (error) {
    console.error(`[assignWalletToUser] An error occurred:`, error);
    throw error;
  }
}

/**
 * Maps a Supabase user ID to a Privy user ID.
 * @param supabaseUserId The user's unique identifier from your system.
 * @returns The Privy user ID.
 */
export async function getPrivyUserIdForSupabaseUser(supabaseUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('privy_user_id')
    .eq('id', supabaseUserId)
    .single();

  if (error && error.code !== 'PGRST116') { // 'PGRST116' means no rows found, which is not an error here
    console.error(`[getPrivyUserIdForSupabaseUser] Error fetching user ${supabaseUserId}:`, error);
    return null;
  }

  return data?.privy_user_id || null;
}

async function _createOrUpdatePrivyUser(supabaseUserId: string, email: string) {
  let privyUser;
  try {
    privyUser = await privyClient.getUser(supabaseUserId);
  } catch (error) {
    // User not found in Privy, we will create them.
  }

  if (!privyUser) {
    console.log(`[PrivyService] User ${supabaseUserId} not found in Privy, creating now.`);
    const response = await fetch(`${privyApiUrl}/users`,
      {
        method: 'POST',
        headers: {
          'Authorization': getPrivyServerAuthHeader(),
          'privy-app-id': appId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          create_embedded_wallet: true,
          linked_accounts: [{ type: 'email', address: email }],
          user_id: supabaseUserId, // Pass the supabaseUserId as the user_id for Privy
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[PrivyService] Error creating Privy user:`, errorBody);
      throw new Error(`Failed to create privy user: ${errorBody}`);
    }

    privyUser = await response.json();

    // Update Supabase user with the new Privy ID
    const { error: supabaseError } = await supabase
      .from('users')
      .update({ privy_user_id: privyUser.id })
      .eq('id', supabaseUserId);

    if (supabaseError) {
      console.error(`[PrivyService] Error updating Supabase user with Privy ID:`, supabaseError);
      // Note: a failure here means Supabase is out of sync with Privy.
      throw supabaseError;
    }
  }

  // After creation, the user object from Privy should include an embedded wallet.
  if (!privyUser?.wallet) {
    console.error('[PrivyService] Privy user was created or found, but they do not have an embedded wallet.', privyUser);
    throw new Error('User does not have an embedded wallet.');
  }

  return privyUser;
}

/**
 * Pregenerates a Privy wallet for a user, typically upon email submission.
 * @param supabaseUserId The user's unique identifier from your system.
 */
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

  // The _createOrUpdatePrivyUser function ensures the wallet exists, so we can safely access it.
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

/**
 * Gets an existing wallet or creates a new one for a user.
 * @param supabaseUserId The user's unique identifier from your system.
 */
/**
 * Generates a short-lived access token for a given Privy user.
 * This is needed for client-side actions that require user authentication, like exporting a wallet.
 * @param privyUserId The user's Privy ID.
 * @returns A user-specific auth token.
 */
export async function getPrivyUserAuthToken(supabaseUserId: string): Promise<string> {
  const privyUserId = await getPrivyUserIdForSupabaseUser(supabaseUserId);
  if (!privyUserId) {
    const errorMessage = `Could not find Privy user ID for Supabase user ${supabaseUserId}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Generate a short-lived access token for the user
  const token = await privyClient.createAccessToken(privyUserId);
  return token;
}


// ======================================================================================
// PRIVY WALLET ACTIONS
// ======================================================================================

async function callPrivyWalletApi(supabaseUserId: string, privyWalletId: string, endpoint: string, body: object) {
  const authToken = await getPrivyUserAuthToken(supabaseUserId);
  const response = await fetch(`${privyApiUrl}/wallets/${privyWalletId}/${endpoint}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'privy-app-id': appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[callPrivyWalletApi] Privy API error on '${endpoint}': ${response.status}`, errorBody);
    throw new Error(`Failed to call ${endpoint} for wallet ${privyWalletId}.`);
  }

  return response.json();
}

export async function sendTransaction(supabaseUserId: string, privyWalletId: string, transaction: object) {
    return callPrivyWalletApi(supabaseUserId, privyWalletId, 'eth_send_transaction', {
        transaction, // EIP-1559 or legacy transaction
        chain_id: 'eip155:84532' // Base Sepolia
    });
}

export async function signPersonalMessage(supabaseUserId: string, privyWalletId: string, message: string) {
    return callPrivyWalletApi(supabaseUserId, privyWalletId, 'personal_sign', {
        message, // Hex-encoded string
    });
}

export async function signTransaction(supabaseUserId: string, privyWalletId: string, transaction: object) {
    return callPrivyWalletApi(supabaseUserId, privyWalletId, 'eth_sign_transaction', {
        transaction, // EIP-1559 or legacy transaction
        chain_id: 'eip155:84532' // Base Sepolia
    });
}

export async function signTypedDataV4(supabaseUserId: string, privyWalletId: string, data: object) {
    return callPrivyWalletApi(supabaseUserId, privyWalletId, 'eth_signTypedData_v4', {
        data, // EIP-712 typed data
    });
}


export async function getOrCreatePrivyWallet(supabaseUserId: string) {
  console.log('Inspecting privyClient:', privyClient);
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