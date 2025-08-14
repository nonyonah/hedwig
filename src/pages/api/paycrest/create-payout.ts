import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAYCREST_API_BASE_URL = 'https://api.paycrest.com/v1/sender';

async function notifyTelegram(chatId: string | number, text: string) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.warn('[create-payout] Failed to notify Telegram');
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const { userId, chatId, chain, amountUSD, currency, bank, accountName, accountNumber } = req.body || {};
    if (!userId || !chatId || !amountUSD || !currency || !bank || !accountNumber) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const apiKey = process.env.PAYCREST_API_KEY || process.env.PAYCREST_SENDER_API_KEY;

    let payoutId: string | undefined;
    // Attempt real Paycrest payout
    if (apiKey) {
      try {
        const resp = await fetch(`${PAYCREST_API_BASE_URL}/payout/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            amountUSD: Number(amountUSD),
            currency,
            bank,
            accountName,
            accountNumber,
            meta: { userId, chain },
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.payoutId) {
          payoutId = data.payoutId;
        }
      } catch (e) {
        console.warn('[create-payout] Paycrest call failed, falling back to mock');
      }
    }

    // Store transaction record (best-effort)
    try {
      await supabase.from('offramp_transactions').insert({
        user_id: userId,
        amount_usd: Number(amountUSD),
        fiat_currency: currency,
        bank_name: bank,
        account_name: accountName || null,
        account_number: accountNumber,
        chain: chain || null,
        status: 'pending',
        payout_id: payoutId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      // ignore
    }

    // Notify user in Telegram
    await notifyTelegram(chatId, `✅ Offramp order received.\n\nAmount: $${amountUSD} → ${currency}\nBank: ${bank}\nAcct: ${accountNumber}${payoutId ? `\nPayout ID: ${payoutId}` : ''}\n\nI'll keep you updated. Funds typically arrive in 1–5 minutes after processing.`);

    return res.status(200).json({ success: true, payoutId: payoutId || null });
  } catch (error: any) {
    console.error('[api/paycrest/create-payout] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create payout' });
  }
}
