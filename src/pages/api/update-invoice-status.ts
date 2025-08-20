import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoiceId, status, transactionHash, amountPaid, payerWallet, freelancerAddress } = req.body as {
      invoiceId?: string;
      status?: string; // expects 'completed' | 'failed' | 'pending'
      transactionHash?: string;
      amountPaid?: number;
      payerWallet?: string;
      freelancerAddress?: string;
    };

    if (!invoiceId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Map external status to invoices.status domain
    // Our invoices.status supports: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue'
    const invoiceStatus = status === 'completed' ? 'paid' : status === 'failed' ? 'sent' : 'sent';

    // 1) Optionally fetch invoice to check wallet field and validate existence
    const { data: existingInvoice, error: fetchErr } = await supabase
      .from('invoices')
      .select('id, wallet_address')
      .eq('id', invoiceId)
      .single();

    if (fetchErr || !existingInvoice) {
      console.error('Error fetching invoice before update:', fetchErr);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // 2) If we have a freelancerAddress and the invoice wallet is empty, persist it
    if (freelancerAddress && (!existingInvoice.wallet_address || existingInvoice.wallet_address.trim() === '')) {
      const { error: walletUpdateErr } = await supabase
        .from('invoices')
        .update({ wallet_address: freelancerAddress })
        .eq('id', invoiceId);
      if (walletUpdateErr) {
        console.warn('Failed to persist freelancer wallet on invoice:', walletUpdateErr);
      }
    }

    // 3) Update invoice status with paid_at timestamp
    const updateData: any = { status: invoiceStatus };
    if (invoiceStatus === 'paid') {
      updateData.paid_at = new Date().toISOString();
      updateData.payment_transaction = transactionHash;
    }
    
    const { data, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating invoice status:', error);
      return res.status(500).json({ error: 'Failed to update invoice status' });
    }

    // 4) Insert payment record when we have enough details
    if (status === 'completed' && amountPaid && payerWallet) {
      const { error: paymentErr } = await supabase
        .from('payments')
        .insert({
          invoice_id: invoiceId,
          amount_paid: amountPaid,
          payer_wallet: payerWallet,
          tx_hash: transactionHash || null,
          status: 'completed',
        });
      if (paymentErr) {
        console.warn('Payment succeeded but failed to insert payments row:', paymentErr);
      }
    }

    // Send payment notification webhook
    try {
      const notificationData = {
        type: 'invoice' as const,
        id: invoiceId,
        amount: amountPaid || data.amount,
        currency: data.currency || 'USDC',
        transactionHash,
        payerWallet,
        recipientWallet: freelancerAddress,
        status: 'paid' as const
      };

      // Call internal webhook
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payment-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationData)
      });
    } catch (webhookError) {
      console.error('Error sending payment notification:', webhookError);
      // Don't fail the main request if webhook fails
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error in update-invoice-status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
