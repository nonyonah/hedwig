import { createClient } from '@supabase/supabase-js';
import { sendSimpleEmail } from '../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface NotificationData {
  contractId: string;
  projectTitle: string;
  freelancerId?: string;
  freelancerName?: string;
  freelancerEmail?: string;
  clientName?: string;
  clientEmail?: string;
  amount?: number;
  currency?: string;
  deadline?: string;
  milestoneTitle?: string;
  invoiceId?: string;
  daysOverdue?: number;
}

export class ProjectNotificationService {
  
  /**
   * Send project deadline reminder notifications
   */
  async sendDeadlineReminder(data: NotificationData, reminderType: 'approaching' | 'overdue'): Promise<void> {
    try {
      const subject = reminderType === 'approaching' 
        ? `⏰ Project Deadline Approaching: ${data.projectTitle}`
        : `🚨 Project Deadline Overdue: ${data.projectTitle}`;

      // Send to freelancer
      if (data.freelancerEmail) {
        const freelancerTemplate = this.generateDeadlineReminderEmailTemplate(data, 'freelancer', reminderType);
        await sendSimpleEmail(data.freelancerEmail, subject, freelancerTemplate);
      }

      // Send to client
      if (data.clientEmail) {
        const clientTemplate = this.generateDeadlineReminderEmailTemplate(data, 'client', reminderType);
        await sendSimpleEmail(data.clientEmail, subject, clientTemplate);
      }

      // Send Telegram notifications
      await this.sendDeadlineReminderTelegram(data, reminderType);

      // Log notification
      await this.logNotification({
        contract_id: data.contractId,
        notification_type: reminderType === 'approaching' ? 'deadline_reminder' : 'deadline_overdue',
        recipient: 'both',
        subject,
        message: `Project deadline ${reminderType} notification sent`,
        sent_via_email: true,
        sent_via_telegram: true
      });

      console.log(`[ProjectNotification] Deadline ${reminderType} notification sent for contract ${data.contractId}`);
    } catch (error) {
      console.error(`[ProjectNotification] Error sending deadline ${reminderType} notification:`, error);
      throw error;
    }
  }

  /**
   * Send milestone achievement notifications
   */
  async sendMilestoneAchievement(data: NotificationData): Promise<void> {
    try {
      const subject = `🎯 Milestone Completed: ${data.milestoneTitle}`;

      // Send to freelancer
      if (data.freelancerEmail) {
        const freelancerTemplate = this.generateMilestoneAchievementEmailTemplate(data, 'freelancer');
        await sendSimpleEmail(data.freelancerEmail, subject, freelancerTemplate);
      }

      // Send to client
      if (data.clientEmail) {
        const clientTemplate = this.generateMilestoneAchievementEmailTemplate(data, 'client');
        await sendSimpleEmail(data.clientEmail, subject, clientTemplate);
      }

      // Send Telegram notifications
      await this.sendMilestoneAchievementTelegram(data);

      // Log notification
      await this.logNotification({
        contract_id: data.contractId,
        notification_type: 'milestone_completed',
        recipient: 'both',
        subject,
        message: `Milestone "${data.milestoneTitle}" completion notification sent`,
        sent_via_email: true,
        sent_via_telegram: true
      });

      console.log(`[ProjectNotification] Milestone achievement notification sent for contract ${data.contractId}`);
    } catch (error) {
      console.error('[ProjectNotification] Error sending milestone achievement notification:', error);
      throw error;
    }
  }

  /**
   * Send invoice payment notifications
   */
  async sendInvoicePayment(data: NotificationData): Promise<void> {
    try {
      const subject = `💰 Invoice Paid: ${data.projectTitle}`;

      // Send to freelancer
      if (data.freelancerEmail) {
        const freelancerTemplate = this.generateInvoicePaymentEmailTemplate(data, 'freelancer');
        await sendSimpleEmail(data.freelancerEmail, subject, freelancerTemplate);
      }

      // Send to client (confirmation)
      if (data.clientEmail) {
        const clientTemplate = this.generateInvoicePaymentEmailTemplate(data, 'client');
        await sendSimpleEmail(data.clientEmail, `✅ Payment Confirmed: ${data.projectTitle}`, clientTemplate);
      }

      // Send Telegram notifications
      await this.sendInvoicePaymentTelegram(data);

      // Log notification
      await this.logNotification({
        contract_id: data.contractId,
        notification_type: 'invoice_paid',
        recipient: 'both',
        subject,
        message: `Invoice payment notification sent for ${data.amount} ${data.currency}`,
        sent_via_email: true,
        sent_via_telegram: true
      });

      console.log(`[ProjectNotification] Invoice payment notification sent for contract ${data.contractId}`);
    } catch (error) {
      console.error('[ProjectNotification] Error sending invoice payment notification:', error);
      throw error;
    }
  }

