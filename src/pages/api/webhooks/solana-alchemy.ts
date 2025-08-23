import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Alchemy Solana Webhook Event Types
interface AlchemySolanaWebhookEvent {
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
      rawContract?: {
        address: string;
        decimals: number;
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

// Signature verification function
function isValidSignatureForStringBody(
  body: string,
  signature: string,
  signingKey: string,
): boolean {
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(body, 'utf8');
  const digest = hmac.digest('hex');
  return signature === digest;
}

// Auth token verification function
function verifyAuthToken(token: string): boolean {
  return token === process.env.ALCHEMY_SOLANA_AUTH_TOKEN;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    const signature = req.headers['x-alchemy-signature'] as string;
    const authToken = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-auth-token'] as string;

    console.log('Solana webhook headers:', {
      signature: signature ? 'present' : 'missing',
      authToken: authToken ? 'present' : 'missing',
      contentType: req.headers['content-type']
    });

    // Verify signature for non-deposit transactions
    if (signature && process.env.ALCHEMY_SOLANA_SIGNING_KEY) {
      const rawBody = JSON.stringify(body);
      if (!isValidSignatureForStringBody(rawBody, signature, process.env.ALCHEMY_SOLANA_SIGNING_KEY)) {
        console.error('Invalid signature for Solana webhook');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = body as AlchemySolanaWebhookEvent;

    // Process Alchemy Solana webhook events
    if (event.type === 'ADDRESS_ACTIVITY') {
      for (const activity of event.event.activity) {
        // Skip if no value or invalid activity
        if (!activity.value || activity.value <= 0) continue;

        // Determine if this is SOL or USDC transfer
        const isNativeSOL = activity.category === 'external' && activity.asset === 'SOL';
        const isUSDC = activity.category === 'token' && activity.rawContract?.address === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        
        if (!isNativeSOL && !isUSDC) continue;

        // Calculate amount based on token type
        let amount: number;
        let currency: string;
        
        if (isNativeSOL) {
          amount = activity.value / 1e9; // SOL has 9 decimals
          currency = 'SOL';
        } else if (isUSDC) {
          amount = activity.value / Math.pow(10, activity.rawContract?.decimals || 6); // USDC typically has 6 decimals
          currency = 'USDC';
        } else {
          continue;
        }

        // Try both original case and lowercase for wallet lookup
        let walletData;
        let walletError;
        
        // First try exact case match
        ({ data: walletData, error: walletError } = await supabase
          .from('wallets')
          .select('user_id, users(id, telegram_chat_id, email, name)')
          .eq('address', activity.toAddress)
          .single());

        // If not found, try lowercase
        if (walletError || !walletData) {
          ({ data: walletData, error: walletError } = await supabase
            .from('wallets')
            .select('user_id, users(id, telegram_chat_id, email, name)')
            .eq('address', activity.toAddress.toLowerCase())
            .single());
        }

        if (walletError || !walletData) {
          console.log(`No user found for wallet address: ${activity.toAddress}`);
          continue;
        }

        await processPayment(
          walletData,
          amount,
          currency,
          activity.hash,
          activity.fromAddress,
          activity.toAddress,
          event.event.network,
          event
        );
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