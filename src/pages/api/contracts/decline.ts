import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ContractNotificationService } from '../../../services/contractNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DeclineResponse {
  success: boolean;
  message?: string;
  contract?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<DeclineResponse>
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const approval_token = req.method === 'GET' 
      ? req.query.token as string 
      : req.body.approval_token;

    const decline_reason = req.method === 'GET'
      ? req.query.reason as string || 'No reason provided'
      : req.body.decline_reason || 'No reason provided';

    if (!approval_token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Approval token is required' 
      });
    }

    // Fetch contract by approval token
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        users!contracts_freelancer_id_fkey (
          id,
          username,
          email,
          telegram_user_id
        )
      `)
      .eq('approval_token', approval_token)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or expired approval token' 
      });
    }

    // Check if token is expired
    if (contract.approval_expires_at && new Date() > new Date(contract.approval_expires_at)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Approval token has expired' 
      });
    }

    // Check if already processed
    if (contract.status === 'approved') {
      return res.status(400).json({ 
        success: false, 
        error: 'Contract has already been approved' 
      });
    }

    if (contract.status === 'rejected') {
      return res.status(400).json({ 
        success: false, 
        error: 'Contract has already been declined' 
      });
    }

    // Update contract status to rejected
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({ 
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: decline_reason,
        approval_token: null, // Clear token after use
        approval_expires_at: null
      })
      .eq('id', contract.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating contract status:', updateError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to decline contract' 
      });
    }

    // Send notification to freelancer using the new notification service
    try {
      const notificationService = new ContractNotificationService();
      await notificationService.sendContractDeclineNotification({
        contractId: contract.id,
        freelancerId: contract.freelancer_id,
        clientEmail: contract.client_email || '',
        clientName: contract.client_name || 'Client',
        contractTitle: contract.title,
        contractDescription: contract.description,
        totalAmount: contract.total_amount,
        currency: contract.currency || 'USD',
        declineReason: decline_reason
      });
    } catch (notificationError) {
      console.error('Failed to send contract decline notification:', notificationError);
      // Don't fail the decline if notification fails
    }

    // For GET requests (direct link clicks), redirect to decline confirmation page
    if (req.method === 'GET') {
      const declineUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/declined?id=${contract.id}`;
      return res.redirect(302, declineUrl);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Contract declined successfully',
      contract: updatedContract
    });

  } catch (error) {
    console.error('Error in contract decline:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}

// Contract decline email is now handled by ContractNotificationService