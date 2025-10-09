import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { NetworkConfig, getCurrentNetworkEnvironment } from '../../../lib/envConfig';

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
  created_by: string;
}

interface PaymentLinkData {
  id: string;
  amount: number;
  token: string;
  status: string;
  user_name: string;
  payment_reason: string;
  recipient_email: string;
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
  const currentNetwork = getCurrentNetworkEnvironment();
  const expectedToken = NetworkConfig.alchemy.authToken(currentNetwork);
  return Boolean(expectedToken && token === expectedToken);
}

// Convert wei to readable format
function formatTokenAmount(value: string | number, decimals: number, isUSDC: boolean = false): number {
  let numericValue: number;

  if (typeof value === 'string') {
    // Raw value from blockchain (e.g., "2000000" for 2 USDC)
    numericValue = parseFloat(value);
    const divisor = Math.pow(10, decimals);
    const result = numericValue / divisor;

    if (isUSDC) {
      return parseFloat(result.toFixed(2));
    } else {
      return parseFloat(result.toFixed(8));
    }
  } else {
    // Already formatted value from Alchemy (e.g., 0.1 for 0.1 USDC)
    if (isUSDC) {
      return parseFloat(value.toFixed(2));
    } else {
      return parseFloat(value.toFixed(8));
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-alchemy-signature'] as string;

    // TODO: Re-enable signature verification later
    // Temporarily disabled for testing
    console.log('⚠️ Webhook signature verification is temporarily disabled');

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

    // Check if activity exists and is an array
    if (!activity || !Array.isArray(activity) || activity.length === 0) {
      console.log('No activity found in webhook event or activity is not an array');
      return res.status(200).json({ message: 'No activity to process' });
    }

    // Track processed transactions to avoid duplicates
    const processedTransactions = new Set<string>();

    // Process each activity in the event
    for (const transfer of activity) {
      // Skip if we've already processed this transaction
      if (processedTransactions.has(transfer.hash)) {
        console.log(`⏭️ Skipping duplicate transaction: ${transfer.hash}`);
        continue;
      }

      // Mark this transaction as processed
      processedTransactions.add(transfer.hash);

      // Check if this transaction has already been processed in the database
      // Check both payments table (for invoices) and a general transaction log
      const [{ data: existingPayment }, { data: existingInvoice }, { data: existingPaymentLink }] = await Promise.all([
        supabase.from('payments').select('id').eq('tx_hash', transfer.hash).single(),
        supabase.from('invoices').select('id').eq('payment_transaction', transfer.hash).single(),
        supabase.from('payment_links').select('id').eq('transaction_hash', transfer.hash).single()
      ]);

      if (existingPayment || existingInvoice || existingPaymentLink) {
        console.log(`⏭️ Transaction already processed in database: ${transfer.hash}`);
        continue;
      }

      let currency: string;
      let amount: number;

      // Check if this is a supported token transfer
      const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC
      const BASE_MAINNET_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC

      const isUSDC = (transfer.category === 'erc20' || transfer.category === 'token') && (
        transfer.rawContract.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase() ||
        transfer.rawContract.address.toLowerCase() === BASE_MAINNET_USDC_ADDRESS.toLowerCase()
      );

      if (isUSDC) {
        // USDC transfer
        currency = 'USDC';
        amount = formatTokenAmount(transfer.value, transfer.rawContract.decimals, true);
      } else if (transfer.category === 'external' && transfer.asset === 'ETH') {
        // ETH transfer
        currency = 'ETH';
        amount = formatTokenAmount(transfer.value, 18, false); // ETH has 18 decimals
      } else {
        continue; // Skip unsupported transfers
      }

      // Normalize network name to remove "mainnet" suffix and capture token address
      const normalizedNetwork = event.event.network
        .replace(/[-_]mainnet$/i, '')
        .replace(/mainnet$/i, '')
        .toLowerCase();
      const tokenAddress = isUSDC ? transfer.rawContract.address : null;

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
      let relatedId = `direct_${transfer.hash}`; // Use transaction hash as unique ID for direct transfers
      let relatedItem: InvoiceData | PaymentLinkData | null = null;

      // Check for matching invoice
      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('id, amount, currency, status, freelancer_name, client_name, created_by')
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

        // Record completed transaction for permanent storage
        await supabase
          .from('completed_transactions')
          .upsert({
            user_id: walletData.user_id,
            from_address: transfer.fromAddress,
            to_address: transfer.toAddress,
            amount: amount,
            token_symbol: currency,
            token_address: tokenAddress,
            network: normalizedNetwork,
            status: 'completed',
            transaction_hash: transfer.hash,
            completed_at: new Date().toISOString(),
            metadata: { paymentType: 'invoice', invoiceId: invoiceData.id }
          }, { onConflict: 'transaction_hash' });
      } else {
        // Check for matching payment link
        const { data: paymentLinkData } = await supabase
          .from('payment_links')
          .select('id, amount, token, status, user_name, payment_reason, recipient_email')
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

          // Record completed transaction for permanent storage
          await supabase
            .from('completed_transactions')
            .upsert({
              user_id: walletData.user_id,
              from_address: transfer.fromAddress,
              to_address: transfer.toAddress,
              amount: amount,
              token_symbol: currency,
              token_address: tokenAddress,
              network: normalizedNetwork,
              status: 'completed',
              transaction_hash: transfer.hash,
              completed_at: new Date().toISOString(),
              metadata: { paymentType: 'payment_link', paymentLinkId: paymentLinkData.id }
            }, { onConflict: 'transaction_hash' });
        } else if (paymentType === 'direct_transfer') {
          // For direct transfers, create a record in payments table for tracking
          await supabase
            .from('payments')
            .insert({
              amount_paid: amount,
              payer_wallet: transfer.fromAddress,
              tx_hash: transfer.hash,
              status: 'completed',
              payment_type: 'direct_transfer',
              recipient_wallet: transfer.toAddress,
              recipient_user_id: walletData.user_id
            });

          // Record completed transaction for permanent storage
          await supabase
            .from('completed_transactions')
            .upsert({
              user_id: walletData.user_id,
              from_address: transfer.fromAddress,
              to_address: transfer.toAddress,
              amount: amount,
              token_symbol: currency,
              token_address: tokenAddress,
              network: normalizedNetwork,
              status: 'completed',
              transaction_hash: transfer.hash,
              completed_at: new Date().toISOString(),
              metadata: { paymentType: 'direct_transfer' }
            }, { onConflict: 'transaction_hash' });
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
          chain: normalizedNetwork,
          status: 'completed'
        };

        // Add type-specific data
        if (paymentType === 'direct_transfer') {
          // Keep existing direct transfer fields
        } else if (paymentType === 'invoice' && relatedItem && 'freelancer_name' in relatedItem) {
          notificationPayload.freelancerName = relatedItem.freelancer_name;
          notificationPayload.clientName = relatedItem.client_name;
          notificationPayload.recipientUserId = relatedItem.created_by;
        } else if (paymentType === 'payment_link' && relatedItem && 'user_name' in relatedItem) {
          notificationPayload.userName = relatedItem.user_name;
          notificationPayload.paymentReason = relatedItem.payment_reason;
          // Add the payment link data for proper notification handling
          notificationPayload.itemData = {
            id: relatedItem.id,
            title: relatedItem.user_name,
            description: relatedItem.payment_reason,
            recipientName: relatedItem.user_name,
            recipientEmail: relatedItem.recipient_email || null,
            user_name: relatedItem.user_name
          };
        }

        // Send HTTP request to payment-notifications webhook
        console.log('🔔 Preparing notification for Alchemy webhook:', { paymentType, relatedId, amount, currency });
        console.log('📤 Base notification payload:', notificationPayload);
        console.log('📋 Final notification payload:', JSON.stringify(notificationPayload, null, 2));

        const notificationUrl = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhooks/payment-notifications`;

        const notificationResponse = await fetch(notificationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationPayload),
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });

        if (notificationResponse.ok) {
          const responseData = await notificationResponse.json();
          console.log('✅ Alchemy notification sent successfully:', responseData);
        } else {
          const errorData = await notificationResponse.text();
          console.error('❌ Alchemy notification failed:', {
            status: notificationResponse.status,
            statusText: notificationResponse.statusText,
            error: errorData,
            url: notificationUrl,
            payload: notificationPayload
          });
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
        network: normalizedNetwork,
        recipientUserId: walletData.user_id,
        relatedId: relatedId,
        relatedItem: relatedItem ? (paymentType === 'invoice' && 'freelancer_name' in relatedItem ? relatedItem.freelancer_name : paymentType === 'payment_link' && 'user_name' in relatedItem ? relatedItem.user_name : 'unknown') : null
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      processed: processedTransactions.size
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