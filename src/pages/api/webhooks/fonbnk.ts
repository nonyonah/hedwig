import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { getCurrentConfig } from '../../../lib/envConfig';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fonbnk webhook payload types
interface FonbnkWebhookPayload {
  event: string;
  data: {
    transaction_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
    amount: number;
    token: string;
    chain: string;
    fiat_amount: number;
    fiat_currency: string;
    tx_hash?: string;
    wallet_address: string;
    created_at: string;
    updated_at: string;
    error_message?: string;
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
 * Verify Fonbnk webhook signature
 */
function verifyFonbnkSignature(rawBody: Buffer, signature: string): boolean {
  try {
    const config = getCurrentConfig();
    const webhookSecret = config.fonbnk.webhookSecret;
    
    if (!webhookSecret) {
      console.warn('[FonbnkWebhook] No webhook secret configured, skipping signature verification');
      return true; // Allow for development/testing
    }

    if (webhookSecret === 'your_fonbnk_webhook_secret_here') {
      console.warn('[FonbnkWebhook] Webhook secret is placeholder value, skipping signature verification');
      return true; // Allow for development/testing
    }

    // Fonbnk uses HMAC-SHA256 and sends signature as hex string
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    // Compare signatures (case-insensitive)
    const providedSig = signature.toLowerCase();
    const expectedSig = expectedSignature.toLowerCase();
    
    console.log('[FonbnkWebhook] Signature verification:', {
      provided: providedSig.substring(0, 10) + '...',
      expected: expectedSig.substring(0, 10) + '...',
      match: providedSig === expectedSig
    });

    return providedSig === expectedSig;
  } catch (error) {
    console.error('[FonbnkWebhook] Signature verification error:', error);
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
    const signature = req.headers['x-fonbnk-signature'] as string;
    
    // Verify webhook signature
    if (signature && !verifyFonbnkSignature(rawBody, signature)) {
      console.error('[FonbnkWebhook] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse the payload
    const payload: FonbnkWebhookPayload = JSON.parse(rawBody.toString('utf-8'));
    
    console.log('[FonbnkWebhook] Received webhook:', JSON.stringify(payload, null, 2));

    // Validate webhook payload structure
    if (!payload.event || !payload.data || !payload.data.transaction_id || !payload.data.status) {
      console.error('[FonbnkWebhook] Invalid webhook payload structure:', payload);
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }

    const { event, data, timestamp } = payload;
    const transactionId = data.transaction_id;
    const status = data.status;

    console.log(`[FonbnkWebhook] Processing ${event} for transaction ${transactionId} with status ${status}`);

    // Find transaction in database
    const { data: transaction, error: fetchError } = await supabase
      .from('onramp_transactions')
      .select('*')
      .eq('fonbnk_transaction_id', transactionId)
      .single();

    if (fetchError || !transaction) {
      console.error('[FonbnkWebhook] Transaction not found for ID:', transactionId, fetchError);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Map Fonbnk status to our internal status
    const statusMapping: Record<string, string> = {
      'pending': 'pending',
      'processing': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'expired': 'failed'
    };

    const newStatus = statusMapping[status] || 'pending';

    // Prepare update data
    const updateData: any = {
      status: newStatus,
      updated_at: new Date(timestamp * 1000).toISOString() // Convert timestamp to ISO string
    };

    if (data.tx_hash) {
      updateData.tx_hash = data.tx_hash;
    }

    if (data.error_message) {
      updateData.error_message = data.error_message;
    }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    // Update transaction in database
    const { error: updateError } = await supabase
      .from('onramp_transactions')
      .update(updateData)
      .eq('id', transaction.id);

    if (updateError) {
      console.error('[FonbnkWebhook] Failed to update transaction:', updateError);
      return res.status(500).json({ error: 'Failed to update transaction' });
    }

    console.log(`[FonbnkWebhook] Updated transaction ${transaction.id} status from ${transaction.status} to ${newStatus}`);

    // Send notification to user for status changes
    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'processing') {
      try {
        // Send notification via payment-notifications webhook
        const notificationPayload = {
          type: 'onramp' as const,
          id: transaction.id,
          amount: data.amount || transaction.amount,
          token: data.token || transaction.token,
          chain: data.chain || transaction.chain,
          fiatAmount: data.fiat_amount || transaction.fiat_amount,
          fiatCurrency: data.fiat_currency || transaction.fiat_currency,
          transactionHash: data.tx_hash,
          status: newStatus,
          recipientUserId: transaction.user_id,
          transactionId: transactionId,
          walletAddress: data.wallet_address || transaction.wallet_address,
          errorMessage: data.error_message
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
          console.error('[FonbnkWebhook] Failed to send notification:', errorText);
        } else {
          console.log(`[FonbnkWebhook] Notification sent for transaction ${transaction.id} status: ${newStatus}`);
        }
      } catch (notificationError) {
        console.error('[FonbnkWebhook] Error sending notification:', notificationError);
        // Don't fail the webhook if notification fails
      }
    }

    // Respond with success (important for Fonbnk to mark webhook as delivered)
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      transactionId: transactionId,
      status: newStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[FonbnkWebhook] Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}