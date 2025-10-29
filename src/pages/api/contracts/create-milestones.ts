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

  const { contractId, milestones } = req.body;

  if (!contractId) {
    return res.status(400).json({ error: 'Contract ID is required' });
  }

  if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
    return res.status(400).json({ error: 'Milestones array is required' });
  }

  try {
    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if milestones already exist
    const { data: existingMilestones } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId);

    if (existingMilestones && existingMilestones.length > 0) {
      return res.status(400).json({ 
        error: 'Milestones already exist for this contract',
        milestones: existingMilestones
      });
    }

    // Validate total amount
    const totalMilestoneAmount = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
    if (Math.abs(totalMilestoneAmount - contract.total_amount) > 0.01) {
      return res.status(400).json({ 
        error: `Total milestone amount (${totalMilestoneAmount}) must equal contract amount (${contract.total_amount})`
      });
    }

    // Create milestones
    const milestoneInserts = milestones.map((milestone, index) => ({
      contract_id: contractId,
      title: milestone.title || `Milestone ${index + 1}`,
      description: milestone.description || `Milestone ${index + 1} for ${contract.project_title}`,
      amount: milestone.amount,
      due_date: milestone.due_date || new Date(Date.now() + (index + 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Weekly intervals
      status: 'pending'
    }));

    const { data: createdMilestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .insert(milestoneInserts)
      .select();

    if (milestonesError) {
      console.error('Error creating milestones:', milestonesError);
      return res.status(500).json({ error: 'Failed to create milestones', details: milestonesError });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully created ${createdMilestones?.length || 0} milestone(s)`,
      contract: {
        id: contract.id,
        title: contract.project_title,
        amount: contract.total_amount,
        currency: contract.currency || contract.token_type
      },
      milestones: createdMilestones || []
    });

  } catch (error) {
    console.error('Error creating milestones:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}