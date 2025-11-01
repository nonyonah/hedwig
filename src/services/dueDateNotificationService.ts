import { supabase } from '../lib/supabase';
import { contractNotificationService } from './contractNotificationService';
import { sendSimpleEmail } from '../lib/emailService';

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  project_description: string;
  amount: number;
  currency: string;
  due_date: string;
  status: string;
  days_overdue: number;
  user_id?: string;
  project_contract_id?: string;
}

interface OverdueMilestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  deadline: string;
  status: string;
  days_overdue: number;
  contract_id: string;
  contract: {
    id: string;
    project_title: string;
    freelancer_id: string;
    client_id: string;
    client_email: string;
    freelancer_email?: string;
    client_name?: string;
    freelancer_name?: string;
    currency: string;
  };
}

export class DueDateNotificationService {
  
  /**
   * Check for overdue invoices and send notifications
   */
  async checkOverdueInvoices(): Promise<{ overdueCount: number; notificationsSent: number }> {
    try {
      console.log('[DueDateNotification] Checking for overdue invoices...');
      
      // Get overdue invoices (due_date < today and status not paid)
      const { data: overdueInvoices, error } = await supabase
        .from('invoices')
        .select('*')
        .lt('due_date', new Date().toISOString().split('T')[0])
        .not('status', 'eq', 'paid')
        .not('status', 'eq', 'cancelled');

      if (error) {
        console.error('[DueDateNotification] Error fetching overdue invoices:', error);
        return { overdueCount: 0, notificationsSent: 0 };
      }

      if (!overdueInvoices || overdueInvoices.length === 0) {
        console.log('[DueDateNotification] No overdue invoices found');
        return { overdueCount: 0, notificationsSent: 0 };
      }

      console.log(`[DueDateNotification] Found ${overdueInvoices.length} overdue invoices`);

      let notificationsSent = 0;
      for (const invoice of overdueInvoices) {
        try {
          await this.sendOverdueInvoiceNotification(invoice);
          notificationsSent++;
        } catch (error) {
          console.error('[DueDateNotification] Error sending notification for invoice:', invoice.id, error);
        }
      }

      return { overdueCount: overdueInvoices.length, notificationsSent };

    } catch (error) {
      console.error('[DueDateNotification] Error in checkOverdueInvoices:', error);
      return { overdueCount: 0, notificationsSent: 0 };
    }
  }