  /**
   * Send Telegram deadline reminder
   */
  private async sendDeadlineReminderTelegram(data: NotificationData, reminderType: 'approaching' | 'overdue'): Promise<void> {
    try {
      // Get freelancer Telegram chat ID
      if (data.freelancerId) {
        const { data: freelancer } = await supabase
          .from('users')
          .select('telegram_chat_id, first_name')
          .eq('id', data.freelancerId)
          .single();

        if (freelancer?.telegram_chat_id) {
          const message = reminderType === 'approaching'
            ? `⏰ *Deadline Reminder*

Hello ${freelancer.first_name || 'there'}!

Your project deadline is approaching:

📋 *Project:* "${data.projectTitle}"
📅 *Deadline:* ${data.deadline ? new Date(data.deadline).toLocaleDateString() : 'Not specified'}
💰 *Amount:* ${data.amount} ${data.currency}

Please ensure you complete and submit your work on time! ⏰`
            : `🚨 *Deadline Overdue*

Hello ${freelancer.first_name || 'there'}!

Your project deadline has passed:

📋 *Project:* "${data.projectTitle}"
📅 *Was Due:* ${data.deadline ? new Date(data.deadline).toLocaleDateString() : 'Not specified'}
⏰ *Days Overdue:* ${data.daysOverdue || 0}
💰 *Amount:* ${data.amount} ${data.currency}

Please submit your work as soon as possible! 🚨`;

          await this.sendTelegramMessage(freelancer.telegram_chat_id, message);
        }
      }

      // Get client Telegram chat ID (if they have one)
      if (data.clientEmail) {
        const { data: client } = await supabase
          .from('users')
          .select('telegram_chat_id, first_name')
          .eq('email', data.clientEmail)
          .single();

        if (client?.telegram_chat_id) {
          const message = reminderType === 'approaching'
            ? `⏰ *Project Update*

Hello ${client.first_name || 'there'}!

Project deadline approaching:

📋 *Project:* "${data.projectTitle}"
👤 *Freelancer:* ${data.freelancerName}
📅 *Deadline:* ${data.deadline ? new Date(data.deadline).toLocaleDateString() : 'Not specified'}

The freelancer has been notified to complete the work on time. 📋`
            : `🚨 *Project Alert*

Hello ${client.first_name || 'there'}!

Project deadline has passed:

📋 *Project:* "${data.projectTitle}"
👤 *Freelancer:* ${data.freelancerName}
📅 *Was Due:* ${data.deadline ? new Date(data.deadline).toLocaleDateString() : 'Not specified'}
⏰ *Days Overdue:* ${data.daysOverdue || 0}

You may want to follow up with the freelancer. 📞`;

          await this.sendTelegramMessage(client.telegram_chat_id, message);
        }
      }
    } catch (error) {
      console.error('[ProjectNotification] Error sending Telegram deadline reminder:', error);
    }
  }

