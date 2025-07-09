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
 * Creates or fetches a Privy wallet for a user.
 * @param userId The user's unique identifier.
 * @param phoneNumber The user's phone number.
 * @param chain The blockchain to use (e.g., 'base-sepolia').
 * @param name The user's name.
 */
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

        const createUserResponse = await fetch(`${privyApiUrl}/users`,
          {
            method: 'POST',
            headers: {
              'Authorization': getPrivyServerAuthHeader(),
              'Content-Type': 'application/json',
              'privy-app-id': appId,
            },
            body: JSON.stringify({
              user_id: user.id,
              create_embedded_wallet: true,
              linked_accounts: linkedAccounts,
            }),
          }
        );

        if (!createUserResponse.ok) {
          const errorText = await createUserResponse.text();
          console.error(`Failed to create Privy user ${user.id}:`, errorText);
          throw new Error(`Failed to create Privy user: ${errorText}`);
        }
        privyUser = await createUserResponse.json();
        console.log(`Successfully created Privy user: ${privyUser.id}`);
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