import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { status, transactionHash, senderAddress, chain } = req.body;

  if (!id || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // First, fetch the current payment link to check if it exists
    const { data: currentPaymentLink, error: fetchError } = await supabase
      .from('payment_links')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentPaymentLink) {
      console.error('Error fetching payment link:', fetchError);
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Prepare update data
    const updateData: any = {
      status: status, // Keep the original status ('paid' and 'completed' are both valid for payment_links)
      payment_transaction: transactionHash,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    // If updating to completed status and amount is paid, set paid_amount
    if (status === 'paid' && currentPaymentLink.amount) {
      updateData.paid_amount = currentPaymentLink.amount;
    }

    const { data, error } = await supabase
      .from('payment_links')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating payment link status:', error);
      return res.status(500).json({ error: 'Failed to update payment link status' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    // Send Telegram notification if status is paid and transactionHash is provided
    if (status === 'paid' && transactionHash) {
      try {
        // Use environment variable for base URL
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'payment_link',
            id: id,
            amount: data[0].amount,
            currency: data[0].currency || 'USDC',
            transactionHash,
            status: 'paid',
            payerWallet: senderAddress || 'unknown',
            chain: chain || 'base'
          }),
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(5000)
        });
        console.log('Telegram notification sent successfully');
      } catch (notificationError) {
        console.error('Failed to send Telegram notification:', notificationError);
        // Don't fail the status update if notification fails - this is non-critical
      }
    }

    res.status(200).json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error in payment link status update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}