import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userId, chatId, chain, amountUSD, currency, bank, bankCode, accountName, accountNumber, txHash, senderOrderId } = req.body;
    if (!userId || !chatId || !amountUSD || !currency || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!PAYCREST_API_KEY) {
      return res.status(500).json({ error: 'Paycrest API key not configured' });
    }

    // 1. Find the user's internal ID from their Telegram ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', userId)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Create the payout via Paycrest
    const payoutPayload = {
      source_currency: 'USD',
      source_amount: Number(amountUSD),
      destination_currency: currency,
      institution_code: bankCode,
      account_number: accountNumber,
      customer: { full_name: accountName },
      meta: {
        internalUserId: userData.id,
        telegramUserId: userId,
        chain,
        onchainTxHash: txHash,
        senderOrderId,
        bankName: bank,
      },
    };

    const response = await fetch(`${PAYCREST_API_URL}/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYCREST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payoutPayload),
    });

    const payoutData = await response.json();

    if (!response.ok) {
      console.error('[api/paycrest/create-payout] Paycrest API error:', payoutData);
      return res.status(response.status).json({ error: payoutData.message || 'Failed to create payout' });
    }

    const payoutId = payoutData.data.id;

    // 3. Store transaction record
    await supabase.from('offramp_transactions').insert({
      user_id: userData.id, // Use internal UUID
      amount_usd: Number(amountUSD),
      fiat_currency: currency,
      bank_name: bank,
      account_name: accountName,
      account_number: accountNumber,
      chain: chain,
      status: 'processing',
      payout_id: payoutId,
    });

    // 4. Notify user in Telegram
    const notifyText = `✅ Your cash-out for *$${amountUSD}* is processing.\n\nFunds will be sent to:\nBank: *${bank}*\nAccount: *...${accountNumber.slice(-4)}*\n\nYou'll get another message once it's complete.`;
    await notifyTelegram(chatId, notifyText);

    return res.status(200).json({ success: true, payoutId });
  } catch (e: any) {
    console.error('[api/paycrest/create-payout] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
