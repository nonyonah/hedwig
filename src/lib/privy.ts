import { createClient } from '@supabase/supabase-js';

const appId = process.env.PRIVY_APP_ID!;
const appSecret = process.env.PRIVY_APP_SECRET!;
const privyApiUrl = 'https://api.privy.io/v1/wallets';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getPrivyAuthHeader() {
  // Basic Auth: base64(appId:appSecret)
  const encoded = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

// Create or fetch a Privy wallet for a user (EVM or Solana)
export async function getOrCreatePrivyWallet({
  userId,
  phoneNumber,
  chain = 'evm', // or 'solana'
}: {
  userId: string;
  phoneNumber: string;
  chain: 'evm' | 'solana';
}) {
  // 1. Find or create user in Supabase
  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();

  if (!user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ phone_number: phoneNumber }])
      .select()
      .single();
    if (createError) throw createError;
    user = newUser;
  }

  // 2. Check if wallet exists for this user/chain
  let { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .eq('chain', chain)
    .single();

  if (wallet) return wallet;

  // 3. Create Privy wallet via REST API
  const chainType = chain === 'solana' ? 'solana' : 'base';
  const res = await fetch(privyApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': getPrivyAuthHeader(),
      'Content-Type': 'application/json',
      'privy-app-id': appId,
    },
    body: JSON.stringify({
      chain_type: chainType,
      // Optionally, you can add owner_id or metadata if needed
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Privy wallet creation failed: ${errorText}`);
  }
  const privyWallet = await res.json();

  // 4. Store wallet in Supabase
  const { data: newWallet, error: walletError } = await supabase
    .from('wallets')
    .insert([{
      user_id: user.id,
      chain,
      address: privyWallet.address,
      privy_wallet_id: privyWallet.id,
    }])
    .select()
    .single();

  if (walletError) throw walletError;
  return newWallet;
} 