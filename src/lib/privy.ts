// PRIVY EVM SUPPORT IS NOW DISABLED. All EVM wallet logic is handled by BlockRadar. Only Solana logic (if any) remains here.

/*
import { createClient } from '@supabase/supabase-js';
import { PrivyClient } from '@privy-io/server-auth';

const appId = process.env.PRIVY_APP_ID!;
const appSecret = process.env.PRIVY_APP_SECRET!;
const privyApiUrl = 'https://api.privy.io/v1/wallets';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment variables.');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export function getPrivyAuthHeader() {
  // Basic Auth: base64(appId:appSecret)
  const encoded = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

// Helper to get all wallets for a user from Privy
async function getAllPrivyWallets() {
  const res = await fetch(privyApiUrl, {
    method: 'GET',
    headers: {
      'Authorization': getPrivyAuthHeader(),
      'Content-Type': 'application/json',
      'privy-app-id': appId,
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Privy getAllWallets error:', errorText);
    throw new Error(`Privy getAllWallets failed: ${errorText}`);
  }
  return await res.json();
}

// Create or fetch a Privy wallet for a user (EVM or Solana)
export async function getOrCreatePrivyWallet({
  userId,
  phoneNumber,
  chain = 'evm', // 'evm', 'base', or 'solana'
}: {
  userId: string;
  phoneNumber: string;
  chain: 'evm' | 'base';
}) {
  try {
    console.log(`Getting or creating ${chain} wallet for user ${userId} with phone ${phoneNumber}`);
    
    // 1. Find or create user in Supabase
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      // Try to find by phone number as fallback
      const { data: userByPhone, error: phoneError } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', phoneNumber)
        .maybeSingle();
        
      if (phoneError) {
        console.error('Error fetching user by phone:', phoneError);
      } else if (userByPhone) {
        console.log(`Found user by phone number: ${userByPhone.id}`);
        user = userByPhone;
      }
    }

    if (!user) {
      console.log(`Creating new user with ID ${userId} and phone ${phoneNumber}`);
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ id: userId, phone_number: phoneNumber }])
        .select()
        .single();
      if (createError) {
        console.error('Error creating user:', createError);
        throw createError;
      }
      user = newUser;
    }

    // 2. Check if wallet exists for this user/chain in Supabase
    let { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('chain', chain)
      .single();

    if (walletError) {
      console.error('Error fetching wallet:', walletError);
    }
      
    if (wallet) {
      console.log(`Found existing ${chain} wallet for user ${userId}: ${wallet.address}`);
      return wallet;
    }

    // 3. Check if wallet exists in Privy (optional, for extra safety)
    try {
      console.log('Checking if wallet exists in Privy');
      const privyWallets = await getAllPrivyWallets();
      let chainType: string;
      // if (chain === 'solana') chainType = 'solana';
     if (chain === 'base') chainType = 'base';
      else chainType = 'ethereum';
      
      console.log(`Looking for ${chainType} wallet in Privy wallets:`, privyWallets);
      const found = privyWallets.wallets?.find((w: any) => w.chain_type === chainType);
      
      if (found) {
        console.log(`Found existing ${chainType} wallet in Privy: ${found.address}`);
        // Store in Supabase if not already
        const { data: newWallet, error: walletError } = await supabase
          .from('wallets')
          .insert([{
            user_id: userId,
            chain,
            address: found.address,
            privy_wallet_id: found.id,
          }])
          .select()
          .single();
        if (walletError) {
          console.error('Error storing existing Privy wallet in Supabase:', walletError);
          throw walletError;
        }
        return newWallet;
      }
    } catch (err) {
      console.error('Error checking Privy wallets:', err);
    }

    // 4. Create Privy wallet via REST API
    console.log(`Creating new ${chain} wallet in Privy`);
    let chainType: string;
    // if (chain === 'solana') chainType = 'solana';
     if (chain === 'base') chainType = 'base';
    else chainType = 'ethereum';
    
    const res = await fetch(privyApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': getPrivyAuthHeader(),
        'Content-Type': 'application/json',
        'privy-app-id': appId,
      },
      body: JSON.stringify({
        chain_type: chainType,
      }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Privy wallet creation failed:', errorText);
      throw new Error(`Privy wallet creation failed: ${errorText}`);
    }
    
    const privyWallet = await res.json();
    console.log(`Created new ${chainType} wallet in Privy:`, privyWallet);

    // 5. Store wallet in Supabase
    const { data: newWallet, error: newWalletError } = await supabase
      .from('wallets')
      .insert([{
        user_id: userId,
        chain,
        address: privyWallet.address,
        privy_wallet_id: privyWallet.id,
      }])
      .select()
      .single();

    if (newWalletError) {
      console.error('Error storing new wallet in Supabase:', newWalletError);
      throw newWalletError;
    }
    
    console.log(`Stored new ${chain} wallet in Supabase:`, newWallet);
    return newWallet;
  } catch (error) {
    console.error(`Error in getOrCreatePrivyWallet for ${chain}:`, error);
    throw error;
  }
}
*/

// (Leave Solana logic here if you still want to use Privy for Solana. Otherwise, this file can be removed.) 