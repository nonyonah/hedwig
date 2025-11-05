import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Send Telegram notification
 */
async function sendTelegramNotification(chatId: string, message: string): Promise<void> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    throw error;
  }
}

interface ApprovalResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApprovalResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { milestoneId, action, feedback, clientId } = req.body;

  if (!milestoneId || !action || !clientId) {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID, action, and client ID are required'
    });
  }

  if (!['approve', 'request_changes'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'Action must be either "approve" or "request_changes"'
    });
  }

  try {
    // Get milestone details with contract and user information
    const { data: milestone, error: milestoneError } = await supabase
      .from('contract_milestones')
      .select(`
        *,
        project_contracts!contract_milestones_contract_id_fkey (
          id,
          project_title,
          freelancer_id,
          client_id,
          client_email,
          currency,
          users!project_contracts_freelancer_id_fkey (
            id,
            email,
            username,
            telegram_user_id
          )
        )
      `)
      .eq('id', milestoneId)
      .single();

    if (milestoneError || !milestone) {
      return res.status(404).json({
        success: false,
        error: 'Milestone not found'
      });
    }

    // Verify client authorization
    if (milestone.project_contracts.client_id !== clientId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: You can only approve milestones for your own contracts'
      });
    }

    if (milestone.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Milestone must be completed before it can be approved. Current status: ${milestone.status}`
      });
    }

    let updateData: any = {};
    let activityDescription = '';
    let successMessage = '';

    if (action === 'approve') {
      updateData = {
        status: 'approved',
        approved_at: new Date().toISOString(),
        approval_feedback: feedback || null
      };
      activityDescription = `Milestone "${milestone.title}" approved by client`;
      successMessage = 'Milestone approved successfully. Freelancer has been notified and payment can now be processed.';
    } else {
      updateData = {
        status: 'changes_requested',
        changes_requested_at: new Date().toISOString(),
        change_request_feedback: feedback || null
      };
      activityDescription = `Changes requested for milestone "${milestone.title}"`;
      successMessage = 'Changes requested successfully. Freelancer has been notified.';
    }

    // Update milestone status
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update(updateData)
      .eq('id', milestoneId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update milestone status'
      });
    }

    // Log activity
    await supabase
      .from('contract_activities')
      .insert({
        contract_id: milestone.contract_id,
        activity_type: action === 'approve' ? 'milestone_approved' : 'changes_requested',
        actor_id: clientId,
        actor_type: 'client',
        description: activityDescription,
        metadata: {
          milestone_id: milestoneId,
          milestone_title: milestone.title,
          feedback: feedback,
          action: action
        }
      });

    // Send notifications
    const contract = milestone.project_contracts;
    if (contract) {
      try {
        await sendMilestoneApprovalNotifications(milestone, contract, action, feedback);
      } catch (notificationError) {
        console.error('Failed to send milestone approval notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
    }

    return res.status(200).json({
      success: true,
      message: successMessage,
      milestone: updatedMilestone
    });

  } catch (error) {
    console.error('Error in milestone approval:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Send notifications about milestone approval/change requests
 */
async function sendMilestoneApprovalNotifications(
  milestone: any, 
  contract: any, 
  action: string, 
  feedback?: string
) {
  const freelancerName = contract.users?.username || 'Freelancer';
  const freelancerEmail = contract.users?.email;
  const clientName = 'Client';

  if (action === 'approve') {
    // Send approval notifications
    
    // Email to freelancer
    if (freelancerEmail) {
      await sendSimpleEmail(
        freelancerEmail,
        `🎉 Milestone Approved: ${milestone.title}`,
        generateMilestoneApprovalEmailTemplate(milestone, contract, clientName, feedback)
      );
    }

    // Telegram to freelancer
    if (contract.users?.telegram_user_id) {
      const message = `🎉 *Milestone Approved!*\n\n` +
        `📋 Project: ${contract.project_title}\n` +
        `🎯 Milestone: ${milestone.title}\n` +
        `💰 Amount: ${milestone.amount} ${contract.currency}\n` +
        `👤 Client: ${clientName}\n\n` +
        `Congratulations! Your milestone has been approved and payment can now be processed.\n\n` +
        `${feedback ? `💬 Client feedback: "${feedback}"\n\n` : ''}` +
        `View details: ${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}`;

      await sendTelegramNotification(contract.users.telegram_user_id, message);
    }

  } else {
    // Send change request notifications
    
    // Email to freelancer
    if (freelancerEmail) {
      await sendSimpleEmail(
        freelancerEmail,
        `🔄 Changes Requested: ${milestone.title}`,
        generateChangeRequestEmailTemplate(milestone, contract, clientName, feedback)
      );
    }

    // Telegram to freelancer
    if (contract.users?.telegram_user_id) {
      const message = `🔄 *Changes Requested*\n\n` +
        `📋 Project: ${contract.project_title}\n` +
        `🎯 Milestone: ${milestone.title}\n` +
        `💰 Amount: ${milestone.amount} ${contract.currency}\n` +
        `👤 Client: ${clientName}\n\n` +
        `Your client has requested some changes to this milestone.\n\n` +
        `${feedback ? `💬 Feedback: "${feedback}"\n\n` : ''}` +
        `Please review the feedback and resubmit when ready.\n\n` +
        `View details: ${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}`;

      await sendTelegramNotification(contract.users.telegram_user_id, message);
    }
  }
}

/**
 * Generate email template for milestone approval
 */
function generateMilestoneApprovalEmailTemplate(
  milestone: any, 
  contract: any, 
  clientName: string, 
  feedback?: string
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
  const contractUrl = `${baseUrl}/contracts/${contract.id}`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h2 style="color: #166534; margin: 0 0 8px 0;">🎉 Milestone Approved!</h2>
        <p style="color: #15803d; margin: 0;">Congratulations! Your milestone has been approved by the client.</p>
      </div>

      <h3>Milestone Details</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${contract.project_title}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Client:</td>
          <td style="padding: 8px 0;">${clientName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Milestone:</td>
          <td style="padding: 8px 0;">${milestone.title}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
          <td style="padding: 8px 0;">${milestone.amount} ${contract.currency}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Approved:</td>
          <td style="padding: 8px 0;">${new Date().toLocaleDateString()}</td>
        </tr>
      </table>

      ${feedback ? `
        <h4>Client Feedback</h4>
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; white-space: pre-wrap;">${feedback}</p>
        </div>
      ` : ''}

      <div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h4 style="color: #166534; margin: 0 0 8px 0;">💰 Payment Processing</h4>
        <p style="color: #15803d; margin: 0;">Your milestone has been approved and payment can now be processed. You should receive payment according to the contract terms.</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${contractUrl}" 
           style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View Contract Details
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        This approval notification was sent automatically. If you have any questions about payment, please contact your client or support.
      </p>
    </div>
  `;
}

