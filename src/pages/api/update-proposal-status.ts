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

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error in update-proposal-status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
