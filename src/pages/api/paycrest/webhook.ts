import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Disable Next.js default body parsing to access raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAYCREST_API_SECRET = process.env.PAYCREST_API_SECRET || process.env.API_SECRET; // keep compatibility with snippet name

function verifyPaycrestSignature(rawBody: Buffer, signatureHeader?: string | null, secretKey?: string) {
  if (!signatureHeader || !secretKey) return false;
  const hmac = crypto.createHmac('sha256', Buffer.from(secretKey));
  hmac.update(rawBody);
  const digest = hmac.digest('hex');
  return signatureHeader === digest;
}

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

async function notifyTelegram(chatId: string | number, text: string) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch {
    // no-op
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-paycrest-signature'] as string | undefined;

    if (!verifyPaycrestSignature(rawBody, signature, PAYCREST_API_SECRET || '')) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(rawBody.toString('utf-8')) as {
      event: string;
      data: any;
    };

    const payoutId: string | undefined = payload?.data?.id;
    const status = payload?.event;
    const meta = payload?.data?.meta || {};
    const chatId = meta?.telegramChatId;

    if (payoutId && status) {
      // Update transaction status by payout_id
      await supabase
        .from('offramp_transactions')
        .update({ status })
        .eq('payout_id', payoutId);
    }

    // Send Telegram template updates based on status
    if (chatId) {
      let message = `ℹ️ Update: ${status}`;
      if (status === 'payout.initiated') {
        message = '✅ Your payout has been initiated.';
      } else if (status === 'payout.completed') {
        message = '🎉 Your payout has been completed.';
      } else if (status === 'payout.failed') {
        message = '❌ Your payout failed. Our team is investigating.';
      }
      await notifyTelegram(chatId, message);
    }

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('[api/paycrest/webhook] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
