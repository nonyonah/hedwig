import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// Create a simple supabase client for webhook operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Paycrest webhook payload structure based on their documentation
// https://docs.paycrest.io/implementation-guides/sender-api-integration#webhook-implementation
interface PaycrestWebhookPayload {
  event: string; // e.g., 'order.status.updated', 'order.completed', etc.
  data: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
    amount: number;
    token: string;
    network: string;
    rate: number;
    recipient: {
      institution: string;
      accountIdentifier: string;
      accountName: string;
      currency: string;
    };
    reference: string;
    receiveAddress: string;
    returnAddress: string;
    transactionHash?: string;
    transactionReference?: string; // Alternative field name
    currency?: string; // Fiat currency
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
  };
  timestamp: number;
}

// Disable Next.js default body parsing to access raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Paycrest webhook handler for real-time order status updates
 * Based on Paycrest Sender API webhook implementation
 * Documentation: https://docs.paycrest.io/implementation-guides/sender-api-integration#webhook-implementation
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw body for signature verification
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-paycrest-signature'] as string;

    // Verify webhook signature
    if (signature && !verifyWebhookSignature(rawBody, signature)) {
      console.error('[PaycrestWebhook] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse the payload
    const payload: PaycrestWebhookPayload = JSON.parse(rawBody.toString('utf-8'));
    console.log('[PaycrestWebhook] Received webhook:', JSON.stringify(payload, null, 2));

    // Validate webhook payload structure
    if (!payload.event || !payload.data || !payload.data.id || !payload.data.status) {
      console.error('[PaycrestWebhook] Invalid webhook payload structure:', payload);
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }

    const { event, data, timestamp } = payload;
    const orderId = data.id;
    const status = data.status;

    console.log(`[PaycrestWebhook] Processing ${event} for order ${orderId} with status ${status}`);
    console.log(`[PaycrestWebhook] Full payload:`, JSON.stringify(payload, null, 2));

    // Find transaction in database
    const { data: transaction, error: fetchError } = await supabase
      .from('offramp_transactions')
      .select('*')
      .eq('paycrest_order_id', orderId)
      .single();

    if (fetchError || !transaction) {
      console.error('[PaycrestWebhook] Transaction not found for order:', orderId, fetchError);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Map Paycrest status to our internal status
    const statusMapping: Record<string, string> = {
      'pending': 'pending',
      'processing': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'failed',
      'expired': 'failed'
    };

    const newStatus = statusMapping[status] || 'pending';

    // Prepare update data
    const updateData: any = {
      status: newStatus,
      updated_at: new Date(timestamp * 1000).toISOString()
    };

    if (data.transactionReference || data.transactionHash) {
      updateData.tx_hash = data.transactionReference || data.transactionHash;
    }

    // Update transaction in database
    const { error: updateError } = await supabase
      .from('offramp_transactions')
      .update(updateData)
      .eq('id', transaction.id);

    if (updateError) {
      console.error('[PaycrestWebhook] Failed to update transaction:', updateError);
      return res.status(500).json({ error: 'Failed to update transaction' });
    }

    console.log(`[PaycrestWebhook] Updated transaction ${transaction.id} status from ${transaction.status} to ${newStatus}`);

    const userId = transaction.user_id;

    // Handle status-specific actions and send notifications using templates
    await handleWebhookStatusUpdate(userId, orderId, status, {
      orderId: orderId,
      amount: data.amount,
      currency: data.currency || data.recipient.currency,
      token: data.token,
      network: data.network,
      transactionHash: data.transactionReference || data.transactionHash,
      transactionReference: data.transactionReference || data.transactionHash,
      recipient: data.recipient,
      rate: data.rate,
      expectedAmount: data.amount * data.rate,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      expiresAt: data.expiresAt,
      event: event
    });

    // Send notification via payment-notifications webhook for completed/failed transactions
    if (newStatus === 'completed' || newStatus === 'failed') {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        const notificationPayload = {
          type: 'offramp' as const,
          id: transaction.id,
          amount: data.amount || transaction.amount,
          currency: data.currency || data.recipient.currency || transaction.currency,
          transactionHash: data.transactionReference || data.transactionHash,
          status: newStatus,
          recipientUserId: userId,
          orderId: orderId
        };

        const response = await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationPayload),
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[PaycrestWebhook] Failed to send notification:', errorText);
        } else {
          console.log(`[PaycrestWebhook] Notification sent for transaction ${transaction.id} status: ${newStatus}`);
        }
      } catch (notificationError) {
        console.error('[PaycrestWebhook] Error sending notification:', notificationError);
        // Don't fail the webhook if notification fails
      }
    }

    // Respond to Paycrest (important for them to mark webhook as delivered)
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      orderId: orderId,
      status: newStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[PaycrestWebhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Verify webhook signature using raw body
 * Based on Paycrest documentation: https://docs.paycrest.io/implementation-guides/sender-api-integration#webhook-implementation
 */
function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  try {
    const webhookSecret = process.env.PAYCREST_WEBHOOK_SECRET || process.env.PAYCREST_API_SECRET;
    if (!webhookSecret) {
      console.warn('[PaycrestWebhook] No webhook secret configured, skipping signature verification');
      return true; // Allow for development/testing
    }

    if (webhookSecret === 'your_paycrest_mainnet_secret_here') {
      console.warn('[PaycrestWebhook] Webhook secret is placeholder value, skipping signature verification');
      return true; // Allow for development/testing
    }

    // Paycrest uses HMAC-SHA256 and sends signature as hex string
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    // Compare signatures (case-insensitive)
    const providedSig = signature.toLowerCase();
    const expectedSig = expectedSignature.toLowerCase();

    console.log('[PaycrestWebhook] Signature verification:', {
      provided: providedSig.substring(0, 10) + '...',
      expected: expectedSig.substring(0, 10) + '...',
      match: providedSig === expectedSig
    });

    return providedSig === expectedSig;
  } catch (error) {
    console.error('[PaycrestWebhook] Signature verification error:', error);
    return false;
  }
}

