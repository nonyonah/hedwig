import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Alchemy Webhook Event Types
interface AlchemyWebhookEvent {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      blockNum: string;
      hash: string;
      value: number;
      asset: string;
      category: string;
      rawContract: {
        address: string;
        decimals: number;
      };
      log?: {
        blockNumber: string;
        blockHash: string;
        transactionIndex: string;
        removed: boolean;
        address: string;
        data: string;
        topics: string[];
        transactionHash: string;
        logIndex: string;
      };
    }>;
  };
}

interface InvoiceData {
  id: string;
  amount: number;
  currency: string;
  status: string;
  freelancer_name: string;
  client_name: string;
}

interface PaymentLinkData {
  id: string;
  amount: number;
  token: string;
  status: string;
  user_name: string;
  payment_reason: string;
}

function isValidSignatureForStringBody(
  body: string, // must be raw string body, not json transformed version of the body
  signature: string, // your "X-Alchemy-Signature" from header
  signingKey: string, // taken from dashboard for specific webhook
): boolean {
  const hmac = crypto.createHmac("sha256", signingKey); // Create a HMAC SHA256 hash using the signing key
  hmac.update(body, "utf8"); // Update the token hash with the request body using utf8
  const digest = hmac.digest("hex");
  return signature === digest;
}

// Verify Alchemy auth token
function verifyAuthToken(token: string): boolean {
  const expectedToken = process.env.ALCHEMY_AUTH_TOKEN;
  return Boolean(expectedToken && token === expectedToken);
}

