import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Log once on cold start
  console.warn('[api/user-wallet] Missing Supabase env vars');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('[api/user-wallet] Received request with query:', req.query);
    const { userId, chatId, chain = 'Base' } = req.query as { userId?: string; chatId?: string; chain?: string };
    if (!userId && !chatId) return res.status(400).json({ error: 'Missing userId or chatId' });

    // 1. Resolve internal user ID from telegram chat ID
    const lookupId = userId || chatId;
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', lookupId)
      .single();

    if (userError || !userData) {
      console.error('User lookup failed:', { lookupId, userError });
      return res.status(404).json({ error: `User not found for ID ${lookupId}` });
    }

    const internalId = userData.id;

    // 2. Fetch wallets for user
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', internalId as string);

    if (walletError) throw walletError;

    if (!wallets || wallets.length === 0) {
      return res.status(200).json({ address: '' });
    }

    const desired = (chain || 'Base').toLowerCase();

    // 1. Prefer exact chain match
    let chosen = wallets.find((w: any) => (w.chain || '').toLowerCase() === desired);

    // 2. If desired is 'base', also check for 'evm' as a fallback
    if (!chosen && desired === 'base') {
      chosen = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm');
    }

    // 3. If still no match, fall back to the first wallet in the list
    if (!chosen) {
      chosen = wallets[0];
    }

    return res.status(200).json({ address: chosen?.address || '' });
  } catch (e: any) {
    console.error('[api/user-wallet] Error:', e);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
}
