import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentId, status, transactionHash } = req.body as {
      paymentId?: string;
      status?: string; // UI sends 'completed' on success
      transactionHash?: string;
    };

    if (!paymentId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Map external status to DB enum: ('pending','paid','expired','cancelled')
    const dbStatus: 'pending' | 'paid' | 'expired' | 'cancelled' = status === 'completed' ? 'paid' : status as 'pending' | 'paid' | 'expired' | 'cancelled';

    // First get the payment link to access the amount and check for linked proposal/invoice
    const { data: paymentLink, error: fetchError } = await supabase
      .from('payment_links')
      .select('*, proposal_id, invoice_id')
      .eq('id', paymentId)
      .single();

    if (fetchError) {
      console.error('Error fetching payment link:', fetchError);
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Update payment status with paid_amount
    const updateData: any = {
      status: dbStatus,
      transaction_hash: transactionHash,
      updated_at: new Date().toISOString()
    };

    if (dbStatus === 'paid') {
      updateData.paid_at = new Date().toISOString();
      updateData.paid_amount = paymentLink.amount; // Set paid_amount for earnings tracking
    }

    const { data, error } = await supabase
      .from('payment_links')
      .update(updateData)
      .eq('id', paymentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating payment status:', error);
      return res.status(500).json({ error: 'Failed to update payment status' });
    }

    // If payment is completed and there's a recipient email, send notification
    if (dbStatus === 'paid' && data.recipient_email) {
      // TODO: Implement email notification using Resend
      console.log('Payment completed, should send email to:', data.recipient_email);
    }

    // If payment is completed, update linked proposal or invoice status
    if (dbStatus === 'paid') {
      try {
        if (data.proposal_id) {
          // Update linked proposal status
          const { error: proposalError } = await supabase
            .from('proposals')
            .update({
              status: 'completed',
              paid_at: new Date().toISOString(),
              payment_transaction: transactionHash
            })
            .eq('id', data.proposal_id);

          if (proposalError) {
            console.error('Error updating linked proposal:', proposalError);
          } else {
            console.log('Successfully updated linked proposal status to completed');
          }
        }

        if (data.invoice_id) {
          // Update linked invoice status
          const { error: invoiceError } = await supabase
            .from('invoices')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              payment_transaction: transactionHash
            })
            .eq('id', data.invoice_id);

          if (invoiceError) {
            console.error('Error updating linked invoice:', invoiceError);
          } else {
            console.log('Successfully updated linked invoice status to paid');
          }
        }
      } catch (linkUpdateError) {
        console.error('Error updating linked proposal/invoice:', linkUpdateError);
        // Don't fail the main request if linked update fails
      }
    }

    // Send payment notification webhook
    try {
      const notificationData = {
        type: 'payment_link' as const,
        id: paymentId,
        amount: data.amount,
        currency: data.currency || 'USDC',
        transactionHash,
        payerWallet: data.payer_wallet_address,
        status: dbStatus
      };

      // Call internal webhook
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payment-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationData)
      });

      // If there's a linked proposal, also send proposal notification
      if (dbStatus === 'paid' && data.proposal_id) {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'proposal',
            id: data.proposal_id,
            amount: data.amount,
            currency: data.currency || 'USDC',
            transactionHash,
            payerWallet: data.payer_wallet_address,
            status: 'completed'
          })
        });
      }

      // If there's a linked invoice, also send invoice notification
      if (dbStatus === 'paid' && data.invoice_id) {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'invoice',
            id: data.invoice_id,
            amount: data.amount,
            currency: data.currency || 'USDC',
            transactionHash,
            payerWallet: data.payer_wallet_address,
            status: 'paid'
          })
        });
      }
    } catch (webhookError) {
      console.error('Error sending payment notification:', webhookError);
      // Don't fail the main request if webhook fails
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error in update-payment-status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}