import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Paycrest webhook payload types based on their documentation
interface PaycrestWebhookPayload {
  event: string;
  data: {
    id: string;
    status: 'initiated' | 'pending' | 'processing' | 'validated' | 'settled' | 'cancelled' | 'expired' | 'failed';
    amount: number;
    currency: string;
    transactionHash?: string;
    liquidityProvider?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: any;
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
 * Verify Paycrest webhook signature
 */
function verifyPaycrestSignature(rawBody: Buffer, signature: string): boolean {
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

    // Paycrest uses HMAC-SHA256 with the webhook secret
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[PaycrestWebhook] Signature verification error:', error);
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw body for signature verification
    const rawBody = await readRawBody(req);
    const signature = req.headers['x-paycrest-signature'] as string;
    
    // Verify webhook signature
    if (signature && !verifyPaycrestSignature(rawBody, signature)) {
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
      'initiated': 'pending',
      'pending': 'pending', 
      'processing': 'processing',
      'validated': 'processing',
      'settled': 'completed',
      'cancelled': 'failed',
      'expired': 'failed',
      'failed': 'failed'
    };

    const newStatus = statusMapping[status] || 'pending';

    // Prepare update data
    const updateData: any = {
      status: newStatus,
      updated_at: new Date(timestamp * 1000).toISOString() // Convert timestamp to ISO string
    };

    if (data.transactionHash) {
      updateData.tx_hash = data.transactionHash;
    }

    // Add additional metadata
    if (data.liquidityProvider) {
      updateData.liquidity_provider = data.liquidityProvider;
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

    // Send notification to user for status changes
    if (newStatus === 'completed' || newStatus === 'failed') {
      try {
        // Send notification via payment-notifications webhook
        const notificationPayload = {
          type: 'offramp' as const,
          id: transaction.id,
          amount: data.amount || transaction.amount,
          currency: data.currency || transaction.currency,
          transactionHash: data.transactionHash,
          status: newStatus,
          recipientUserId: transaction.user_id,
          orderId: orderId,
          liquidityProvider: data.liquidityProvider
        };

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const notificationResponse = await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationPayload),
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!notificationResponse.ok) {
          const errorText = await notificationResponse.text();
          console.error('[PaycrestWebhook] Failed to send notification:', errorText);
        } else {
          console.log(`[PaycrestWebhook] Notification sent for transaction ${transaction.id} status: ${newStatus}`);
        }
      } catch (notificationError) {
        console.error('[PaycrestWebhook] Error sending notification:', notificationError);
        // Don't fail the webhook if notification fails
      }
    }

    // Respond with success (important for Paycrest to mark webhook as delivered)
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      orderId: orderId,
      status: newStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}