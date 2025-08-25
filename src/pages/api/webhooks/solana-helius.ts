import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helius Solana webhook event interface
interface HeliusSolanaWebhookEvent {
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      userAccount: string;
    }>;
  }>;
  description: string;
  events: any;
  fee: number;
  feePayer: string;
  instructions: Array<any>;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  signature: string;
  slot: number;
  source: string;
  timestamp: number;
  tokenTransfers: Array<{
    fromTokenAccount: string;
    fromUserAccount: string;
    mint: string;
    toTokenAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    tokenStandard: string;
  }>;
  transactionError: any;
  type: string;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Helius Solana webhook received:', {
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent']
    });

    const event = req.body as HeliusSolanaWebhookEvent;
    
    // Log the complete webhook payload for debugging
    console.log('Complete Helius Solana webhook payload:', JSON.stringify(event, null, 2));

    // Process native SOL transfers
    for (const transfer of event.nativeTransfers || []) {
      if (!transfer.fromUserAccount || !transfer.toUserAccount || !transfer.amount) {
        console.warn('Invalid native transfer data:', transfer);
        continue;
      }

      // Try both original case and lowercase for wallet lookup
      let walletData;
      let walletError;
      
      // First try exact case match
      ({ data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('user_id, users(id, telegram_chat_id, email, name)')
        .eq('address', transfer.toUserAccount)
        .single());

      // If not found, try lowercase
      if (walletError || !walletData) {
        ({ data: walletData, error: walletError } = await supabase
          .from('wallets')
          .select('user_id, users(id, telegram_chat_id, email, name)')
          .eq('address', transfer.toUserAccount.toLowerCase())
          .single());
      }

      if (walletError || !walletData) {
        console.log(`No user found for wallet address: ${transfer.toUserAccount}`);
        continue;
      }

      await processPayment(
        walletData,
        transfer.amount / 1e9, // Convert lamports to SOL
        'SOL',
        event.signature,
        transfer.fromUserAccount,
        transfer.toUserAccount,
        'solana',
        event
      );
    }

    // Process token transfers (USDC)
    for (const transfer of event.tokenTransfers || []) {
      if (!transfer.fromUserAccount || !transfer.toUserAccount || !transfer.tokenAmount) {
        console.warn('Invalid token transfer data:', transfer);
        continue;
      }

      // Check if this is USDC
      const isUSDC = transfer.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      if (!isUSDC) {
        console.log('Skipping non-USDC transfer:', transfer);
        continue;
      }

      // Try both original case and lowercase for wallet lookup
      let walletData;
      let walletError;
      
      // First try exact case match
      ({ data: walletData, error: walletError } = await supabase
        .from('wallets')
        .select('user_id, users(id, telegram_chat_id, email, name)')
        .eq('address', transfer.toUserAccount)
        .single());

      // If not found, try lowercase
      if (walletError || !walletData) {
        ({ data: walletData, error: walletError } = await supabase
          .from('wallets')
          .select('user_id, users(id, telegram_chat_id, email, name)')
          .eq('address', transfer.toUserAccount.toLowerCase())
          .single());
      }

      if (walletError || !walletData) {
        console.log(`No user found for wallet address: ${transfer.toUserAccount}`);
        continue;
      }

      await processPayment(
        walletData,
        transfer.tokenAmount,
        'USDC',
        event.signature,
        transfer.fromUserAccount,
        transfer.toUserAccount,
        'solana',
        event
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing Helius webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function processPayment(
  walletData: any,
  amount: number,
  currency: string,
  transactionHash: string,
  fromAddress: string,
  toAddress: string,
  chain: string,
  event: any
) {
  // Check if this transfer is for a specific invoice or payment link
  let paymentType = 'direct_transfer';
  let relatedId = event.signature;
  let relatedItem: InvoiceData | PaymentLinkData | null = null;

  // Check for matching invoice
  const { data: invoiceData } = await supabase
    .from('invoices')
    .select('id, amount, currency, status, freelancer_name, client_name')
    .eq('wallet_address', toAddress.toLowerCase())
    .eq('status', 'sent')
    .gte('amount', amount * 0.95) // Allow 5% tolerance
    .lte('amount', amount * 1.05)
    .single() as { data: InvoiceData | null; error: any };

  if (invoiceData) {
    paymentType = 'invoice';
    relatedId = invoiceData.id;
    relatedItem = invoiceData;
    
    // Update invoice status to paid
    await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_transaction: transactionHash
      })
      .eq('id', invoiceData.id);

    // Record payment
    await supabase
      .from('payments')
      .insert({
        invoice_id: invoiceData.id,
        amount_paid: amount,
        payer_wallet: fromAddress,
        tx_hash: transactionHash,
        status: 'completed'
      });
  } else {
    // Check for matching payment link
    const { data: paymentLinkData } = await supabase
      .from('payment_links')
      .select('id, amount, token, status, user_name, payment_reason')
      .eq('wallet_address', toAddress.toLowerCase())
      .eq('status', 'pending')
      .eq('token', currency)
      .gte('amount', amount * 0.95)
      .lte('amount', amount * 1.05)
      .single() as { data: PaymentLinkData | null; error: any };

    if (paymentLinkData) {
      paymentType = 'payment_link';
      relatedId = paymentLinkData.id;
      relatedItem = paymentLinkData;
      
      // Update payment link status
      await supabase
        .from('payment_links')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_amount: amount,
          transaction_hash: transactionHash,
          payer_wallet_address: fromAddress
        })
        .eq('id', paymentLinkData.id);
    }
  }

  // Send notification
  try {
    console.log('Preparing notification for payment:', { paymentType, relatedId, amount, currency });
    
    const notificationPayload: any = {
      type: paymentType,
      id: relatedId,
      amount: amount,
      currency: currency,
      transactionHash: transactionHash,
      senderAddress: fromAddress,
      recipientWallet: toAddress,
      recipientUserId: walletData.user_id,
      chain: chain,
      status: 'completed'
    };
    
    console.log('Base notification payload:', notificationPayload);

    // Add type-specific data
    if (paymentType === 'invoice' && relatedItem && 'freelancer_name' in relatedItem) {
      notificationPayload.freelancerName = relatedItem.freelancer_name;
      notificationPayload.clientName = relatedItem.client_name;
      console.log('Added invoice-specific data:', { freelancerName: relatedItem.freelancer_name, clientName: relatedItem.client_name });
    } else if (paymentType === 'payment_link' && relatedItem && 'user_name' in relatedItem) {
      notificationPayload.userName = relatedItem.user_name;
      notificationPayload.paymentReason = relatedItem.payment_reason;
      console.log('Added payment link-specific data:', { userName: relatedItem.user_name, paymentReason: relatedItem.payment_reason });
    }
    
    console.log('Final notification payload:', JSON.stringify(notificationPayload, null, 2));

    // Send HTTP request to payment-notifications webhook
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
      console.log('Notification sent successfully:', responseData);
    } else {
      const errorData = await notificationResponse.text();
      console.error('Notification failed:', notificationResponse.status, errorData);
    }
  } catch (notificationError) {
    console.error('Failed to send notification:', notificationError);
    console.error('Notification error details:', notificationError.message, notificationError.stack);
  }

  // Log the transfer
  console.log(`Solana Webhook: ${currency} transfer detected`, {
    type: paymentType,
    from: fromAddress,
    to: toAddress,
    amount: amount,
    currency: currency,
    hash: transactionHash
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};