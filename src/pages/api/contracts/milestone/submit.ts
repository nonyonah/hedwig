import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MilestoneSubmitRequest extends NextApiRequest {
  body: {
    contractId: string;
    milestoneId: string;
  };
}

export default async function handler(req: MilestoneSubmitRequest, res: NextApiResponse) {
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
      .select(`
        *,
        contract:project_contracts(
          *,
          legal_contract:legal_contracts(*)
        )
      `)
      .eq('id', milestoneId)
      .eq('contract_id', contractId)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    if (milestone.status !== 'in_progress') {
      return res.status(400).json({ error: 'Milestone is not in progress' });
    }

    // Update milestone status to completed (awaiting client approval)
    const { error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', milestoneId);

    if (updateError) {
      console.error('Failed to update milestone status:', updateError);
      return res.status(500).json({ error: 'Failed to submit milestone' });
    }

    // Send notification email to client
    const contract = milestone.contract;
    const legalContract = contract.legal_contract?.[0];
    
    if (legalContract?.client_email) {
      try {
        const emailHtml = generateMilestoneSubmissionEmailTemplate({
          clientName: legalContract.client_name,
          freelancerName: legalContract.freelancer_name,
          projectTitle: contract.project_title,
          milestoneTitle: milestone.title,
          milestoneAmount: milestone.amount,
          tokenType: legalContract.token_type || 'USDC',
          contractLink: `${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contractId}`
        });

        await sendSimpleEmail(
          legalContract.client_email,
          `🎯 Milestone Completed: ${milestone.title}`,
          emailHtml
        );
      } catch (emailError) {
        console.error('Failed to send client notification:', emailError);
        // Don't fail the submission if email fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Milestone submitted successfully',
      milestoneId: milestoneId
    });

  } catch (error) {
    console.error('Milestone submit error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

function generateMilestoneSubmissionEmailTemplate(data: {
  clientName: string;
  freelancerName: string;
  projectTitle: string;
  milestoneTitle: string;
  milestoneAmount: number;
  tokenType: string;
  contractLink: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Milestone Completed - Review Required</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .milestone { background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 24px; font-weight: bold; color: #667eea; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Milestone Completed</h1>
          <p>Review and approve the completed work</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${data.clientName}</strong>,</p>
          
          <p>Great news! <strong>${data.freelancerName}</strong> has completed a milestone for your project and submitted it for review.</p>
          
          <div class="milestone">
            <h3>📋 Milestone Details</h3>
            <ul>
              <li><strong>Project:</strong> ${data.projectTitle}</li>
              <li><strong>Milestone:</strong> ${data.milestoneTitle}</li>
              <li><strong>Amount:</strong> <span class="amount">${data.milestoneAmount} ${data.tokenType}</span></li>
              <li><strong>Freelancer:</strong> ${data.freelancerName}</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.contractLink}" class="button">📝 Review & Approve Milestone</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li>Review the completed work and deliverables</li>
            <li>If satisfied, approve the milestone to release payment</li>
            <li>If changes are needed, communicate with ${data.freelancerName}</li>
            <li>Payment will be automatically released from escrow upon approval</li>
          </ol>
          
          <p><strong>Important:</strong> Once you approve this milestone, the payment will be automatically released from the smart contract escrow to ${data.freelancerName}.</p>
          
          <p>If you have any questions about the deliverables, please reach out to ${data.freelancerName} directly or contact our support team.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Manage your contracts at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;
}