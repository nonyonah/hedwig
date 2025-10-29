import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ContractReminder {
  contractId: string;
  projectTitle: string;
  clientName: string;
  clientEmail?: string;
  freelancerName: string;
  freelancerEmail?: string;
  freelancerTelegramId?: string;
  totalAmount: number;
  tokenType: string;
  deadline: string;
  milestones: Array<{
    id: string;
    title: string;
    amount: number;
    deadline: string;
    status: string;
  }>;
}

export class ContractReminderService {
  /**
   * Send milestone reminders to freelancers
   */
  async sendMilestoneReminders(): Promise<void> {
    try {
      // Get contracts with upcoming milestone deadlines (within 3 days)
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          status,
          legal_contract_id,
          client_email,
          milestones:contract_milestones(id, title, amount, deadline, status)
        `)
        .eq('status', 'active')
        .not('milestones.status', 'eq', 'completed');

      if (error) {
        console.error('Failed to fetch contracts for milestone reminders:', error);
        return;
      }

      for (const contract of contracts || []) {
        // Get legal contract data if legal_contract_id exists
        let legalContract: any = null;
        if (contract.legal_contract_id) {
          const { data: legalContractData } = await supabase
            .from('legal_contracts')
            .select('client_name, client_email, freelancer_name, freelancer_email, token_type')
            .eq('id', contract.legal_contract_id)
            .single();
          legalContract = legalContractData;
        }

        // Skip if we don't have the necessary data
        if (!legalContract?.freelancer_email) continue;

        // Find upcoming milestones (within 3 days) or overdue milestones
        const upcomingMilestones = contract.milestones?.filter((milestone: any) => {
          const milestoneDeadline = new Date(milestone.deadline);
          const now = new Date();
          const daysDiff = Math.ceil((milestoneDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return milestone.status === 'pending' && daysDiff <= 3; // Include overdue milestones (daysDiff < 0)
        }) || [];

        if (upcomingMilestones.length > 0) {
          await this.sendMilestoneReminderToFreelancer({
            contractId: contract.id,
            projectTitle: contract.project_title,
            clientName: legalContract.client_name,
            freelancerName: legalContract.freelancer_name,
            freelancerEmail: legalContract.freelancer_email,
            totalAmount: contract.total_amount,
            tokenType: legalContract.token_type || 'USDC',
            upcomingMilestones
          });
        }
      }
    } catch (error) {
      console.error('Error sending milestone reminders:', error);
    }
  }

  /**
   * Send deadline reminders to both parties
   */
  async sendDeadlineReminders(): Promise<void> {
    try {
      console.log('Starting deadline reminders...');
      
      // Validate environment variables
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing Supabase environment variables');
      }

      // Get contracts with upcoming deadlines (within 7 days) or overdue contracts
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      console.log('Fetching contracts with deadlines before:', sevenDaysFromNow.toISOString());

      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          deadline,
          status,
          legal_contract_id,
          client_email,
          milestones:contract_milestones(id, title, amount, deadline, status)
        `)
        .eq('status', 'active')
        .lte('deadline', sevenDaysFromNow.toISOString());

      if (error) {
        console.error('Failed to fetch contracts for deadline reminders:', error);
        throw error;
      }

      console.log(`Found ${contracts?.length || 0} contracts with upcoming deadlines`);

      for (const contract of contracts || []) {
        // Get legal contract data if legal_contract_id exists
        let legalContract: any = null;
        if (contract.legal_contract_id) {
          const { data: legalContractData } = await supabase
            .from('legal_contracts')
            .select('client_name, client_email, freelancer_name, freelancer_email, token_type')
            .eq('id', contract.legal_contract_id)
            .single();
          legalContract = legalContractData;
        }

        // Skip if we don't have the necessary data
        if (!legalContract) continue;

        const deadline = new Date(contract.deadline);
        const now = new Date();
        const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Send reminders for upcoming deadlines (within 7 days) OR overdue contracts
        if (daysDiff <= 7) {
          const isOverdue = daysDiff < 0;
          
          // Send to freelancer
          if (legalContract.freelancer_email) {
            await this.sendDeadlineReminderToFreelancer({
              contractId: contract.id,
              projectTitle: contract.project_title,
              clientName: legalContract.client_name,
              freelancerName: legalContract.freelancer_name,
              freelancerEmail: legalContract.freelancer_email,
              deadline: contract.deadline,
              daysRemaining: daysDiff,
              milestones: contract.milestones || [],
              isOverdue
            });
          }

          // Send to client
          if (legalContract.client_email) {
            await this.sendDeadlineReminderToClient({
              contractId: contract.id,
              projectTitle: contract.project_title,
              clientName: legalContract.client_name,
              clientEmail: legalContract.client_email,
              freelancerName: legalContract.freelancer_name,
              deadline: contract.deadline,
              daysRemaining: daysDiff,
              milestones: contract.milestones || [],
              isOverdue
            });
          }
        }
      }
    } catch (error) {
      console.error('Error sending deadline reminders:', error);
    }
  }

  private async sendMilestoneReminderToFreelancer(data: {
    contractId: string;
    projectTitle: string;
    clientName: string;
    freelancerName: string;
    freelancerEmail: string;
    totalAmount: number;
    tokenType: string;
    upcomingMilestones: Array<{ id: string; title: string; amount: number; deadline: string }>;
  }): Promise<void> {
    const { freelancerEmail, freelancerName, projectTitle, clientName, upcomingMilestones } = data;

    const totalMilestoneValue = upcomingMilestones.reduce((sum, m) => sum + m.amount, 0);
    const hasUrgentMilestones = upcomingMilestones.some(milestone => {
      const deadline = new Date(milestone.deadline);
      const now = new Date();
      const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff <= 1;
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Milestone Reminder</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${hasUrgentMilestones ? '#ef4444 0%, #dc2626 100%' : '#f59e0b 0%, #d97706 100%'}); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .milestone { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 15px 0; border-radius: 8px; transition: all 0.3s ease; }
          .milestone:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          .urgent { background: #fee2e2; border-left-color: #ef4444; }
          .milestone-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
          .milestone-title { font-size: 18px; font-weight: 600; color: #1f2937; }
          .milestone-amount { font-size: 16px; font-weight: 600; color: #059669; }
          .milestone-deadline { font-size: 14px; color: #6b7280; }
          .urgent-badge { background: #ef4444; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
          .summary { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .cta { background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin: 20px 0; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${hasUrgentMilestones ? '🚨' : '⏰'} Milestone Reminder</h1>
            <p>${hasUrgentMilestones ? 'Urgent deadlines approaching!' : 'Upcoming deadlines for your project'}</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${freelancerName}</strong>,</p>
            
            <p>This is ${hasUrgentMilestones ? 'an urgent' : 'a friendly'} reminder that you have upcoming milestone deadlines for your project "<strong>${projectTitle}</strong>" with ${clientName}.</p>
            
            <div class="summary">
               <h3>📊 Project Summary</h3>
               <p><strong>Total Pending Value:</strong> ${totalMilestoneValue} ${data.tokenType}</p>
               <p><strong>Milestones Due:</strong> ${upcomingMilestones.length}</p>
               <p><strong>Client:</strong> ${clientName}</p>
             </div>
            
            <h3>📋 Upcoming Milestones</h3>
            ${upcomingMilestones.map(milestone => {
              const deadline = new Date(milestone.deadline);
              const now = new Date();
              const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysDiff <= 1;
              
              return `
                <div class="milestone ${isUrgent ? 'urgent' : ''}">
                  <div class="milestone-header">
                     <div class="milestone-title">${milestone.title}</div>
                     <div class="milestone-amount">${milestone.amount} ${data.tokenType}</div>
                   </div>
                  <div class="milestone-deadline">
                    📅 Due: ${deadline.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    ${isUrgent ? '<span class="urgent-badge">URGENT - Due in ' + (daysDiff === 0 ? 'less than 24 hours' : daysDiff + ' day' + (daysDiff === 1 ? '' : 's')) + '</span>' : `(${daysDiff} days remaining)`}
                  </div>
                </div>
              `;
            }).join('')}
            
            ${hasUrgentMilestones ? `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #dc2626; margin-top: 0;">⚠️ Immediate Action Required</h3>
              <p>You have milestones due within 24 hours. Please prioritize completing and submitting your work to ensure timely payment release.</p>
            </div>
            ` : ''}
            
            <p>💡 <strong>Pro Tip:</strong> Submit your work early to allow time for client review and feedback. This helps ensure smooth payment processing and maintains a positive working relationship.</p>
            
            <p>If you need any clarification or have concerns about meeting these deadlines, please reach out to ${clientName} as soon as possible.</p>
            
            <center>
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwigbot.xyz'}/dashboard" class="cta">View Project Dashboard</a>
            </center>
          </div>
          
          <div class="footer">
            <p>This reminder was sent by Hedwig - Secure Freelance Payments</p>
            <p>Need help? Contact us at support@hedwigbot.xyz</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendSimpleEmail(
        freelancerEmail,
        `⏰ Milestone Reminder: ${projectTitle}`,
        emailHtml
      );

      // Also send Telegram notification if available
      await this.sendTelegramReminder(freelancerEmail, {
        type: 'milestone',
        projectTitle,
        clientName,
        milestones: upcomingMilestones
      });
    } catch (error) {
      console.error('Failed to send milestone reminder:', error);
    }
  }

  private async sendDeadlineReminderToFreelancer(data: {
    contractId: string;
    projectTitle: string;
    clientName: string;
    freelancerName: string;
    freelancerEmail: string;
    deadline: string;
    daysRemaining: number;
    milestones: Array<{ status: string }>;
    isOverdue?: boolean;
  }): Promise<void> {
    const { freelancerEmail, freelancerName, projectTitle, clientName, deadline, daysRemaining, milestones, isOverdue } = data;
    
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const totalMilestones = milestones.length;

    const isOverdueContract = isOverdue || daysRemaining < 0;
    const headerText = isOverdueContract ? '🚨 Project OVERDUE' : '🚨 Project Deadline Approaching';
    const statusText = isOverdueContract ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days remaining`;
    const urgencyMessage = isOverdueContract 
      ? `This project is now <strong>OVERDUE</strong> by ${Math.abs(daysRemaining)} days. Immediate action is required to avoid payment complications.`
      : `This is an important reminder that your project "<strong>${projectTitle}</strong>" with ${clientName} is approaching its deadline.`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Project Deadline ${isOverdueContract ? 'OVERDUE' : 'Reminder'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${isOverdueContract ? '#dc2626 0%, #991b1b 100%' : '#ef4444 0%, #dc2626 100%'}); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .progress { background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .overdue { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${headerText}</h1>
            <p>${statusText}</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${freelancerName}</strong>,</p>
            
            <p>${urgencyMessage}</p>
            
            ${isOverdueContract ? `
            <div class="overdue">
              <h3>⚠️ URGENT ACTION REQUIRED</h3>
              <p>Your project deadline has passed. Please contact ${clientName} immediately to discuss the situation and provide an updated timeline for completion.</p>
            </div>
            ` : ''}
            
            <div class="progress">
              <h3>📊 Project Progress</h3>
              <p><strong>Deadline:</strong> ${new Date(deadline).toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${isOverdueContract ? `OVERDUE by ${Math.abs(daysRemaining)} days` : `${daysRemaining} days remaining`}</p>
              <p><strong>Milestones Completed:</strong> ${completedMilestones} of ${totalMilestones}</p>
            </div>
            
            <p>${isOverdueContract 
              ? 'Please complete and submit all remaining work as soon as possible. Delayed delivery may affect future payment releases and your reputation on the platform.'
              : 'Please ensure all remaining work is completed and submitted before the deadline to avoid any issues with payment release.'
            }</p>
            
            <p>If you ${isOverdueContract ? 'need additional time' : 'anticipate any delays'}, please communicate with ${clientName} immediately to discuss possible ${isOverdueContract ? 'resolution' : 'extensions'}.</p>
          </div>
          
          <div class="footer">
            <p>This ${isOverdueContract ? 'overdue notice' : 'reminder'} was sent by Hedwig - Secure Freelance Payments</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailSubject = isOverdueContract 
      ? `🚨 OVERDUE: ${projectTitle} (${Math.abs(daysRemaining)} days overdue)`
      : `🚨 Deadline Reminder: ${projectTitle} (${daysRemaining} days left)`;

    try {
      await sendSimpleEmail(
        freelancerEmail,
        emailSubject,
        emailHtml
      );

      // Also send Telegram notification if available
      await this.sendTelegramReminder(freelancerEmail, {
        type: 'deadline',
        projectTitle,
        clientName,
        daysRemaining,
        isOverdue
      });
    } catch (error) {
      console.error('Failed to send deadline reminder to freelancer:', error);
    }
  }

  private async sendDeadlineReminderToClient(data: {
    contractId: string;
    projectTitle: string;
    clientName: string;
    clientEmail: string;
    freelancerName: string;
    deadline: string;
    daysRemaining: number;
    milestones: Array<{ status: string }>;
    isOverdue?: boolean;
  }): Promise<void> {
    const { clientEmail, clientName, projectTitle, freelancerName, deadline, daysRemaining, milestones, isOverdue } = data;
    
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const totalMilestones = milestones.length;

    const isOverdueContract = isOverdue || daysRemaining < 0;
    const headerText = isOverdueContract ? '⚠️ Project OVERDUE' : '📅 Project Deadline Update';
    const statusText = isOverdueContract ? 'Immediate attention required' : 'Your project is approaching completion';
    const urgencyMessage = isOverdueContract 
      ? `Your project "<strong>${projectTitle}</strong>" with ${freelancerName} is now <strong>OVERDUE</strong> by ${Math.abs(daysRemaining)} days.`
      : `This is a status update for your project "<strong>${projectTitle}</strong>" with ${freelancerName}.`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Project Deadline ${isOverdueContract ? 'OVERDUE' : 'Update'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${isOverdueContract ? '#dc2626 0%, #991b1b 100%' : '#3b82f6 0%, #1d4ed8 100%'}); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .progress { background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .overdue { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${headerText}</h1>
            <p>${statusText}</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${clientName}</strong>,</p>
            
            <p>${urgencyMessage}</p>
            
            ${isOverdueContract ? `
            <div class="overdue">
              <h3>⚠️ ACTION REQUIRED</h3>
              <p>The project deadline has passed. We recommend contacting ${freelancerName} to discuss the current status and establish a new timeline for completion.</p>
            </div>
            ` : ''}
            
            <div class="progress">
              <h3>📊 Project Status</h3>
              <p><strong>Deadline:</strong> ${new Date(deadline).toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${isOverdueContract ? `OVERDUE by ${Math.abs(daysRemaining)} days` : `${daysRemaining} days remaining`}</p>
              <p><strong>Milestones Completed:</strong> ${completedMilestones} of ${totalMilestones}</p>
            </div>
            
            <p>${isOverdueContract 
              ? `Please reach out to ${freelancerName} to discuss the project status and next steps. You may also want to review the contract terms regarding late delivery.`
              : `The project deadline is approaching in ${daysRemaining} days. Please be prepared to review any final deliverables from ${freelancerName}.`
            }</p>
            
            <p>If you have any questions about the project progress${isOverdueContract ? ' or need assistance with next steps' : ''}, feel free to reach out to ${freelancerName} directly${isOverdueContract ? ' or contact our support team' : ''}.</p>
          </div>
          
          <div class="footer">
            <p>This ${isOverdueContract ? 'overdue notice' : 'update'} was sent by Hedwig - Secure Freelance Payments</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailSubject = isOverdueContract 
      ? `⚠️ OVERDUE: ${projectTitle} (${Math.abs(daysRemaining)} days overdue)`
      : `📅 Project Update: ${projectTitle} (${daysRemaining} days to deadline)`;

    try {
      await sendSimpleEmail(
        clientEmail,
        emailSubject,
        emailHtml
      );
    } catch (error) {
      console.error('Failed to send deadline reminder to client:', error);
    }
  }

  private async sendTelegramReminder(userEmail: string, data: {
    type: 'milestone' | 'deadline';
    projectTitle: string;
    clientName: string;
    milestones?: Array<{ title: string; deadline: string }>;
    daysRemaining?: number;
    isOverdue?: boolean;
  }): Promise<void> {
    try {
      // Get user's Telegram chat ID
      const { data: user } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('email', userEmail)
        .single();

      if (!user?.telegram_chat_id) return;

      let message = '';
      if (data.type === 'milestone') {
        const milestoneCount = data.milestones?.length || 0;
        message = `⏰ *Milestone Reminder*

📋 Project: "${data.projectTitle}"
👤 Client: ${data.clientName}
📊 Upcoming milestones: ${milestoneCount}

You have upcoming milestone deadlines. Check your email for detailed information!`;
      } else {
        const { daysRemaining = 0, isOverdue = false } = data;
        const urgencyIcon = isOverdue ? '🚨' : daysRemaining <= 1 ? '⚠️' : '📅';
        const statusText = isOverdue 
          ? `*OVERDUE* by ${Math.abs(daysRemaining)} days`
          : `${daysRemaining} days remaining`;
        
        message = `${urgencyIcon} *Deadline ${isOverdue ? 'OVERDUE' : 'Reminder'}*

📋 Project: "${data.projectTitle}"
👤 Client: ${data.clientName}
⏱️ Status: ${statusText}

${isOverdue ? 'Your project is overdue! Please complete and deliver immediately.' : 'Your project deadline is approaching. Make sure to complete all remaining work on time!'}

Check your email for detailed information.`;
      }

      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: user.telegram_chat_id,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Telegram API error:', response.status, errorText);
      }
    } catch (error) {
      console.error('Failed to send Telegram reminder:', error);
    }
  }
}

export const contractReminderService = new ContractReminderService();