import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface StartResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StartResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { freelancer_id } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  try {
    // Get milestone details with contract info
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        description,
        amount,
        status,
        contract_id,
        project_contracts!contract_milestones_contract_id_fkey (
          id,
          project_title,
          freelancer_id,
          client_email,
          client_name,
          currency,
          token_type
        )
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    const contract = Array.isArray(milestone.project_contracts) 
      ? milestone.project_contracts[0] 
      : milestone.project_contracts;

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Verify freelancer permission
    if (freelancer_id && contract.freelancer_id !== freelancer_id) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to start this milestone'
      });
    }

    if (milestone.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Milestone cannot be started. Current status: ${milestone.status}`
      });
    }

    // Update milestone status to in_progress
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to start milestone'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Milestone started successfully',
      milestone: updatedMilestone
    });

  } catch (error) {
    console.error('Error starting milestone:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}