/**
 * Generate email template for change requests
 */
function generateChangeRequestEmailTemplate(
  milestone: any, 
  contract: any, 
  clientName: string, 
  feedback?: string
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
  const contractUrl = `${baseUrl}/contracts/${contract.id}`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h2 style="color: #92400e; margin: 0 0 8px 0;">🔄 Changes Requested</h2>
        <p style="color: #92400e; margin: 0;">Your client has requested some changes to your milestone submission.</p>
      </div>

      <h3>Milestone Details</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${contract.project_title}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Client:</td>
          <td style="padding: 8px 0;">${clientName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Milestone:</td>
          <td style="padding: 8px 0;">${milestone.title}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
          <td style="padding: 8px 0;">${milestone.amount} ${contract.currency}</td>
        </tr>
      </table>

      ${feedback ? `
        <h4>Client Feedback</h4>
        <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; white-space: pre-wrap;">${feedback}</p>
        </div>
      ` : ''}

      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h4 style="color: #1e40af; margin: 0 0 8px 0;">📝 Next Steps</h4>
        <p style="color: #1e40af; margin: 0;">Please review the client's feedback, make the necessary changes, and resubmit the milestone when ready.</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${contractUrl}" 
           style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View Contract & Resubmit
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        This change request notification was sent automatically. If you have any questions, please contact your client directly.
      </p>
    </div>
  `;
}