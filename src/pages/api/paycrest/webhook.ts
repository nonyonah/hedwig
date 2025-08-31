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

    const orderId: string | undefined = payload?.data?.id;
    const paycrestStatus = payload?.event;
    const orderData = payload?.data || {};
    const meta = orderData?.meta || {};
    const chatId = meta?.telegramChatId;

    if (orderId && paycrestStatus) {
      // Map Paycrest status to our internal status
      let internalStatus: string;
      switch (paycrestStatus) {
        case 'order.initiated':
        case 'order.processing':
          internalStatus = 'processing';
          break;
        case 'order.completed':
        case 'order.success':
          internalStatus = 'completed';
          break;
        case 'order.failed':
        case 'order.rejected':
        case 'order.cancelled':
          internalStatus = 'failed';
          break;
        default:
          internalStatus = 'pending';
      }

      // Get transaction details for better notifications
      const { data: transaction } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('order_id', orderId)
        .single();

      // Update transaction status with additional details
      const updateData: any = {
        status: internalStatus,
        updated_at: new Date().toISOString()
      };

      // Add error message for failed transactions
      if (internalStatus === 'failed' && orderData.reason) {
        updateData.error_message = orderData.reason;
      }

      await supabase
        .from('offramp_transactions')
        .update(updateData)
        .eq('order_id', orderId);

      // Send enhanced Telegram notifications
      if (chatId && transaction) {
        let message = '';
        const amount = `${transaction.fiat_amount} ${transaction.fiat_currency}`;
        const txId = transaction.id.substring(0, 8);

        switch (internalStatus) {
          case 'processing':
            message = `🔄 **Withdrawal Processing**\n\n` +
                     `Amount: ${amount}\n` +
                     `Transaction ID: ${txId}\n\n` +
                     `Your withdrawal is being processed. You'll receive another update when it's completed.`;
            break;
          case 'completed':
            message = `✅ **Withdrawal Completed**\n\n` +
                     `Amount: ${amount}\n` +
                     `Transaction ID: ${txId}\n\n` +
                     `🎉 Your funds have been successfully transferred to your bank account!`;
            break;
          case 'failed':
            const errorMsg = updateData.error_message ? `\n\nReason: ${updateData.error_message}` : '';
            message = `❌ **Withdrawal Failed**\n\n` +
                     `Amount: ${amount}\n` +
                     `Transaction ID: ${txId}${errorMsg}\n\n` +
                     `Please contact support if you need assistance.`;
            break;
          default:
            message = `ℹ️ **Withdrawal Update**\n\n` +
                     `Amount: ${amount}\n` +
                     `Status: ${internalStatus}\n` +
                     `Transaction ID: ${txId}`;
        }

        await notifyTelegram(chatId, message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('[api/paycrest/webhook] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
