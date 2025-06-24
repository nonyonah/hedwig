import { createClient } from '@supabase/supabase-js';

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

function getPrivyAuthHeader() {
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
  chain: 'evm' | 'base' | 'solana';
}) {
  // 1. Find or create user in Supabase
  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ id: userId, phone_number: phoneNumber }])
      .select()
      .single();
    if (createError) throw createError;
    user = newUser;
  }

  // 2. Check if wallet exists for this user/chain in Supabase
  let { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('chain', chain)
    .single();

  if (wallet) return wallet;

  // 3. Check if wallet exists in Privy (optional, for extra safety)
  try {
    const privyWallets = await getAllPrivyWallets();
    let chainType: string;
    if (chain === 'solana') chainType = 'solana';
    else if (chain === 'base') chainType = 'base';
    else chainType = 'ethereum';
    const found = privyWallets.wallets?.find((w: any) => w.chain_type === chainType);
    if (found) {
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
      if (walletError) throw walletError;
      return newWallet;
    }
  } catch (err) {
    console.error('Privy getAllWallets failed:', err);
  }

  // 4. Create Privy wallet via REST API
  let chainType: string;
  if (chain === 'solana') chainType = 'solana';
  else if (chain === 'base') chainType = 'base';
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

  // 5. Store wallet in Supabase
  const { data: newWallet, error: walletError } = await supabase
    .from('wallets')
    .insert([{
      user_id: userId,
      chain,
      address: privyWallet.address,
      privy_wallet_id: privyWallet.id,
    }])
    .select()
    .single();

  if (walletError) throw walletError;
  return newWallet;
} 