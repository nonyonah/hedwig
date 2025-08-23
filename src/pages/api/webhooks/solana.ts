import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Helius, TransactionType } from 'helius-sdk';
import bs58 from 'bs58';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const helius = new Helius(process.env.HELIUS_API_KEY!);

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
    const body = req.body;
    const signature = req.headers['helius-signature'] as string;
    const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('HELIUS_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature using Helius SDK
    const isValid = helius.webhooks.verify(
      Buffer.from(JSON.stringify(body)),
      Buffer.from(signature, 'base64'),
      webhookSecret
    );

    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const events = body as any[];

    for (const event of events) {
      if (event.type === TransactionType.NATIVE_TRANSFER) {
        for (const transfer of event.nativeTransfers || []) {
          if (transfer.amount <= 0) continue;
          
          const amount = transfer.amount / 1e9; // SOL has 9 decimals
          
          const { data: walletData, error: walletError } = await supabase
            .from('wallets')
            .select('user_id, users(id, telegram_chat_id, email, name)')
            .eq('address', transfer.toUserAccount.toLowerCase())
            .single();

          if (walletError || !walletData) {
            console.log(`No user found for wallet address: ${transfer.toUserAccount}`);
            continue;
          }

          await processPayment(
            walletData,
            amount,
            'SOL',
            event.signature,
            transfer.fromUserAccount,
            transfer.toUserAccount,
            'solana-mainnet',
            event
          );
        }
      } else if (event.type === TransactionType.TOKEN_TRANSFER) {
        const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        
        for (const transfer of event.tokenTransfers || []) {
          if (transfer.mint !== SOLANA_USDC_MINT || transfer.tokenAmount <= 0) continue;
          
          const amount = transfer.tokenAmount;
          
          const { data: walletData, error: walletError } = await supabase
            .from('wallets')
            .select('user_id, users(id, telegram_chat_id, email, name)')
            .eq('address', transfer.toUserAccount.toLowerCase())
            .single();

          if (walletError || !walletData) {
            console.log(`No user found for wallet address: ${transfer.toUserAccount}`);
            continue;
          }

          await processPayment(
            walletData,
            amount,
            'USDC',
            event.signature,
            transfer.fromUserAccount,
            transfer.toUserAccount,
            'solana-mainnet',
            event
          );
        }
      }
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

    // Add type-specific data
    if (paymentType === 'invoice' && relatedItem && 'freelancer_name' in relatedItem) {
      notificationPayload.freelancerName = relatedItem.freelancer_name;
      notificationPayload.clientName = relatedItem.client_name;
    } else if (paymentType === 'payment_link' && relatedItem && 'user_name' in relatedItem) {
      notificationPayload.userName = relatedItem.user_name;
      notificationPayload.paymentReason = relatedItem.payment_reason;
    }

    // Call payment-notifications webhook directly
    const { default: paymentNotificationHandler } = await import('./payment-notifications');
    const mockReq = {
      method: 'POST',
      body: notificationPayload
    } as NextApiRequest;
    const mockRes = {
      status: (code: number) => ({ json: (data: any) => console.log('Notification response:', code, data) }),
      json: (data: any) => console.log('Notification sent:', data)
    } as any;
    
    await paymentNotificationHandler(mockReq, mockRes);
  } catch (notificationError) {
    console.error('Failed to send notification:', notificationError);
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