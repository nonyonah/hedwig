import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId, chain = 'Base' } = req.query as { userId?: string; chain?: string };
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    // 1. Find the user's internal ID from their Telegram ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      throw new Error(userError?.message || 'User not found');
    }

    // 2. Use the internal user ID to fetch wallets
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', userData.id);

    if (walletError) throw walletError;

    let address = wallets?.[0]?.address || '';
    // Try to pick an EVM/Base wallet if available
    const evmBase = wallets?.find((w: any) => w.chain?.toLowerCase?.() === 'evm');
    if (evmBase?.address) address = evmBase.address;

    return res.status(200).json({ address });
  } catch (e: any) {
    console.error('[api/user-wallet] Error:', e);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
}