  /**
   * Send Telegram milestone achievement notification
   */
  private async sendMilestoneAchievementTelegram(data: NotificationData): Promise<void> {
    try {
      // Send to freelancer
      if (data.freelancerId) {
        const { data: freelancer } = await supabase
          .from('users')
          .select('telegram_chat_id, first_name')
          .eq('id', data.freelancerId)
          .single();

        if (freelancer?.telegram_chat_id) {
          const message = `🎯 *Milestone Completed!*

Congratulations ${freelancer.first_name || 'there'}!

✅ *Milestone:* "${data.milestoneTitle}"
📋 *Project:* "${data.projectTitle}"
💰 *Value:* ${data.amount} ${data.currency}

Great work! The client has been notified. 🎉`;

          await this.sendTelegramMessage(freelancer.telegram_chat_id, message);
        }
      }

      // Send to client
      if (data.clientEmail) {
        const { data: client } = await supabase
          .from('users')
          .select('telegram_chat_id, first_name')
          .eq('email', data.clientEmail)
          .single();

        if (client?.telegram_chat_id) {
          const message = `🎯 *Milestone Update*

Hello ${client.first_name || 'there'}!

A milestone has been completed:

✅ *Milestone:* "${data.milestoneTitle}"
📋 *Project:* "${data.projectTitle}"
👤 *Freelancer:* ${data.freelancerName}
💰 *Value:* ${data.amount} ${data.currency}

Please review the work and process payment if satisfied. 💳`;

          await this.sendTelegramMessage(client.telegram_chat_id, message);
        }
      }
    } catch (error) {
      console.error('[ProjectNotification] Error sending Telegram milestone notification:', error);
    }
  }

  /**
   * Send Telegram invoice payment notification
   */
  private async sendInvoicePaymentTelegram(data: NotificationData): Promise<void> {
    try {
      // Send to freelancer
      if (data.freelancerId) {
        const { data: freelancer } = await supabase
          .from('users')
          .select('telegram_chat_id, first_name')
          .eq('id', data.freelancerId)
          .single();

        if (freelancer?.telegram_chat_id) {
          const message = `💰 *Payment Received!*

Great news ${freelancer.first_name || 'there'}!

💵 *Amount:* ${data.amount} ${data.currency}
📋 *Project:* "${data.projectTitle}"
🧾 *Invoice:* ${data.invoiceId}

The payment has been processed and should be available in your wallet! 🎉`;

          await this.sendTelegramMessage(freelancer.telegram_chat_id, message);
        }
      }

      // Send to client (confirmation)
      if (data.clientEmail) {
        const { data: client } = await supabase
          .from('users')
          .select('telegram_chat_id, first_name')
          .eq('email', data.clientEmail)
          .single();

        if (client?.telegram_chat_id) {
          const message = `✅ *Payment Confirmed*

Hello ${client.first_name || 'there'}!

Your payment has been processed:

💵 *Amount:* ${data.amount} ${data.currency}
📋 *Project:* "${data.projectTitle}"
👤 *Freelancer:* ${data.freelancerName}
🧾 *Invoice:* ${data.invoiceId}

Thank you for your payment! 🙏`;

          await this.sendTelegramMessage(client.telegram_chat_id, message);
        }
      }
    } catch (error) {
      console.error('[ProjectNotification] Error sending Telegram payment notification:', error);
    }
  }