/**
 * Handle webhook status updates using the comprehensive template system
 */
async function handleWebhookStatusUpdate(
  userId: string,
  orderId: string,
  status: string,
  orderData: any
): Promise<void> {
  try {
    console.log(`[PaycrestWebhook] Handling status update: ${status} for order ${orderId}`);

    // Import the status template system
    const { OfframpStatusTemplates } = await import('../../../lib/offrampStatusTemplates');
    
    // Generate the status template
    const template = OfframpStatusTemplates.getStatusTemplate(status, orderData);
    
    // Send notification via Telegram
    await sendTemplatedNotification(userId, template);
    
    // Award referral points for first offramp completion
    if (['completed', 'fulfilled', 'success', 'settled', 'delivered'].includes(status.toLowerCase())) {
      try {
        const { awardActionPoints } = await import('../../../lib/referralService');
        await awardActionPoints(userId, 'first_offramp');
      } catch (referralError) {
        console.error('[PaycrestWebhook] Error awarding referral points for offramp:', referralError);
        // Don't fail the notification if referral points fail
      }
    }
    
  } catch (error) {
    console.error('[PaycrestWebhook] Error handling status update:', error);
  }
}

/**
 * Send templated notification via Telegram using the status template system
 */
async function sendTemplatedNotification(userId: string, template: any): Promise<void> {
  try {
    // Get user's chat ID from database
    const { data: user, error } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[PaycrestWebhook] Error fetching user:', error);
      return;
    }

    if (user && user.telegram_chat_id) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.error('[PaycrestWebhook] No Telegram bot token configured');
        return;
      }

      const payload = {
        chat_id: user.telegram_chat_id,
        text: template.text,
        parse_mode: template.parse_mode || 'Markdown',
        reply_markup: template.reply_markup
      };

      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PaycrestWebhook] Telegram API error:', errorText);
      } else {
        console.log(`[PaycrestWebhook] Templated notification sent to user ${userId}`);
      }
    }
  } catch (error) {
    console.error('[PaycrestWebhook] Error sending templated notification:', error);
  }
}

