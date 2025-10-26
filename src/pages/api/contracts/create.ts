import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ContractNotificationService } from '../../../services/contractNotificationService';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Milestone {
  title: string;
  description?: string;
  amount: number;
  due_date: string; // ISO date string
}

interface CreateContractRequest {
  freelancer_id: string;
  client_name: string;
  client_email: string;
  title: string;
  description?: string;
  total_amount: number;
  currency: string;
  allow_part_payments: boolean;
  deadline: string; // ISO date string
  milestones: Milestone[];
  source_type?: 'manual' | 'telegram' | 'dashboard';
}

interface CreateContractResponse {
  success: boolean;
  contract_id?: string;
  approval_url?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateContractResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const {
      freelancer_id,
      client_name,
      client_email,
      title,
      description,
      total_amount,
      currency = 'USDC',
      allow_part_payments = true,
      deadline,
      milestones,
      source_type = 'manual'
    }: CreateContractRequest = req.body;

    // Validate required fields
    if (!freelancer_id || !client_email || !title || !total_amount || !deadline || !milestones?.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: freelancer_id, client_email, title, total_amount, deadline, milestones'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(client_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate milestones total matches contract total
    const milestonesTotal = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
    if (Math.abs(milestonesTotal - total_amount) > 0.01) {
      return res.status(400).json({
        success: false,
        error: 'Milestones total amount must equal contract total amount'
      });
    }

    // Verify freelancer exists
    const { data: freelancer, error: freelancerError } = await supabase
      .from('users')
      .select('id, username, email')
      .eq('id', freelancer_id)
      .single();

    if (freelancerError || !freelancer) {
      return res.status(404).json({
        success: false,
        error: 'Freelancer not found'
      });
    }

    // Generate approval token
    const approval_token = crypto.randomBytes(32).toString('base64url');
    const approval_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        freelancer_id,
        client_email: client_email.toLowerCase().trim(),
        client_name: client_name?.trim(),
        title: title.trim(),
        description: description?.trim(),
        total_amount,
        currency: currency.toUpperCase(),
        allow_part_payments,
        deadline,
        status: 'pending_approval',
        approval_token,
        approval_expires_at: approval_expires_at.toISOString(),
        source_type
      })
      .select()
      .single();

    if (contractError) {
      console.error('Error creating contract:', contractError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create contract'
      });
    }

    // Create milestones
    const milestoneInserts = milestones.map((milestone, index) => ({
      contract_id: contract.id,
      title: milestone.title.trim(),
      description: milestone.description?.trim(),
      amount: milestone.amount,
      due_date: milestone.due_date,
      order_index: index + 1
    }));

    const { data: createdMilestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .insert(milestoneInserts)
      .select();

    if (milestonesError) {
      console.error('Error creating milestones:', milestonesError);
      // Rollback contract creation
      await supabase.from('contracts').delete().eq('id', contract.id);
      return res.status(500).json({
        success: false,
        error: 'Failed to create contract milestones'
      });
    }

    // Generate approval URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
    const approveUrl = `${baseUrl}/contracts/approve/${approval_token}`;
    const declineUrl = `${baseUrl}/contracts/decline/${approval_token}`;

    // Use the new notification service to send contract creation notifications
    const notificationService = new ContractNotificationService();
    
    try {
      await notificationService.sendContractCreationNotification({
        contractId: contract.id,
        freelancerId: freelancer_id,
        clientEmail: client_email,
        clientName: client_name || 'Client',
        contractTitle: title,
        contractDescription: description,
        totalAmount: total_amount,
        currency,
        milestones: createdMilestones?.map(m => ({
          id: m.id,
          title: m.title,
          amount: m.amount,
          due_date: m.due_date
        })),
        approvalToken: approval_token
      });
    } catch (notificationError) {
      console.error('Failed to send contract creation notifications:', notificationError);
      // Don't fail the contract creation if notifications fail
    }

    return res.status(201).json({
      success: true,
      contract_id: contract.id,
      approval_url: approveUrl
    });

  } catch (error) {
    console.error('Error in contract creation:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Contract creation email is now handled by ContractNotificationService