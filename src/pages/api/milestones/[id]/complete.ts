import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { projectNotificationService, NotificationData } from '../../../../services/projectNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MilestoneResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MilestoneResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  try {
    // Get milestone details
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        amount,
        status,
        contract_id,
        contracts!contract_milestones_contract_id_fkey (
          title,
          freelancer_id,
          client_email,
          currency,
          users!contracts_freelancer_id_fkey (
            email,
            first_name,
            last_name
          )
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

    if (milestone.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Milestone is already completed'
      });
    }

    // Update milestone status to completed
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to complete milestone'
      });
    }

    // Send notifications
    try {
      const contract = Array.isArray(milestone.contracts) ? milestone.contracts[0] : milestone.contracts;
      const users = contract?.users;
      const user = Array.isArray(users) ? users[0] : users;
      const notificationData: NotificationData = {
        contractId: milestone.contract_id,
        projectTitle: contract?.title || 'Unknown Project',
        freelancerId: contract?.freelancer_id,
        freelancerName: `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
        freelancerEmail: user?.email,
        clientName: 'Client',
        clientEmail: contract?.client_email,
        amount: milestone.amount,
        currency: contract?.currency || 'USD',
        milestoneTitle: milestone.title
      };

      await projectNotificationService.sendMilestoneAchievement(notificationData);
    } catch (notificationError) {
      console.error('Failed to send milestone completion notifications:', notificationError);
      // Don't fail the milestone completion if notifications fail
    }

    return res.status(200).json({
      success: true,
      message: 'Milestone completed successfully',
      milestone: updatedMilestone
    });

  } catch (error) {
    console.error('Error completing milestone:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}