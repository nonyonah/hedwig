import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ChangesResponse {
  success: boolean;
  message?: string;
  milestone?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChangesResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { id } = req.query;
  const { changes_requested, client_feedback } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Milestone ID is required'
    });
  }

  if (!changes_requested) {
    return res.status(400).json({
      success: false,
      error: 'Changes requested description is required'
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
        deliverables,
        completion_notes,
        contract_id,
        project_contracts!contract_milestones_contract_id_fkey (
          id,
          project_title,
          freelancer_id,
          client_email,
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

    if (milestone.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Can only request changes for completed milestones'
      });
    }

    // Update milestone status back to in_progress with change requests
    const { data: updatedMilestone, error: updateError } = await supabase
      .from('contract_milestones')
      .update({
        status: 'in_progress',
        changes_requested: changes_requested,
        client_feedback: client_feedback || changes_requested,
        changes_requested_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating milestone status:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to request changes'
      });
    }

    // Get freelancer details for notifications
    let freelancerName = 'Freelancer';
    let freelancerEmail = null;
    let telegramChatId = null;
    
    if (contract.freelancer_id) {
      const { data: freelancer } = await supabase
        .from('users')
        .select('email, username, first_name, last_name, telegram_chat_id')
        .eq('id', contract.freelancer_id)
        .single();

      if (freelancer) {
        freelancerEmail = freelancer.email;
        telegramChatId = freelancer.telegram_chat_id;
        freelancerName = freelancer.username || 
          `${freelancer.first_name || ''} ${freelancer.last_name || ''}`.trim() || 
          'Freelancer';
      }
    }

    // Send change request notification to freelancer
    if (freelancerEmail) {
      try {
        await sendChangeRequestNotification(
          freelancerEmail,
          freelancerName,
          milestone,
          contract,
          changes_requested,
          client_feedback
        );

        // Send Telegram notification if available
        if (telegramChatId) {
          await sendChangeRequestTelegram(
            telegramChatId,
            milestone,
            contract,
            changes_requested
          );
        }
      } catch (emailError) {
        console.error('Failed to send freelancer notification:', emailError);
      }
    }

    // Send confirmation to client
    if (contract.client_email) {
      try {
        await sendClientChangeRequestConfirmation(
          contract.client_email,
          'Client',
          milestone,
          contract,
          freelancerName,
          changes_requested
        );
      } catch (emailError) {
        console.error('Failed to send client confirmation:', emailError);
      }
    }

    // Record notification in milestone_notifications table
    await supabase.from('milestone_notifications').insert({
      milestone_id: milestone.id,
      contract_id: milestone.contract_id,
      notification_type: 'changes_requested',
      recipient_type: 'freelancer',
      freelancer_email: freelancerEmail,
      client_email: contract.client_email,
      sent_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Changes requested successfully. Freelancer has been notified.',
      milestone: updatedMilestone
    });

  } catch (error) {
    console.error('Error requesting changes:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function sendChangeRequestNotification(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  changesRequested: string,
  clientFeedback: string
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = `🔄 Changes Requested: ${milestone.title}`;

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
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #f59e0b; }
        .changes { background: #fef3c7; border: 1px solid #f59e0b; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .feedback { background: #f8f9fa; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">🔄</div>
          <h1>Changes Requested</h1>
          <p>The client has requested revisions to your work</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="changes">
            <strong>🔄 Revision Required</strong><br>
            The client has reviewed your milestone "${milestone.title}" and requested some changes before approval.
          </div>
          
          <h3>📋 Milestone Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.project_title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Status:</strong> 🔄 Revision Required</li>
          </ul>
          
          <div class="feedback">
            <h4>📝 Changes Requested:</h4>
            <p>${changesRequested}</p>
            
            ${clientFeedback && clientFeedback !== changesRequested ? `
              <h4>💬 Additional Feedback:</h4>
              <p>${clientFeedback}</p>
            ` : ''}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">🔧 Make Changes & Resubmit</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li><strong>Review the feedback</strong> - Understand what changes are needed</li>
            <li><strong>Make the revisions</strong> - Update your work based on the feedback</li>
            <li><strong>Resubmit for review</strong> - Submit your updated work through the contract page</li>
            <li><strong>Get approval</strong> - Once approved, you'll receive payment</li>
          </ol>
          
          <p><strong>Don't worry!</strong> Change requests are normal and help ensure the final deliverable meets expectations. Use this feedback to improve your work and get it approved quickly.</p>
          
          <p>If you have any questions about the requested changes, feel free to reach out to the client directly.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Update your work at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendChangeRequestTelegram(
  telegramChatId: string,
  milestone: any,
  contract: any,
  changesRequested: string
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const message = `🔄 *Changes Requested*

The client has requested revisions to your work.

📋 *Project:* "${contract.project_title}"
🎯 *Milestone:* ${milestone.title}
💰 *Amount:* ${milestone.amount} ${currency}
🔄 *Status:* Revision Required

*Changes Requested:*
${changesRequested}

*Next Steps:*
• Review the feedback carefully
• Make the necessary revisions
• Resubmit your updated work
• Get approval and payment

[View Contract & Make Changes](${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id})

Don't worry - change requests help ensure quality! 💪`;

  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.statusText}`);
  }
}

async function sendClientChangeRequestConfirmation(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  freelancerName: string,
  changesRequested: string
) {
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = `🔄 Changes Requested: ${milestone.title}`;

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
        .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #6366f1; }
        .success { background: #f0f9ff; border: 1px solid #6366f1; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .feedback { background: #f8f9fa; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">🔄</div>
          <h1>Changes Requested</h1>
          <p>Freelancer has been notified of your feedback</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <div class="success">
            <strong>🔄 Changes requested successfully!</strong><br>
            ${freelancerName} has been notified of your feedback and will make the necessary revisions.
          </div>
          
          <h3>📋 Milestone Details</h3>
          <ul>
            <li><strong>Project:</strong> ${contract.project_title}</li>
            <li><strong>Milestone:</strong> ${milestone.title}</li>
            <li><strong>Freelancer:</strong> ${freelancerName}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
          </ul>
          
          <div class="feedback">
            <h4>📝 Your Feedback:</h4>
            <p>${changesRequested}</p>
          </div>
          
          <h3>🚀 What Happens Next</h3>
          <ol>
            <li><strong>Freelancer Reviews</strong> - They'll review your feedback and understand the changes needed</li>
            <li><strong>Revisions Made</strong> - The freelancer will update their work based on your feedback</li>
            <li><strong>Resubmission</strong> - You'll receive a new submission for review</li>
            <li><strong>Final Approval</strong> - Once satisfied, you can approve and process payment</li>
          </ol>
          
          <p><strong>Timeline:</strong> Most freelancers complete revisions within 2-5 business days. You'll be notified when the updated work is ready for review.</p>
          
          <p>Thank you for providing constructive feedback to help ensure the best possible outcome for your project!</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Track progress at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}