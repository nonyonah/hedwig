import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface NotificationResponse {
  success: boolean;
  message?: string;
  notifications?: any[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NotificationResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Find milestones that are due soon or overdue
    const { data: milestones, error: milestonesError } = await supabase
      .from('contract_milestones')
      .select(`
        id,
        title,
        description,
        amount,
        due_date,
        deadline,
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
      .in('status', ['pending', 'in_progress'])
      .or(`due_date.lte.${tomorrow.toISOString().split('T')[0]},deadline.lte.${tomorrow.toISOString().split('T')[0]}`)
      .order('due_date', { ascending: true });

    if (milestonesError) {
      console.error('Error fetching milestones:', milestonesError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch milestones'
      });
    }

    const notifications = [];

    for (const milestone of milestones || []) {
      const contract = Array.isArray(milestone.project_contracts) 
        ? milestone.project_contracts[0] 
        : milestone.project_contracts;

      if (!contract) continue;

      const dueDate = new Date(milestone.due_date || milestone.deadline);
      const isOverdue = dueDate < today;
      const isDueSoon = dueDate <= threeDaysFromNow && dueDate >= today;

      if (!isOverdue && !isDueSoon) continue;

      // Get freelancer details
      let freelancerEmail = null;
      let freelancerName = 'Freelancer';
      
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

      // Check if we've already sent a notification recently
      const { data: recentNotifications } = await supabase
        .from('milestone_notifications')
        .select('*')
        .eq('milestone_id', milestone.id)
        .eq('notification_type', isOverdue ? 'overdue' : 'due_soon')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

      if (recentNotifications && recentNotifications.length > 0) {
        continue; // Skip if already notified recently
      }

      // Send notification to freelancer
      if (freelancerEmail) {
        try {
          await sendMilestoneReminderEmail(
            freelancerEmail,
            freelancerName,
            milestone,
            contract,
            isOverdue
          );

          // Send Telegram notification if available
          const { data: freelancer } = await supabase
            .from('users')
            .select('telegram_chat_id')
            .eq('id', contract.freelancer_id)
            .single();

          if (freelancer?.telegram_chat_id) {
            await sendMilestoneReminderTelegram(
              freelancer.telegram_chat_id,
              milestone,
              contract,
              isOverdue
            );
          }

          notifications.push({
            milestone_id: milestone.id,
            recipient: 'freelancer',
            type: isOverdue ? 'overdue' : 'due_soon',
            sent: true
          });

        } catch (error) {
          console.error('Failed to send freelancer notification:', error);
          notifications.push({
            milestone_id: milestone.id,
            recipient: 'freelancer',
            type: isOverdue ? 'overdue' : 'due_soon',
            sent: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Send notification to client
      if (contract.client_email) {
        try {
          await sendClientMilestoneUpdateEmail(
            contract.client_email,
            contract.client_name || 'Client',
            milestone,
            contract,
            isOverdue
          );

          notifications.push({
            milestone_id: milestone.id,
            recipient: 'client',
            type: isOverdue ? 'overdue' : 'due_soon',
            sent: true
          });

        } catch (error) {
          console.error('Failed to send client notification:', error);
          notifications.push({
            milestone_id: milestone.id,
            recipient: 'client',
            type: isOverdue ? 'overdue' : 'due_soon',
            sent: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Record notification in database
      await supabase.from('milestone_notifications').insert({
        milestone_id: milestone.id,
        contract_id: milestone.contract_id,
        notification_type: isOverdue ? 'overdue' : 'due_soon',
        recipient_type: 'both',
        freelancer_email: freelancerEmail,
        client_email: contract.client_email,
        sent_at: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${notifications.length} milestone notifications`,
      notifications
    });

  } catch (error) {
    console.error('Error in milestone notifications:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

async function sendMilestoneReminderEmail(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  isOverdue: boolean
) {
  const dueDate = new Date(milestone.due_date || milestone.deadline);
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = isOverdue 
    ? `⚠️ Milestone Overdue: ${milestone.title}`
    : `📅 Milestone Due Soon: ${milestone.title}`;

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
        .header { background: ${isOverdue ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}; color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #3b82f6; }
        .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">${isOverdue ? '⚠️' : '📅'}</div>
          <h1>Milestone ${isOverdue ? 'Overdue' : 'Due Soon'}</h1>
          <p>Action required for your project milestone</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <p>This is a reminder about your milestone for the project "<strong>${contract.project_title}</strong>".</p>
          
          ${isOverdue ? `
            <div class="warning">
              <strong>⚠️ This milestone is now overdue!</strong><br>
              Please complete and submit your work as soon as possible to avoid project delays.
            </div>
          ` : `
            <div class="warning">
              <strong>📅 This milestone is due soon!</strong><br>
              Please ensure you complete your work before the deadline.
            </div>
          `}
          
          <h3>📋 Milestone Details</h3>
          <ul>
            <li><strong>Title:</strong> ${milestone.title}</li>
            <li><strong>Description:</strong> ${milestone.description || 'No description provided'}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Due Date:</strong> ${dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</li>
            <li><strong>Status:</strong> ${milestone.status.replace('_', ' ').toUpperCase()}</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">📋 View Contract & Submit Work</a>
          </div>
          
          <h3>🚀 Next Steps</h3>
          <ol>
            <li>Complete your work for this milestone</li>
            <li>Submit your deliverables through the contract page</li>
            <li>Wait for client approval</li>
            <li>Receive payment once approved</li>
          </ol>
          
          <p>If you have any questions or need an extension, please contact the client directly.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent by Hedwig - Secure Freelance Payments</p>
          <p>Manage your contracts at hedwigbot.xyz</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendSimpleEmail(email, subject, emailTemplate);
}

async function sendMilestoneReminderTelegram(
  telegramChatId: string,
  milestone: any,
  contract: any,
  isOverdue: boolean
) {
  const dueDate = new Date(milestone.due_date || milestone.deadline);
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const message = `${isOverdue ? '⚠️' : '📅'} *Milestone ${isOverdue ? 'Overdue' : 'Due Soon'}*

📋 *Project:* "${contract.project_title}"
🎯 *Milestone:* ${milestone.title}
💰 *Amount:* ${milestone.amount} ${currency}
📅 *Due Date:* ${dueDate.toLocaleDateString()}

${isOverdue ? 
  '⚠️ *This milestone is now overdue!* Please complete and submit your work as soon as possible.' :
  '📅 *This milestone is due soon!* Please ensure you complete your work before the deadline.'
}

*Next Steps:*
• Complete your work for this milestone
• Submit deliverables through the contract page
• Wait for client approval
• Receive payment once approved

[View Contract](${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id})`;

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

async function sendClientMilestoneUpdateEmail(
  email: string,
  name: string,
  milestone: any,
  contract: any,
  isOverdue: boolean
) {
  const dueDate = new Date(milestone.due_date || milestone.deadline);
  const currency = contract.currency || contract.token_type || 'USDC';
  
  const subject = isOverdue 
    ? `⚠️ Project Update: Milestone Overdue - ${contract.project_title}`
    : `📅 Project Update: Milestone Due Soon - ${contract.project_title}`;

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
        .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        .amount { font-size: 20px; font-weight: bold; color: #3b82f6; }
        .info { background: #f0f9ff; border: 1px solid #3b82f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
          <h1>Project Update</h1>
          <p>Milestone status update for your project</p>
        </div>
        
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          
          <p>This is an update about a milestone in your project "<strong>${contract.project_title}</strong>".</p>
          
          <div class="info">
            <strong>${isOverdue ? '⚠️ Milestone Overdue' : '📅 Milestone Due Soon'}</strong><br>
            ${isOverdue ? 
              'A milestone in your project is now overdue. You may want to check in with your freelancer.' :
              'A milestone in your project is due soon. The freelancer should be completing their work shortly.'
            }
          </div>
          
          <h3>📋 Milestone Details</h3>
          <ul>
            <li><strong>Title:</strong> ${milestone.title}</li>
            <li><strong>Description:</strong> ${milestone.description || 'No description provided'}</li>
            <li><strong>Amount:</strong> <span class="amount">${milestone.amount} ${currency}</span></li>
            <li><strong>Due Date:</strong> ${dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</li>
            <li><strong>Current Status:</strong> ${milestone.status.replace('_', ' ').toUpperCase()}</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/contracts/${contract.id}" class="button">📋 View Project Status</a>
          </div>
          
          <h3>📈 What's Next</h3>
          <ul>
            <li>The freelancer will submit their completed work</li>
            <li>You'll receive a notification to review and approve</li>
            <li>Once approved, payment will be processed automatically</li>
            <li>The project will move to the next milestone</li>
          </ul>
          
          <p>You can track the progress of all milestones on your contract page.</p>
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