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
    console.log('[api/user-wallet] Query:', req.query);
    const { userId, chatId, chain = 'Base', invoiceId } = req.query as {
      userId?: string;
      chatId?: string;
      chain?: string;
      invoiceId?: string;
    };

    // Optional fast-path: resolve directly from an invoice if provided
    if (invoiceId) {
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .select('wallet_address')
        .eq('id', invoiceId)
        .single();
      if (invErr) {
        console.warn('[api/user-wallet] Invoice lookup failed', { invoiceId, invErr });
      } else if (invoice?.wallet_address) {
        return res.status(200).json({ address: invoice.wallet_address });
      }
      // Fall through to user-based resolution if invoice had no wallet
    }

    // If invoiceId was provided but had no wallet, and no user identifiers were provided,
    // return an empty address gracefully instead of 400, so callers can handle missing wallets.
    if (!userId && !chatId) {
      if (invoiceId) {
        return res.status(200).json({ address: '' });
      }
      return res.status(400).json({ error: 'Missing userId or chatId' });
    }

    // Resolve internal user ID
    let internalId: string | undefined;
    if (userId) {
      // Try direct match on users.id
      const { data: byId, error: byIdErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
      if (byId && !byIdErr) {
        internalId = byId.id;
      }
    }
    if (!internalId && chatId) {
      // Fallback: match by telegram_chat_id
      const { data: byChat, error: byChatErr } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_chat_id', chatId)
        .single();
      if (byChat && !byChatErr) {
        internalId = byChat.id;
      }
    }

    if (!internalId) {
      console.error('[api/user-wallet] User not found', { userId, chatId });
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch wallets for user
    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('address, chain')
      .eq('user_id', internalId as string);
    if (walletError) throw walletError;

    let finalAddress: string | undefined;
    if (wallets && wallets.length > 0) {
      const desired = (chain || 'Base').toLowerCase();
      // 1) exact chain match
      let chosen = wallets.find((w: any) => (w.chain || '').toLowerCase() === desired);
      // 2) base -> evm fallback
      if (!chosen && desired === 'base') {
        chosen = wallets.find((w: any) => (w.chain || '').toLowerCase() === 'evm');
      }
      // 3) any wallet
      if (!chosen) {
        chosen = wallets[0];
      }
      finalAddress = chosen?.address;
    }

    // Fallback to users.wallet_address if no wallet rows
    if (!finalAddress) {
      const { data: userRow, error: userRowErr } = await supabase
        .from('users')
        .select('wallet_address')
        .eq('id', internalId)
        .single();
      if (!userRowErr && userRow?.wallet_address) {
        finalAddress = userRow.wallet_address;
      }
    }

    return res.status(200).json({ address: finalAddress || '' });
  } catch (e: any) {
    console.error('[api/user-wallet] Error:', e);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
}

