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

interface CompletionResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompletionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { milestoneId, completionNotes, deliverables } = req.body;

  if (!milestoneId) {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
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
          client_name,
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

    if (milestone.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Milestone is already ${milestone.status}. Only pending milestones can be completed.`
      });
    }

    // Update milestone status to completed
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_notes: completionNotes || null,
        deliverables: deliverables || null
      })
      .eq('id', milestoneId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to mark milestone as completed'
      });
    }

    // Log activity
    await supabase
      .from('contract_activities')
      .insert({
        contract_id: milestone.contract_id,
        activity_type: 'milestone_completed',
        actor_id: milestone.project_contracts.freelancer_id,
        actor_type: 'freelancer',
        description: `Milestone "${milestone.title}" marked as completed`,
        metadata: {
          milestone_id: milestoneId,
          milestone_title: milestone.title,
          completion_notes: completionNotes,
          deliverables: deliverables
        }
      });

    // Send notifications to client
    const contract = milestone.project_contracts;
    if (contract) {
      try {
        await sendMilestoneCompletionNotifications(milestone, contract);
      } catch (notificationError) {
        console.error('Failed to send milestone completion notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Milestone marked as completed successfully. Client has been notified for approval.',
      milestone: updatedMilestone
    });

  } catch (error) {
    console.error('Error in milestone completion:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Send notifications to client about milestone completion
 */
async function sendMilestoneCompletionNotifications(milestone: any, contract: any) {
  const freelancerName = contract.users?.username || 'Freelancer';
  const clientEmail = contract.client_email;
  const clientName = contract.client_name || 'Client';

  // Send email notification to client
  if (clientEmail) {
    await sendSimpleEmail(
      clientEmail,
      `🎯 Milestone Completed: ${milestone.title}`,
      generateMilestoneCompletionEmailTemplate(milestone, contract, freelancerName)
    );
  }

  // Send Telegram notification to freelancer (confirmation)
  if (contract.users?.telegram_user_id) {
    const message = `✅ *Milestone Completed*\n\n` +
      `📋 Project: ${contract.project_title}\n` +
      `🎯 Milestone: ${milestone.title}\n` +
      `💰 Amount: ${milestone.amount} ${contract.currency}\n\n` +
      `Your client (${clientName}) has been notified and will review your work for approval.`;

    await sendTelegramNotification(contract.users.telegram_user_id, message);
  }

  // If client has Telegram, send notification there too
  if (contract.client_id) {
    const { data: clientUser } = await supabase
      .from('users')
      .select('telegram_user_id')
      .eq('id', contract.client_id)
      .single();

    if (clientUser?.telegram_user_id) {
      const message = `🎯 *Milestone Completed - Review Required*\n\n` +
        `📋 Project: ${contract.project_title}\n` +
        `👤 Freelancer: ${freelancerName}\n` +
        `🎯 Milestone: ${milestone.title}\n` +
        `💰 Amount: ${milestone.amount} ${contract.currency}\n\n` +
        `Please review the completed work and approve or request changes.\n\n` +
        `View details: ${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}`;

      await sendTelegramNotification(clientUser.telegram_user_id, message);
    }
  }
}

/**
 * Generate email template for milestone completion notification
 */
function generateMilestoneCompletionEmailTemplate(milestone: any, contract: any, freelancerName: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz';
  const contractUrl = `${baseUrl}/contracts/${contract.id}`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h2 style="color: #166534; margin: 0 0 8px 0;">🎯 Milestone Completed</h2>
        <p style="color: #15803d; margin: 0;">Your freelancer has completed a milestone and is ready for your review.</p>
      </div>

      <h3>Milestone Details</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Project:</td>
          <td style="padding: 8px 0;">${contract.project_title}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Freelancer:</td>
          <td style="padding: 8px 0;">${freelancerName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Milestone:</td>
          <td style="padding: 8px 0;">${milestone.title}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Description:</td>
          <td style="padding: 8px 0;">${milestone.description || 'No description provided'}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
          <td style="padding: 8px 0;">${milestone.amount} ${contract.currency}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Completed:</td>
          <td style="padding: 8px 0;">${new Date(milestone.completed_at).toLocaleDateString()}</td>
        </tr>
      </table>

      ${milestone.completion_notes ? `
        <h4>Completion Notes</h4>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; white-space: pre-wrap;">${milestone.completion_notes}</p>
        </div>
      ` : ''}

      ${milestone.deliverables ? `
        <h4>Deliverables</h4>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0; white-space: pre-wrap;">${milestone.deliverables}</p>
        </div>
      ` : ''}

      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h4 style="color: #92400e; margin: 0 0 8px 0;">⏰ Action Required</h4>
        <p style="color: #92400e; margin: 0;">Please review the completed work and either approve it or request changes. The freelancer is waiting for your feedback.</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${contractUrl}" 
           style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 12px;">
          Review & Approve
        </a>
        <a href="${contractUrl}?action=request_changes" 
           style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Request Changes
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        This milestone completion notification was sent automatically. If you have any questions, please contact support.
      </p>
    </div>
  `;
}