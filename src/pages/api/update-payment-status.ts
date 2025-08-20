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
    const dbStatus = status === 'completed' ? 'paid' : status;

    // Update payment status
    const { data, error } = await supabase
      .from('payment_links')
      .update({
        status: dbStatus,
        transaction_hash: transactionHash,
        paid_at: dbStatus === 'paid' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
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

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error in update-payment-status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}