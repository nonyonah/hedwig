import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SubmitResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubmitResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { deliverables, completion_notes, freelancer_id } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  if (!deliverables || !completion_notes) {
    return res.status(400).json({
      success: false,
      error: 'Deliverables and completion notes are required'
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
        contract_id
      `)
      .eq('id', id)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    // Get contract details separately
    const { data: contract, error: contractError } = await supabase
      .from('project_contracts')
      .select(`
        id,
        project_title,
        freelancer_id,
        client_email,
        currency,
        token_type
      `)
      .eq('id', milestone.contract_id)
      .single();

    if (contractError || !contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }

    // Verify freelancer permission
    if (freelancer_id && contract.freelancer_id !== freelancer_id) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to submit this milestone'
      });
    }

    if (milestone.status === 'completed' || milestone.status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Milestone is already completed or approved'
      });
    }

    // Update milestone status to submitted with deliverables
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'submitted',
        deliverables: deliverables,
        completion_notes: completion_notes,
        completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit milestone'
      });
    }

    // Get freelancer details for notifications
    let freelancerName = 'Freelancer';
    let freelancerEmail = null;
    
    if (contract.freelancer_id) {
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, username, first_name, last_name, telegram_chat_id')
        .eq('id', contract.freelancer_id)
        .single();

      if (freelancer) {
        freelancerEmail = freelancer.email;
        freelancerName = freelancer.username || 
          `${freelancer.first_name || ''} ${freelancer.last_name || ''}`.trim() || 
          'Freelancer';
      }
    }

    // Send notification to client for review
    if (contract.client_email) {
      try {
        await sendMilestoneCompletionNotificationToClient(
          contract.client_email,
          'Client',
          milestone,
          contract,
          freelancerName,
          deliverables,
          completion_notes
        );
      } catch (emailError) {
        console.error('Failed to send client notification:', emailError);
      }
    }

    // Send confirmation to freelancer
    if (freelancerEmail) {
      try {
        await sendMilestoneSubmissionConfirmation(
          freelancerEmail,
          freelancerName,
          milestone,
          contract
        );
      } catch (emailError) {
        console.error('Failed to send freelancer confirmation:', emailError);
      }
    }

    // Record notification in milestone_notifications table
    await supabase.from('milestone_notifications').insert({
      milestone_id: milestone.id,
      contract_id: milestone.contract_id,
      notification_type: 'completed',
      recipient_type: 'client',
      freelancer_email: freelancerEmail,
      client_email: contract.client_email,
      sent_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Milestone submitted successfully. Client has been notified for review.',
      milestone: updatedMilestone
    });

  } catch (error) {
    console.error('Error submitting milestone:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function sendMilestoneCompletionNotificationToClient(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  freelancerName: string,
  deliverables: string,
  completionNotes: string
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = `📋 Milestone Ready for Review: ${milestone.title}`;

  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #10b981; }
        .deliverables { background: #f8f9fa; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        .action-buttons { text-align: center; margin: 30px 0; }
        .approve-btn { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 0 10px; }
        .changes-btn { background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 0 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">📋</div>
          <h1>Milestone Completed</h1>
          <p>Ready for your review and approval</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <p>Great news! <strong>${freelancerName}</strong> has completed a milestone for your project "<strong>${contract.project_title}</strong>" and is ready for your review.</p>
          
          <h3>📋 Milestone Details</h3>
          <ul>
            <li><strong>Title:</strong> ${milestone.title}</li>
            <li><strong>Description:</strong> ${milestone.description || 'No description provided'}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Freelancer:</strong> ${freelancerName}</li>
          </ul>
          
          <div class="deliverables">
            <h4>📦 Deliverables Submitted:</h4>
            <p>${deliverables}</p>
            
            <h4>📝 Completion Notes:</h4>
            <p>${completionNotes}</p>
          </div>
          
          <div class="action-buttons">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="approve-btn">📋 Continue to Contract</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li><strong>Review the deliverables</strong> - Check if the work meets your requirements</li>
            <li><strong>Take action on the contract page</strong> - Approve, send feedback, or generate invoice for payment</li>
            <li><strong>Payment</strong> - Generate invoice and pay once you're satisfied with the work</li>
          </ol>
          
          <p><strong>Important:</strong> Please review and respond within 7 days to keep the project on track.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Manage your projects at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendMilestoneSubmissionConfirmation(
  email: string,
  name: string,
  milestone: any,
  contract: any
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = `✅ Milestone Submitted: ${milestone.title}`;

  const emailTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #3b82f6; }
        .success { background: #f0f9ff; border: 1px solid #3b82f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
          <h1>Milestone Submitted</h1>
          <p>Your work has been sent for client review</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="success">
            <strong>✅ Milestone submitted successfully!</strong><br>
            Your work for "${milestone.title}" has been sent to the client for review.
          </div>
          
          <h3>📋 Submitted Milestone</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.project_title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Status:</strong> Awaiting Client Review</li>
          </ul>
          
          <h3>🚀 What Happens Next</h3>
          <ol>
            <li><strong>Client Review</strong> - The client will review your deliverables</li>
            <li><strong>Approval or Feedback</strong> - They'll either approve or request changes</li>
            <li><strong>Payment</strong> - Once approved, you'll receive payment automatically</li>
            <li><strong>Next Milestone</strong> - You can then start working on the next milestone</li>
          </ol>
          
          <p><strong>Timeline:</strong> Clients typically review submissions within 3-7 business days. You'll be notified immediately when they respond.</p>
          
          <p>Keep up the great work! 🎉</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Track your progress at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}