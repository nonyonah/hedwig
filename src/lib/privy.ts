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

const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
const privyApiUrl = 'https://api.privy.io/v1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const privyClient = new PrivyClient(appId, appSecret);

/**
 * Generates a Basic Auth header for server-to-server Privy API requests.
 */
export function getPrivyServerAuthHeader() {
  const encoded = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Generates a Bearer token for authenticating as a specific Privy user.
 * @param userId The Privy user ID (did).
 */
export async function getPrivyUserAuthToken(userId: string) {
  // Fetch user from Supabase to get phone number for test token
  const { data: user, error } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', userId)
    .single();

  if (error || !user || !user.phone_number) {
    const errorMessage = `Could not find user ${userId} or their phone number to get auth token`;
    console.error(errorMessage, error);
    throw new Error(errorMessage);
  }

  // FIXME: Using `getTestAccessToken` as suggested by linter. Review for production.
  return privyClient.getTestAccessToken({ phoneNumber: user.phone_number });
}

/**
 * Sends a transaction on behalf of a user using their Privy wallet.
 * This function is called from actions.ts to execute the swap.
 */
export async function sendTransaction(
  userId: string,
  walletAddress: string,
  transactionRequest: {
    to: string;
    chainId: number;
    data: string;
    value: string;
  }
): Promise<string> {
  console.log(`Sending transaction for user ${userId} from wallet ${walletAddress}`);
  
  const authToken = await getPrivyUserAuthToken(userId);

  const res = await fetch(`${privyApiUrl}/wallets/${walletAddress}/send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'privy-app-id': appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transactionRequest),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Privy sendTransaction failed:', errorText);
    throw new Error(`Privy sendTransaction failed: ${errorText}`);
  }

  const data = await res.json();
  console.log('Privy sendTransaction successful:', data);
  return data.tx_hash;
}

/**
 * Assigns an existing Privy wallet to a user.
 * @param walletId The Privy ID of the wallet (e.g., 'so1...')
 * @param userId The user's unique identifier from your system.
 * @returns The updated wallet object from Privy.
 */
export async function assignWalletToUser(walletId: string, userId: string) {
  console.log(`[assignWalletToUser] Assigning wallet ${walletId} to user ${userId}`);

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
          user_id: userId,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[assignWalletToUser] Privy API request failed:', response.status, errorBody);
      throw new Error(`Failed to assign wallet: ${errorBody}`);
    }

    const updatedPrivyWallet = await response.json();
    console.log(`[assignWalletToUser] Successfully assigned wallet in Privy to user ${userId}`);

    // 2. Update the wallet record in Supabase to reflect the new owner
    const { data: updatedSupabaseWallet, error: updateError } = await supabase
      .from('wallets')
      .update({ user_id: userId, privy_user_id: updatedPrivyWallet.user_id })
      .eq('privy_wallet_id', walletId)
      .select()
      .single();

    if (updateError) {
      console.error('[assignWalletToUser] Error updating wallet in Supabase:', updateError);
      // Note: The wallet was updated in Privy, but Supabase failed to sync.
      // This may require manual correction.
      throw updateError;
    }

    console.log(`[assignWalletToUser] Successfully updated wallet ${updatedSupabaseWallet.address} in Supabase for user ${userId}`);
    return updatedSupabaseWallet;

  } catch (error) {
    console.error(`[assignWalletToUser] An error occurred:`, error);
    throw error;
  }
}

export async function pregeneratePrivyWallet(userId: string) {
  console.log(`[pregeneratePrivyWallet] Starting wallet pre-generation for user ${userId}`);

  try {
    // 1. Check if a wallet already exists in Supabase to prevent duplicates
    const { data: existingWallet, error: existingWalletError } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .eq('chain', 'base-sepolia')
      .maybeSingle();

    if (existingWalletError && existingWalletError.code !== 'PGRST116') { // Ignore 'not found' error
      console.error('[pregeneratePrivyWallet] Error checking for existing wallet:', existingWalletError);
      throw existingWalletError;
    }

    if (existingWallet) {
      console.log(`[pregeneratePrivyWallet] Wallet already exists for user ${userId}. Skipping creation.`);
      return existingWallet;
    }

    // 2. Call Privy's API to pre-generate the wallet
    const response = await fetch(`${privyApiUrl}/wallets`, {
      method: 'POST',
      headers: {
        'Authorization': getPrivyServerAuthHeader(),
        'privy-app-id': appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        create_embedded_wallet: true,
        chain_id: 'eip155:84532', // Base Sepolia Chain ID
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[pregeneratePrivyWallet] Privy API request failed:', response.status, errorBody);
      throw new Error(`Failed to pre-generate wallet: ${errorBody}`);
    }

    const privyWallet = await response.json();
    console.log('[pregeneratePrivyWallet] Successfully pre-generated wallet:', privyWallet.address);

    // 3. Store the new wallet in Supabase
    const { data: newWallet, error: storeError } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        address: privyWallet.address,
        chain: 'base-sepolia',
        privy_wallet_id: privyWallet.id,
        privy_user_id: privyWallet.user_id,
      })
      .select()
      .single();

    if (storeError) {
      console.error('[pregeneratePrivyWallet] Error storing new wallet in Supabase:', storeError);
      throw storeError;
    }

    // 4. Update the user's record with their Privy user ID
    await supabase.from('users').update({ privy_user_id: privyWallet.user_id }).eq('id', userId);

    console.log(`[pregeneratePrivyWallet] Successfully stored new wallet ${newWallet.address} for user ${userId}`);
    return newWallet;
  } catch (error) {
    console.error(`[pregeneratePrivyWallet] An error occurred:`, error);
    throw error;
  }
}

export async function getOrCreatePrivyWallet({
  userId,
  phoneNumber,
  email,
  chain = 'base-sepolia',
  name,
}: {
  userId: string;
  phoneNumber?: string;
  email?: string;
  chain: string;
  name?: string;
}) {
  try {
    console.log(`Getting or creating ${chain} wallet for user ${userId} with identifier`, { email, phoneNumber });

    if (!email && !phoneNumber) {
      throw new Error('Either email or phoneNumber must be provided to create a wallet.');
    }

    // 1. Find or create user in Supabase
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError && userError.code !== 'PGRST116') { // Ignore 'not found' error
      console.error('Error fetching user from Supabase:', userError);
      throw userError;
    }

    // If user not found by ID, try to find by email or phone as a fallback
    if (!user) {
      const identifier = email ? { column: 'email', value: email } : { column: 'phone_number', value: phoneNumber };
      if (identifier.value) {
        const { data: userByIdentifier, error: identifierError } = await supabase
          .from('users')
          .select('*')
          .eq(identifier.column, identifier.value)
          .maybeSingle();

        if (identifierError) {
          console.error(`Error fetching user by ${identifier.column} from Supabase:`, identifierError);
        } else if (userByIdentifier) {
          console.log(`Found user by ${identifier.column} in Supabase: ${userByIdentifier.id}`);
          user = userByIdentifier;
        }
      }
    }

    if (!user) {
      console.log(`Creating new user in Supabase with ID ${userId}`);
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ id: userId, email, phone_number: phoneNumber, name: name || null }])
        .select()
        .single();
      if (createError) {
        console.error('Error creating user in Supabase:', createError);
        throw createError;
      }
      user = newUser;
    } else {
      // Update user if email or name has changed
      const updates: { email?: string; name?: string } = {};
      if (email && user.email !== email) updates.email = email;
      if (name && user.name !== name) updates.name = name;
      if (Object.keys(updates).length > 0) {
        await supabase.from('users').update(updates).eq('id', userId);
        user = { ...user, ...updates };
      }
    }

    // 2. Check if wallet exists for this user/chain in Supabase
    let { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('chain', chain)
      .single();

    if (walletError && walletError.code !== 'PGRST116') {
        console.error('Error fetching wallet from Supabase:', walletError);
    }

    if (wallet) {
      console.log(`Found existing ${chain} wallet in Supabase for user ${user.id}: ${wallet.address}`);
      return wallet;
    }

    // 3. Check if user and wallet exist in Privy
    let privyUser;
    try {
      privyUser = await privyClient.getUser(user.id);
      console.log(`Found existing Privy user: ${privyUser.id}`);
    } catch (err: any) {
      if (err.status === 404) {
        console.log(`User ${user.id} not found in Privy, creating now.`);
        
        const linkedAccounts = email
          ? [{ type: 'email', address: email }]
          : [{ type: 'phone', number: phoneNumber }];

        await fetch(`${privyApiUrl}/users`,
          {
            method: 'POST',
            headers: {
                'Authorization': getPrivyServerAuthHeader(),
                'privy-app-id': appId,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              create_embedded_wallet: true,
              linked_accounts: linkedAccounts,
              user_id: user.id,
            }),
          }
        );
        console.log(`Successfully created Privy user: ${user.id}. Re-fetching to ensure wallet is provisioned.`);
        // Add a small delay and re-fetch the user to ensure the wallet is provisioned
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        privyUser = await privyClient.getUser(user.id);
      } else {
        console.error('Error fetching user from Privy:', err);
        throw err;
      }
    }

    let chainType: string;
    if (chain === 'base-sepolia') chainType = 'ethereum';
    else chainType = chain;

    const foundWallet = privyUser.wallet;

    if (!foundWallet || !foundWallet.address) {
      console.error('Privy user was created/found, but the embedded wallet is missing.');
      throw new Error('Failed to retrieve embedded wallet from Privy.');
    }

    console.log(`Found/created ${chainType} wallet in Privy: ${foundWallet.address}`);
    // Store in Supabase
    const { data: newWallet, error: storeError } = await supabase
      .from('wallets')
      .insert([{
        user_id: user.id,
        chain,
        address: foundWallet.address,
        privy_wallet_id: foundWallet.id,
        privy_user_id: privyUser.id, // Store the Privy user ID
      }])
      .select()
      .single();

    if (storeError) {
      console.error('Error storing new Privy wallet in Supabase:', storeError);
      throw storeError;
    }

    // Also update the privy_user_id in the users table
    await supabase.from('users').update({ privy_user_id: privyUser.id }).eq('id', user.id);

    return newWallet;
  } catch (error) {
    console.error(`Error in getOrCreatePrivyWallet for ${chain}:`, error);
    throw error;
  }
}