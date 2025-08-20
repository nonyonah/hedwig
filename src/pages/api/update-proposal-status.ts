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
    const { proposalId, status, transactionHash } = req.body;

    if (!proposalId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // First, get the proposal data to access user information
    const { data: proposalData, error: fetchError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposalData) {
      console.error('Error fetching proposal:', fetchError);
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const { data, error } = await supabase
      .from('proposals')
      .update({
        status,
        transaction_hash: transactionHash,
        paid_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .select()
      .single();

    if (error) {
      console.error('Error updating proposal status:', error);
      return res.status(500).json({ error: 'Failed to update proposal status' });
    }

    // If status is completed, trigger payment notification
    if (status === 'completed' && transactionHash) {
      try {
        // Call the payment notification webhook internally
        const notificationResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/webhooks/payment-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'proposal',
            id: proposalId,
            amount: proposalData.amount || proposalData.budget || 0,
            currency: proposalData.currency || 'USD',
            transactionHash,
            status: 'completed'
          })
        });

        if (!notificationResponse.ok) {
          console.error('Failed to send payment notification:', await notificationResponse.text());
        }
      } catch (notificationError) {
        console.error('Error sending payment notification:', notificationError);
        // Don't fail the main request if notification fails
      }
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error in update-proposal-status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