  /**
   * Send Telegram message
   */
  private async sendTelegramMessage(chatId: string, message: string): Promise<void> {
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
      console.error('[ProjectNotification] Error sending Telegram message:', error);
      throw error;
    }
  }

  /**
   * Log notification to database
   */
  private async logNotification(notification: {
    contract_id: string;
    notification_type: string;
    recipient: string;
    subject: string;
    message: string;
    sent_via_email: boolean;
    sent_via_telegram: boolean;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('project_notifications')
        .insert({
          ...notification,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('[ProjectNotification] Error logging notification:', error);
        // Don't throw error if table doesn't exist yet - just log and continue
        if (error.code === '42P01') {
          console.warn('[ProjectNotification] project_notifications table does not exist yet - skipping log');
        }
      }
    } catch (error) {
      console.error('[ProjectNotification] Error in logNotification:', error);
      // Don't throw error - notification logging is not critical
    }
  }

  // Email Templates

  private generateDeadlineReminderEmailTemplate(data: NotificationData, recipient: 'freelancer' | 'client', reminderType: 'approaching' | 'overdue'): string {
    const isFreelancer = recipient === 'freelancer';
    const isOverdue = reminderType === 'overdue';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${isOverdue ? 'Deadline Overdue' : 'Deadline Reminder'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: ${isOverdue ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}; color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: ${isOverdue ? '#ef4444' : '#f59e0b'}; }
          .alert-emoji { font-size: 48px; margin-bottom: 20px; }
          .deadline-box { background: ${isOverdue ? '#fef2f2' : '#fef3c7'}; border-left: 4px solid ${isOverdue ? '#ef4444' : '#f59e0b'}; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="alert-emoji">${isOverdue ? '🚨' : '⏰'}</div>
            <h1>${isOverdue ? 'Project Deadline Overdue' : 'Project Deadline Reminder'}</h1>
            <p>${isOverdue ? 'Immediate attention required' : 'Deadline approaching soon'}</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${isFreelancer ? data.freelancerName : data.clientName}</strong>,</p>
            
            <p>${isOverdue 
              ? `The deadline for project "<strong>${data.projectTitle}</strong>" has passed and requires immediate attention.`
              : `This is a reminder that the deadline for project "<strong>${data.projectTitle}</strong>" is approaching.`
            }</p>
            
            <div class="deadline-box">
              <strong>${isOverdue ? '🚨 Overdue Information:' : '⏰ Deadline Information:'}</strong><br>
              ${data.deadline ? `<strong>Deadline:</strong> ${new Date(data.deadline).toLocaleDateString()}<br>` : ''}
              ${isOverdue && data.daysOverdue ? `<strong>Days Overdue:</strong> ${data.daysOverdue}<br>` : ''}
              <strong>Project Value:</strong> ${data.amount} ${data.currency}
            </div>
            
            ${isFreelancer ? `
              <h3>${isOverdue ? '🚨 Immediate Action Required' : '📋 Next Steps'}</h3>
              <ul>
                <li>${isOverdue ? 'Complete and submit your work immediately' : 'Finalize your work and prepare for submission'}</li>
                <li>${isOverdue ? 'Contact the client to explain the delay' : 'Ensure all deliverables meet the requirements'}</li>
                <li>Submit your completed work through the platform</li>
                <li>${isOverdue ? 'Apologize for the delay and provide a completion timeline' : 'Communicate with the client if you need clarification'}</li>
              </ul>
              
              <p><strong>${isOverdue ? 'Important:' : 'Reminder:'}</strong> ${isOverdue 
                ? 'Late delivery may affect your reputation and future opportunities. Please complete the work as soon as possible.'
                : 'Timely delivery is crucial for maintaining good client relationships and your professional reputation.'
              }</p>
            ` : `
              <h3>📊 Project Status Update</h3>
              <ul>
                <li><strong>Freelancer:</strong> ${data.freelancerName}</li>
                <li><strong>Project:</strong> ${data.projectTitle}</li>
                <li><strong>Status:</strong> ${isOverdue ? 'Overdue - Requires Follow-up' : 'In Progress - Deadline Approaching'}</li>
              </ul>
              
              <p><strong>What you can do:</strong></p>
              <ul>
                <li>${isOverdue ? 'Contact the freelancer to check on progress' : 'Monitor the project progress'}</li>
                <li>${isOverdue ? 'Discuss potential solutions or extensions if needed' : 'Be available for any questions or clarifications'}</li>
                <li>Review and approve work promptly when submitted</li>
              </ul>
            `}
            
            <p>${isOverdue ? 'Thank you for your immediate attention to this matter.' : 'Thank you for your attention to this reminder.'}</p>
          </div>
          
          <div class="footer">
            <p>This notification was sent by Hedwig Project Management</p>
            <p>Manage your projects at hedwigbot.xyz</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateMilestoneAchievementEmailTemplate(data: NotificationData, recipient: 'freelancer' | 'client'): string {
    const isFreelancer = recipient === 'freelancer';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Milestone Completed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 24px; font-weight: bold; color: #10b981; }
          .celebration { font-size: 48px; margin-bottom: 20px; }
          .milestone-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="celebration">🎯</div>
            <h1>Milestone Completed!</h1>
            <p>${isFreelancer ? 'Great work on reaching this milestone' : 'Project milestone has been achieved'}</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${isFreelancer ? data.freelancerName : data.clientName}</strong>,</p>
            
            <p>${isFreelancer 
              ? `Congratulations! You have successfully completed the milestone "<strong>${data.milestoneTitle}</strong>" for project "${data.projectTitle}".`
              : `Great news! The freelancer ${data.freelancerName} has completed the milestone "<strong>${data.milestoneTitle}</strong>" for your project "${data.projectTitle}".`
            }</p>
            
            <div class="milestone-box">
              <strong>🎯 Milestone Details:</strong><br>
              <strong>Milestone:</strong> ${data.milestoneTitle}<br>
              <strong>Project:</strong> ${data.projectTitle}<br>
              <strong>Value:</strong> <span class="amount">${data.amount} ${data.currency}</span>
            </div>
            
            ${isFreelancer ? `
              <h3>🎉 Congratulations!</h3>
              <ul>
                <li>Your milestone has been marked as completed</li>
                <li>The client has been notified to review your work</li>
                <li>Payment will be processed once the client approves</li>
                <li>Keep up the excellent work on the remaining milestones!</li>
              </ul>
              
              <p><strong>What's next:</strong> Continue working on the next milestone or await client feedback on this completed work.</p>
            ` : `
              <h3>📋 Next Steps</h3>
              <ul>
                <li>Review the completed milestone work</li>
                <li>Approve the milestone if you're satisfied with the deliverables</li>
                <li>Process payment for this milestone</li>
                <li>Provide feedback to help guide the next milestone</li>
              </ul>
              
              <p><strong>Payment:</strong> Once you approve this milestone, the payment of ${data.amount} ${data.currency} will be processed to the freelancer.</p>
            `}
            
            <p>Thank you for using Hedwig for your project management needs!</p>
          </div>
          
          <div class="footer">
            <p>This notification was sent by Hedwig Project Management</p>
            <p>Manage your projects at hedwigbot.xyz</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateInvoicePaymentEmailTemplate(data: NotificationData, recipient: 'freelancer' | 'client'): string {
    const isFreelancer = recipient === 'freelancer';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${isFreelancer ? 'Payment Received' : 'Payment Confirmed'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          .amount { font-size: 32px; font-weight: bold; color: #8b5cf6; text-align: center; margin: 20px 0; }
          .money-emoji { font-size: 48px; margin-bottom: 20px; }
          .payment-box { background: #faf5ff; border-left: 4px solid #8b5cf6; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="money-emoji">💰</div>
            <h1>${isFreelancer ? 'Payment Received!' : 'Payment Confirmed!'}</h1>
            <p>${isFreelancer ? 'Your payment has been processed' : 'Your payment was successful'}</p>
          </div>
          
          <div class="content">
            <p>Hello <strong>${isFreelancer ? data.freelancerName : data.clientName}</strong>,</p>
            
            <p>${isFreelancer 
              ? `Great news! You have received a payment for your work on "${data.projectTitle}".`
              : `Thank you! Your payment for "${data.projectTitle}" has been successfully processed.`
            }</p>
            
            <div class="amount">${data.amount} ${data.currency}</div>
            
            <div class="payment-box">
              <strong>💳 Payment Details:</strong><br>
              <strong>Project:</strong> ${data.projectTitle}<br>
              <strong>Amount:</strong> ${data.amount} ${data.currency}<br>
              ${data.invoiceId ? `<strong>Invoice:</strong> ${data.invoiceId}<br>` : ''}
              ${isFreelancer ? `<strong>From:</strong> ${data.clientName}` : `<strong>To:</strong> ${data.freelancerName}`}
            </div>
            
            ${isFreelancer ? `
              <h3>💰 Payment Information</h3>
              <ul>
                <li>The payment has been processed and should be available in your wallet</li>
                <li>You can check your wallet balance to confirm receipt</li>
                <li>Continue working on any remaining milestones</li>
                <li>Thank you for your excellent work!</li>
              </ul>
              
              <p><strong>Next Steps:</strong> Keep up the great work and continue delivering quality results for your client.</p>
            ` : `
              <h3>✅ Payment Confirmation</h3>
              <ul>
                <li>Your payment has been successfully processed</li>
                <li>The freelancer has been notified of the payment</li>
                <li>You can expect continued progress on your project</li>
                <li>Thank you for using our secure payment system</li>
              </ul>
              
              <p><strong>Receipt:</strong> This email serves as your payment confirmation. Keep it for your records.</p>
            `}
            
            <p>Thank you for choosing Hedwig for secure project payments!</p>
          </div>
          
          <div class="footer">
            <p>This notification was sent by Hedwig Payment System</p>
            <p>Manage your payments at hedwigbot.xyz</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// Export singleton instance
export const projectNotificationService = new ProjectNotificationService();