  /**
   * Check for overdue milestones and send notifications
   */
  async checkOverdueMilestones(): Promise<{ overdueCount: number; notificationsSent: number }> {
    try {
      console.log('[DueDateNotification] Checking for overdue milestones...');
      
      // Get overdue milestones (deadline < today and status pending)
      const { data: overdueMilestones, error } = await supabase
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
              email,
              username
            )
          )
        `)
        .lt('deadline', new Date().toISOString())
        .eq('status', 'pending');

      if (error) {
        console.error('[DueDateNotification] Error fetching overdue milestones:', error);
        return { overdueCount: 0, notificationsSent: 0 };
      }

      if (!overdueMilestones || overdueMilestones.length === 0) {
        console.log('[DueDateNotification] No overdue milestones found');
        return { overdueCount: 0, notificationsSent: 0 };
      }

      console.log(`[DueDateNotification] Found ${overdueMilestones.length} overdue milestones`);

      let notificationsSent = 0;
      for (const milestone of overdueMilestones) {
        try {
          await this.sendOverdueMilestoneNotification(milestone);
          notificationsSent++;
        } catch (error) {
          console.error('[DueDateNotification] Error sending notification for milestone:', milestone.id, error);
        }
      }

      return { overdueCount: overdueMilestones.length, notificationsSent };

    } catch (error) {
      console.error('[DueDateNotification] Error in checkOverdueMilestones:', error);
      return { overdueCount: 0, notificationsSent: 0 };
    }
  }

  /**
   * Send notification for overdue invoice
   */
  private async sendOverdueInvoiceNotification(invoice: any): Promise<void> {
    try {
      const daysOverdue = this.calculateDaysOverdue(invoice.due_date);
      
      console.log(`[DueDateNotification] Sending overdue notification for invoice ${invoice.invoice_number} (${daysOverdue} days overdue)`);

      // Send email to freelancer
      if (invoice.freelancer_email) {
        await this.sendOverdueInvoiceEmail(invoice, 'freelancer', daysOverdue);
      }

      // Send email to client
      if (invoice.client_email) {
        await this.sendOverdueInvoiceEmail(invoice, 'client', daysOverdue);
      }

      // Send Telegram notification to freelancer if user_id exists
      if (invoice.user_id) {
        await this.sendTelegramOverdueNotification(invoice.user_id, 'invoice', {
          invoice_number: invoice.invoice_number,
          amount: invoice.amount,
          currency: invoice.currency,
          days_overdue: daysOverdue,
          client_name: invoice.client_name
        });
      }

    } catch (error) {
      console.error(`[DueDateNotification] Error sending overdue invoice notification for ${invoice.invoice_number}:`, error);
    }
  }

  /**
   * Send notification for overdue milestone
   */
  private async sendOverdueMilestoneNotification(milestone: any): Promise<void> {
    try {
      const daysOverdue = this.calculateDaysOverdue(milestone.deadline);
      const contract = milestone.project_contracts;
      
      console.log(`[DueDateNotification] Sending overdue notification for milestone ${milestone.title} (${daysOverdue} days overdue)`);

      // Send email to freelancer
      if (contract?.users?.email) {
        await this.sendOverdueMilestoneEmail(milestone, contract, 'freelancer', daysOverdue);
      }

      // Send email to client
      if (contract?.client_email) {
        await this.sendOverdueMilestoneEmail(milestone, contract, 'client', daysOverdue);
      }

      // Send Telegram notification to freelancer
      if (contract?.freelancer_id) {
        await this.sendTelegramOverdueNotification(contract.freelancer_id, 'milestone', {
          milestone_title: milestone.title,
          project_title: contract.project_title,
          amount: milestone.amount,
          currency: contract.currency,
          days_overdue: daysOverdue,
          client_name: contract.client_name
        });
      }

    } catch (error) {
      console.error(`[DueDateNotification] Error sending overdue milestone notification for ${milestone.title}:`, error);
    }
  }

  /**
   * Send overdue invoice email
   */
  private async sendOverdueInvoiceEmail(invoice: any, recipient: 'freelancer' | 'client', daysOverdue: number): Promise<void> {
    const isFreelancer = recipient === 'freelancer';
    const email = isFreelancer ? invoice.freelancer_email : invoice.client_email;
    const name = isFreelancer ? invoice.freelancer_name : invoice.client_name;

    const subject = `⚠️ Overdue Invoice: ${invoice.invoice_number} (${daysOverdue} days overdue)`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h2 style="color: #dc2626; margin: 0 0 8px 0;">⚠️ Invoice Overdue</h2>
          <p style="color: #7f1d1d; margin: 0;">This invoice is ${daysOverdue} days past due and requires immediate attention.</p>
        </div>

        <h3>Invoice Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Invoice Number:</td>
            <td style="padding: 8px 0;">${invoice.invoice_number}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Project:</td>
            <td style="padding: 8px 0;">${invoice.project_description}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
            <td style="padding: 8px 0;">${invoice.amount} ${invoice.currency}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Due Date:</td>
            <td style="padding: 8px 0;">${new Date(invoice.due_date).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Days Overdue:</td>
            <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">${daysOverdue} days</td>
          </tr>
        </table>

        ${isFreelancer ? `
          <p><strong>Action Required:</strong> Please follow up with your client (${invoice.client_name}) regarding this overdue payment.</p>
        ` : `
          <p><strong>Action Required:</strong> Please process payment for this overdue invoice from ${invoice.freelancer_name}.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/invoice/${invoice.id}" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View & Pay Invoice
            </a>
          </div>
        `}

        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          This is an automated reminder. If you have any questions, please contact support.
        </p>
      </div>
    `;

