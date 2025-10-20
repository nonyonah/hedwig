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
          legal_contract:legal_contracts(client_name, client_email, freelancer_name, freelancer_email, token_type),
          milestones:contract_milestones(id, title, amount, deadline, status)
        `)
        .eq('status', 'active')
        .not('milestones.status', 'eq', 'completed');

      if (error) {
        console.error('Failed to fetch contracts for milestone reminders:', error);
        return;
      }

      for (const contract of contracts || []) {
        const legalContract = contract.legal_contract?.[0];
        if (!legalContract) continue;

        // Find upcoming milestones
        const upcomingMilestones = contract.milestones?.filter((milestone: any) => {
          const milestoneDeadline = new Date(milestone.deadline);
          const now = new Date();
          const daysDiff = Math.ceil((milestoneDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return milestone.status === 'pending' && daysDiff <= 3 && daysDiff >= 0;
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
      // Get contracts with upcoming deadlines (within 7 days)
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          deadline,
          status,
          legal_contract:legal_contracts(client_name, client_email, freelancer_name, freelancer_email, token_type),
          milestones:contract_milestones(id, title, amount, deadline, status)
        `)
        .eq('status', 'active')
        .lte('deadline', sevenDaysFromNow.toISOString());

      if (error) {
        console.error('Failed to fetch contracts for deadline reminders:', error);
        return;
      }

      for (const contract of contracts || []) {
        const legalContract = contract.legal_contract?.[0];
        if (!legalContract) continue;

        const deadline = new Date(contract.deadline);
        const now = new Date();
        const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 7 && daysDiff >= 0) {
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
              milestones: contract.milestones || []
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
              milestones: contract.milestones || []
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

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Milestone Reminder</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .milestone { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 10px 0; border-radius: 4px; }
          .urgent { background: #fee2e2; border-left-color: #ef4444; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Milestone Reminder</h1>
            <p>Upcoming deadlines for your project</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${freelancerName}</strong>,</p>
            
            <p>This is a friendly reminder that you have upcoming milestone deadlines for your project "<strong>${projectTitle}</strong>" with ${clientName}.</p>
            
            <h3>📋 Upcoming Milestones</h3>
            ${upcomingMilestones.map(milestone => {
              const deadline = new Date(milestone.deadline);
              const now = new Date();
              const daysDiff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysDiff <= 1;
              
              return `
                <div class="milestone ${isUrgent ? 'urgent' : ''}">
                  <strong>${milestone.title}</strong><br>
                  Payment: ${milestone.amount} ${data.tokenType}<br>
                  Deadline: ${deadline.toLocaleDateString()} ${isUrgent ? '(URGENT!)' : `(${daysDiff} days)`}
                </div>
              `;
            }).join('')}
            
            <p>Please make sure to complete and submit your work before the deadlines to ensure timely payment release.</p>
            
            <p>If you need any clarification or have concerns about meeting these deadlines, please reach out to ${clientName} as soon as possible.</p>
          </div>
          
          <div class="footer">
            <p>This reminder was sent by Hedwig - Secure Freelance Payments</p>
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
  }): Promise<void> {
    const { freelancerEmail, freelancerName, projectTitle, clientName, deadline, daysRemaining, milestones } = data;
    
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const totalMilestones = milestones.length;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Project Deadline Reminder</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .progress { background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Project Deadline Approaching</h1>
            <p>${daysRemaining} days remaining</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${freelancerName}</strong>,</p>
            
            <p>This is an important reminder that your project "<strong>${projectTitle}</strong>" with ${clientName} is approaching its deadline.</p>
            
            <div class="progress">
              <h3>📊 Project Progress</h3>
              <p><strong>Deadline:</strong> ${new Date(deadline).toLocaleDateString()}</p>
              <p><strong>Days Remaining:</strong> ${daysRemaining}</p>
              <p><strong>Milestones Completed:</strong> ${completedMilestones} of ${totalMilestones}</p>
            </div>
            
            <p>Please ensure all remaining work is completed and submitted before the deadline to avoid any issues with payment release.</p>
            
            <p>If you anticipate any delays, please communicate with ${clientName} immediately to discuss possible extensions.</p>
          </div>
          
          <div class="footer">
            <p>This reminder was sent by Hedwig - Secure Freelance Payments</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendSimpleEmail(
        freelancerEmail,
        `🚨 Deadline Reminder: ${projectTitle} (${daysRemaining} days left)`,
        emailHtml
      );
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
  }): Promise<void> {
    const { clientEmail, clientName, projectTitle, freelancerName, deadline, daysRemaining, milestones } = data;
    
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const totalMilestones = milestones.length;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Project Deadline Reminder</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .progress { background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 Project Deadline Update</h1>
            <p>Your project is approaching completion</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${clientName}</strong>,</p>
            
            <p>This is a status update for your project "<strong>${projectTitle}</strong>" with ${freelancerName}.</p>
            
            <div class="progress">
              <h3>📊 Project Status</h3>
              <p><strong>Deadline:</strong> ${new Date(deadline).toLocaleDateString()}</p>
              <p><strong>Days Remaining:</strong> ${daysRemaining}</p>
              <p><strong>Milestones Completed:</strong> ${completedMilestones} of ${totalMilestones}</p>
            </div>
            
            <p>The project deadline is approaching in ${daysRemaining} days. Please be prepared to review any final deliverables from ${freelancerName}.</p>
            
            <p>If you have any questions about the project progress, feel free to reach out to ${freelancerName} directly.</p>
          </div>
          
          <div class="footer">
            <p>This update was sent by Hedwig - Secure Freelance Payments</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await sendSimpleEmail(
        clientEmail,
        `📅 Project Update: ${projectTitle} (${daysRemaining} days to deadline)`,
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
        message = `⏰ *Milestone Reminder*

Project: "${data.projectTitle}"
Client: ${data.clientName}

You have upcoming milestone deadlines. Check your email for details!`;
      } else {
        message = `🚨 *Deadline Reminder*

Project: "${data.projectTitle}"
Client: ${data.clientName}

Your project deadline is approaching. Make sure to complete all remaining work on time!`;
      }

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
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
    } catch (error) {
      console.error('Failed to send Telegram reminder:', error);
    }
  }
}

export const contractReminderService = new ContractReminderService();