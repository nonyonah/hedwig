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
  const { status, transactionHash } = req.body;

  if (!id || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ 
        status: status === 'paid' ? 'completed' : status,
        payment_transaction: transactionHash,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating invoice status:', error);
      return res.status(500).json({ error: 'Failed to update invoice status' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Send Telegram notification if status is paid and transactionHash is provided
    if (status === 'paid' && transactionHash) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'invoice',
            id: id,
            amount: data[0].total || data[0].subtotal,
            currency: data[0].currency || 'USDC',
            transactionHash,
            status: 'paid'
          }),
        });
      } catch (notificationError) {
        console.error('Failed to send Telegram notification:', notificationError);
        // Don't fail the status update if notification fails
      }
    }

    res.status(200).json({ success: true, data: data[0] });
  } catch (error) {
    console.error('Error in invoice status update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}