// Convert wei to readable format
function formatTokenAmount(value: number, decimals: number): number {
  const divisor = Math.pow(10, decimals);
  return value / divisor;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-alchemy-signature'] as string;
    
    // Verify webhook signature (Alchemy uses signature-based authentication)
    const signingKey = process.env.ALCHEMY_SIGNING_KEY;
    if (!signingKey) {
      console.error('ALCHEMY_SIGNING_KEY not configured');
      return res.status(500).json({ error: 'Signing key not configured' });
    }
    if (!signature || !isValidSignatureForStringBody(rawBody, signature, signingKey)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event: AlchemyWebhookEvent = req.body;
    
    // Log the complete webhook payload for debugging
    console.log('=== ALCHEMY WEBHOOK RECEIVED ===');
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-alchemy-signature': req.headers['x-alchemy-signature'] ? '[PRESENT]' : '[MISSING]'
    });
    console.log('Event Type:', event.type);
    console.log('Event ID:', event.id);
    console.log('Webhook ID:', event.webhookId);
    console.log('Network:', event.event?.network);
    console.log('Activity Count:', event.event?.activity?.length || 0);
    console.log('Complete Payload:', JSON.stringify(event, null, 2));
    console.log('================================');
    
    // Only process address activity events
    if (event.type !== 'ADDRESS_ACTIVITY') {
      console.log(`Skipping event type: ${event.type}`);
      return res.status(200).json({ message: 'Event type not processed' });
    }

    const { activity } = event.event;
    
    // Process each activity in the event
    for (const transfer of activity) {
      let currency: string;
      let amount: number;
      
      // Check if this is a supported token transfer
      const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      
      if (transfer.category === 'erc20' && transfer.rawContract.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()) {
        // USDC transfer
        currency = 'USDC';
        amount = formatTokenAmount(transfer.value, transfer.rawContract.decimals);
      } else if (transfer.category === 'external' && transfer.asset === 'ETH') {
        // ETH transfer
        currency = 'ETH';
        amount = formatTokenAmount(transfer.value, 18); // ETH has 18 decimals
      } else {
        continue; // Skip unsupported transfers
      }
      
      // Find the recipient user by wallet address (case-insensitive)
      console.log(`🔍 Looking up wallet address: ${transfer.toAddress}`);
      const { data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('user_id')
        .ilike('address', transfer.toAddress)
        .single();

      if (walletError || !walletData) {
        console.log(`❌ No user found for wallet address: ${transfer.toAddress}`);
        console.log('Wallet lookup error:', walletError);
        continue; // Skip this transfer
      }
      
      console.log(`✅ Found wallet for address ${transfer.toAddress}, user_id: ${walletData.user_id}`);

      // Get user data separately
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, telegram_chat_id, email, name')
        .eq('id', walletData.user_id)
        .single();
      
      if (userError || !userData) {
        console.log(`User data not found for user_id: ${walletData.user_id}`);
        continue; // Skip this transfer
      }

      // Attach user data to wallet data
      (walletData as any).user = userData;

      // Check if this transfer is for a specific invoice or payment link
      let paymentType = 'direct_transfer';
      let relatedId = event.id;
      let relatedItem: InvoiceData | PaymentLinkData | null = null;

      // Check for matching invoice
      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('id, amount, currency, status, freelancer_name, client_name')
        .eq('wallet_address', transfer.toAddress.toLowerCase())
        .eq('status', 'sent')
        .eq('currency', currency) // Match currency
        .gte('amount', amount * 0.95) // Allow 5% tolerance for fees/slippage
        .lte('amount', amount * 1.05)
        .single() as { data: InvoiceData | null; error: any };

      if (invoiceData) {
        paymentType = 'invoice';
        relatedId = invoiceData.id;
        relatedItem = invoiceData;
        
        // Update invoice status to paid and store sender info
        await supabase
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            payment_transaction: transfer.hash
          })
          .eq('id', invoiceData.id);

        // Record payment in payments table
        await supabase
          .from('payments')
          .insert({
            invoice_id: invoiceData.id,
            amount_paid: amount,
            payer_wallet: transfer.fromAddress,
            tx_hash: transfer.hash,
            status: 'completed'
          });
      } else {
        // Check for matching payment link
        const { data: paymentLinkData } = await supabase
          .from('payment_links')
          .select('id, amount, token, status, user_name, payment_reason')
          .eq('wallet_address', transfer.toAddress.toLowerCase())
          .eq('status', 'pending')
          .eq('token', 'USDC')
          .gte('amount', amount * 0.95) // Allow 5% tolerance
          .lte('amount', amount * 1.05)
          .single() as { data: PaymentLinkData | null; error: any };

        if (paymentLinkData) {
          paymentType = 'payment_link';
          relatedId = paymentLinkData.id;
          relatedItem = paymentLinkData;
          
          // Update payment link status to paid and store sender info
          await supabase
            .from('payment_links')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              paid_amount: amount,
              transaction_hash: transfer.hash,
              payer_wallet_address: transfer.fromAddress
            })
            .eq('id', paymentLinkData.id);
        }
      }

      // Send notification via the payment-notifications webhook
      try {
        const notificationPayload: any = {
          type: paymentType,
          id: relatedId,
          amount: amount,
          currency: currency,
          transactionHash: transfer.hash,
          senderAddress: transfer.fromAddress,
          recipientWallet: transfer.toAddress,
          recipientUserId: walletData.user_id,
          chain: event.event.network,
          status: 'completed'
        };

        // Add type-specific data
        if (paymentType === 'direct_transfer') {
          // Keep existing direct transfer fields
        } else if (paymentType === 'invoice' && relatedItem && 'freelancer_name' in relatedItem) {
          notificationPayload.freelancerName = relatedItem.freelancer_name;
          notificationPayload.clientName = relatedItem.client_name;
        } else if (paymentType === 'payment_link' && relatedItem && 'user_name' in relatedItem) {
          notificationPayload.userName = relatedItem.user_name;
          notificationPayload.paymentReason = relatedItem.payment_reason;
        }

        // Send HTTP request to payment-notifications webhook
        console.log('Preparing notification for Alchemy webhook:', { paymentType, relatedId, amount, currency });
        console.log('Base notification payload:', notificationPayload);
        console.log('Final notification payload:', JSON.stringify(notificationPayload, null, 2));
        
        const notificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/payment-notifications`;
        
        const notificationResponse = await fetch(notificationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationPayload)
        });
        
        if (notificationResponse.ok) {
          const responseData = await notificationResponse.json();
          console.log('Alchemy notification sent successfully:', responseData);
        } else {
          const errorData = await notificationResponse.text();
          console.error('Alchemy notification failed:', notificationResponse.status, errorData);
        }
      } catch (notificationError) {
        console.error('Failed to send notification:', notificationError);
        console.error('Notification error details:', notificationError.message, notificationError.stack);
        // Don't fail the webhook if notification fails
      }

      // Log the transfer for audit purposes
      console.log(`Alchemy Webhook: USDC transfer detected`, {
        type: paymentType,
        from: transfer.fromAddress,
        to: transfer.toAddress,
        amount: amount,
        txHash: transfer.hash,
        network: event.event.network,
        recipientUserId: walletData.user_id,
        relatedId: relatedId,
        relatedItem: relatedItem ? (paymentType === 'invoice' && 'freelancer_name' in relatedItem ? relatedItem.freelancer_name : paymentType === 'payment_link' && 'user_name' in relatedItem ? relatedItem.user_name : 'unknown') : null
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      processed: event.event.activity.length
    });

  } catch (error) {
    console.error('Error processing Alchemy webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Disable body parsing for webhook signature verification
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};