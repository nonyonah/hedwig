import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MilestoneStartRequest extends NextApiRequest {
  body: {
    contractId: string;
    milestoneId: string;
  };
}

export default async function handler(req: MilestoneStartRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contractId, milestoneId } = req.body;

    if (!contractId || !milestoneId) {
      return res.status(400).json({ error: 'Contract ID and Milestone ID are required' });
    }

    // Verify the milestone exists and belongs to the contract
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('id', milestoneId)
      .eq('contract_id', contractId)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    if (milestone.status !== 'pending') {
      return res.status(400).json({ error: 'Milestone is not in pending status' });
    }

    // Update milestone status to in_progress
    const { error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', milestoneId);

    if (updateError) {
      console.error('Failed to update milestone status:', updateError);
      return res.status(500).json({ error: 'Failed to start milestone' });
    }

    res.status(200).json({
      success: true,
      message: 'Milestone started successfully',
      milestoneId: milestoneId
    });

  } catch (error) {
    console.error('Milestone start error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}