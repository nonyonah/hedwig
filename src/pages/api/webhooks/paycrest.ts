import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// Create a simple supabase client for webhook operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const payload = JSON.parse(rawBody.toString('utf-8'));
    console.log('[PaycrestWebhook] Received webhook:', JSON.stringify(payload, null, 2));
    
    // Extract data from payload (handle both direct format and nested event format)
    const { orderId, status, transactionHash, amount, expectedAmount, updatedAt, event, data } = payload;
    const actualOrderId = orderId || data?.id;
    const actualStatus = status || event || data?.status;
    const orderData = data || payload;

    if (!actualOrderId || !actualStatus) {
      console.error('[PaycrestWebhook] Missing required fields:', { actualOrderId, actualStatus });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[PaycrestWebhook] Processing status update for order ${actualOrderId}: ${actualStatus}`);

    // Update database record
    const { data: transaction, error: dbError } = await supabase
      .from('offramp_transactions')
      .update({
        status: actualStatus.toLowerCase(),
        transaction_hash: transactionHash || orderData.transactionHash,
        updated_at: updatedAt || orderData.updatedAt || new Date().toISOString()
      })
      .eq('paycrest_order_id', actualOrderId)
      .select('user_id')
      .single();

    if (dbError) {
      console.error('[PaycrestWebhook] Database error:', dbError);
      return res.status(500).json({ error: 'Database update failed' });
    }

    if (!transaction) {
      console.warn(`[PaycrestWebhook] Transaction not found for order ${actualOrderId}`);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const userId = transaction.user_id;
    console.log(`[PaycrestWebhook] Found transaction for user ${userId}`);

    // Handle status-specific actions
    await handleWebhookStatusUpdate(userId, actualOrderId, actualStatus, {
      transactionHash: transactionHash || orderData.transactionHash,
      amount: amount || orderData.amount,
      expectedAmount: expectedAmount || orderData.expectedAmount,
      updatedAt: updatedAt || orderData.updatedAt
    });

    // Respond to Paycrest
    res.status(200).json({ 
      message: 'Webhook processed successfully',
      orderId: actualOrderId,
      status: 'processed'
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