    await sendSimpleEmail(email, subject, html);
  }

  /**
   * Send overdue milestone email
   */
  private async sendOverdueMilestoneEmail(milestone: any, contract: any, recipient: 'freelancer' | 'client', daysOverdue: number): Promise<void> {
    const isFreelancer = recipient === 'freelancer';
    const email = isFreelancer ? contract.users?.email : contract.client_email;
    const name = isFreelancer ? contract.users?.username : contract.client_name;

    const subject = `⚠️ Overdue Milestone: ${milestone.title} (${daysOverdue} days overdue)`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h2 style="color: #dc2626; margin: 0 0 8px 0;">⚠️ Milestone Overdue</h2>
          <p style="color: #7f1d1d; margin: 0;">This milestone is ${daysOverdue} days past due and requires immediate attention.</p>
        </div>

        <h3>Milestone Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Project:</td>
            <td style="padding: 8px 0;">${contract.project_title}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Milestone:</td>
            <td style="padding: 8px 0;">${milestone.title}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Description:</td>
            <td style="padding: 8px 0;">${milestone.description || 'No description'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
            <td style="padding: 8px 0;">${milestone.amount} ${contract.currency}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Deadline:</td>
            <td style="padding: 8px 0;">${new Date(milestone.deadline).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold;">Days Overdue:</td>
            <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">${daysOverdue} days</td>
          </tr>
        </table>

        ${isFreelancer ? `
          <p><strong>Action Required:</strong> This milestone is overdue. Please complete the work and mark it as completed, or contact your client to discuss an extension.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Contract
            </a>
          </div>
        ` : `
          <p><strong>Action Required:</strong> This milestone from ${contract.users?.username || 'your freelancer'} is overdue. Please follow up to check on progress.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Contract
            </a>
          </div>
        `}

        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          This is an automated reminder. If you have any questions, please contact support.
        </p>
      </div>
    `;

    await sendSimpleEmail(email, subject, html);
  }

  /**
   * Send Telegram notification for overdue items
   */
  private async sendTelegramOverdueNotification(userId: string, type: 'invoice' | 'milestone', data: any): Promise<void> {
    try {
      // Get user's Telegram ID
      const { data: user, error } = await supabase
        .from('users')
        .select('telegram_user_id')
        .eq('id', userId)
        .single();

      if (error || !user?.telegram_user_id) {
        console.log(`[DueDateNotification] No Telegram ID found for user ${userId}`);
        return;
      }

      let message = '';
      if (type === 'invoice') {
        message = `⚠️ *Invoice Overdue*\n\n` +
          `📄 Invoice: ${data.invoice_number}\n` +
          `💰 Amount: ${data.amount} ${data.currency}\n` +
          `👤 Client: ${data.client_name}\n` +
          `📅 Overdue: ${data.days_overdue} days\n\n` +
          `Please follow up with your client regarding this overdue payment.`;
      } else {
        message = `⚠️ *Milestone Overdue*\n\n` +
          `📋 Project: ${data.project_title}\n` +
          `🎯 Milestone: ${data.milestone_title}\n` +
          `💰 Amount: ${data.amount} ${data.currency}\n` +
          `👤 Client: ${data.client_name}\n` +
          `📅 Overdue: ${data.days_overdue} days\n\n` +
          `Please complete this milestone or contact your client to discuss an extension.`;
      }

      // Send Telegram message directly
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: user.telegram_user_id,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.statusText}`);
      }

    } catch (error) {
      console.error(`[DueDateNotification] Error sending Telegram notification:`, error);
    }
  }

  /**
   * Calculate days overdue
   */
  private calculateDaysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    const today = new Date();
    const diffTime = today.getTime() - due.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Run all due date checks
   */
  async runDueDateChecks(): Promise<void> {
    console.log('[DueDateNotification] Starting due date checks...');
    
    await Promise.all([
      this.checkOverdueInvoices(),
      this.checkOverdueMilestones()
    ]);
    
    console.log('[DueDateNotification] Due date checks completed');
  }
}

export const dueDateNotificationService = new DueDateNotificationService();