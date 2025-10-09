import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// Create a simple supabase client for webhook operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Paycrest webhook payload structure based on their documentation
interface PaycrestWebhookPayload {
  event: 'order.created' | 'order.updated' | 'order.completed' | 'order.failed' | 'order.cancelled';
  data: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';
    amount: number;
    currency: string;
    recipientDetails?: {
      accountNumber?: string;
      bankCode?: string;
      accountName?: string;
    };
    transactionReference?: string;
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

    if (data.transactionReference) {
      updateData.tx_hash = data.transactionReference;
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

    // Handle status-specific actions and send notifications
    await handleWebhookStatusUpdate(userId, orderId, status, {
      transactionReference: data.transactionReference,
      amount: data.amount,
      currency: data.currency,
      updatedAt: data.updatedAt,
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
          currency: data.currency || transaction.currency,
          transactionHash: data.transactionReference,
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

    const hmac = crypto.createHmac('sha256', Buffer.from(webhookSecret));
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  } catch (error) {
    console.error('[PaycrestWebhook] Signature verification error:', error);
    return false;
  }
}

/**
 * Handle webhook status updates and send appropriate notifications
 */
async function handleWebhookStatusUpdate(
  userId: string, 
  orderId: string, 
  status: string, 
  orderData: any
): Promise<void> {
  try {
    console.log(`[PaycrestWebhook] Handling status update: ${status} for order ${orderId}`);

    switch (status.toLowerCase()) {
      case 'completed':
      case 'fulfilled':
      case 'success':
        await sendSuccessNotification(userId, orderId, orderData);
        break;

      case 'failed':
      case 'error':
      case 'cancelled':
        await sendFailureNotification(userId, orderId, orderData);
        break;

      case 'refunded':
      case 'refund_pending':
        await sendRefundNotification(userId, orderId, orderData);
        break;

      case 'processing':
      case 'pending':
        await sendProcessingNotification(userId, orderId, orderData);
        break;

      default:
        console.log(`[PaycrestWebhook] No specific handler for status: ${status}`);
    }
  } catch (error) {
    console.error('[PaycrestWebhook] Error handling status update:', error);
  }
}

/**
 * Send success notification via Telegram
 */
async function sendSuccessNotification(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    // Award referral points for first offramp completion
    try {
      const { awardActionPoints } = await import('../../../lib/referralService');
      await awardActionPoints(userId, 'first_offramp');
    } catch (referralError) {
      console.error('[PaycrestWebhook] Error awarding referral points for offramp:', referralError);
      // Don't fail the notification if referral points fail
    }

    const message = {
      text: `✅ **Withdrawal Completed!**\n\n` +
            `🎉 Your funds have been successfully delivered!\n\n` +
            `💰 **Amount:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `🏦 **Status:** Delivered to your bank account\n` +
            `⏰ **Completed:** ${new Date().toLocaleString()}\n\n` +
            `💡 **Your funds should appear in your account within the next 2 minutes.**\n\n` +
            `Thank you for using Hedwig! 🚀`,
      reply_markup: {
        inline_keyboard: [[
          { text: "📊 View History", callback_data: "offramp_history" },
          { text: "💸 New Withdrawal", callback_data: "start_offramp" }
        ]]
      }
    };

    await sendTelegramMessage(userId, message);
  } catch (error) {
    console.error('[PaycrestWebhook] Error sending success notification:', error);
  }
}

/**
 * Send failure notification via Telegram
 */
async function sendFailureNotification(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const message = {
      text: `❌ **Withdrawal Failed**\n\n` +
            `We're sorry, your withdrawal could not be completed.\n\n` +
            `💰 **Amount:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `📋 **Order ID:** ${orderId}\n\n` +
            `🔄 **Next Steps:**\n` +
            `• Your funds will be automatically refunded\n` +
            `• Refund typically takes 5-10 minutes\n` +
            `• You'll receive a notification when complete\n\n` +
            `💬 Need help? Contact our support team.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Try Again", callback_data: "start_offramp" },
          { text: "💬 Contact Support", callback_data: "contact_support" }
        ]]
      }
    };

    await sendTelegramMessage(userId, message);
  } catch (error) {
    console.error('[PaycrestWebhook] Error sending failure notification:', error);
  }
}

/**
 * Send refund notification via Telegram
 */
async function sendRefundNotification(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const message = {
      text: `🔄 **Refund Processed**\n\n` +
            `Your withdrawal has been refunded successfully.\n\n` +
            `💰 **Refunded:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `📋 **Order ID:** ${orderId}\n\n` +
            `✅ **Your USDC has been returned to your wallet.**\n\n` +
            `You can try the withdrawal again or contact support.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Try Again", callback_data: "start_offramp" },
          { text: "💬 Contact Support", callback_data: "contact_support" }
        ]]
      }
    };

    await sendTelegramMessage(userId, message);
  } catch (error) {
    console.error('[PaycrestWebhook] Error sending refund notification:', error);
  }
}

/**
 * Send processing notification via Telegram
 */
async function sendProcessingNotification(userId: string, orderId: string, orderData: any): Promise<void> {
  try {
    const message = {
      text: `🔄 **Withdrawal Update**\n\n` +
            `Your withdrawal is being processed.\n\n` +
            `💰 **Amount:** ${orderData.expectedAmount || orderData.amount} USDC\n` +
            `📋 **Order ID:** ${orderId}\n` +
            `⏰ **Status:** Processing\n\n` +
            `⏳ **Estimated completion:** 5-15 minutes\n\n` +
            `You'll receive another notification when complete.`,
      reply_markup: {
        inline_keyboard: [[
          { text: "🔍 Check Status", callback_data: `check_status_${orderId}` }
        ]]
      }
    };

    await sendTelegramMessage(userId, message);
  } catch (error) {
    console.error('[PaycrestWebhook] Error sending processing notification:', error);
  }
}

/**
 * Send Telegram message helper
 */
async function sendTelegramMessage(userId: string, message: any): Promise<void> {
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
      await notifyTelegram(user.telegram_chat_id, message.text);
    }
  } catch (error) {
    console.error('[PaycrestWebhook] Error sending Telegram message:', error);
  }
}

/**
 * Simple Telegram notification function
 */
async function notifyTelegram(chatId: string | number, text: string): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: 'Markdown' 
      }),
    });
  } catch (error) {
    console.error('[PaycrestWebhook] Telegram notification error:', error);
  }
}