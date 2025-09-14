import { createClient } from '@supabase/supabase-js';
import { sendPaymentLinkEmail } from './paymentlinkservice';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Interface for reminder logs
interface PaymentLinkReminderLog {
  id?: string;
  payment_link_id: string;
  reminder_type: 'before_due' | 'on_due' | 'after_due' | 'manual';
  message: string;
  success: boolean;
  error?: string;
  created_at?: string;
}

/**
 * Service for handling payment link reminders
 */
export class PaymentLinkReminderService {
  /**
   * Send a reminder email for a payment link
   */
  static async sendDueDateReminder(
    paymentLinkId: string,
    reminderType: 'before_due' | 'on_due' | 'after_due' | 'manual',
    customMessage?: string
  ): Promise<boolean> {
    try {
      // Fetch payment link details
      const { data: paymentLink, error: paymentLinkError } = await supabase
        .from('payment_links')
        .select('*, users!created_by(name, email)')
        .eq('id', paymentLinkId)
        .single();

      if (paymentLinkError || !paymentLink) {
        console.error('Error fetching payment link:', paymentLinkError);
        await this.logReminder({
          payment_link_id: paymentLinkId,
          reminder_type: reminderType,
          message: 'Failed to fetch payment link details',
          success: false,
          error: paymentLinkError?.message || 'Payment link not found'
        });
        return false;
      }

      // Check if payment link is already paid
      if (paymentLink.status === 'paid' || paymentLink.paid_at) {
        console.log(`Payment link ${paymentLinkId} is already paid, skipping reminder`);
        return false;
      }

      // Check if payment link has a due date
      if (!paymentLink.due_date) {
        console.log(`Payment link ${paymentLinkId} has no due date, skipping reminder`);
        return false;
      }

      // Generate reminder message based on type
      let message = customMessage || '';
      if (!message) {
        const dueDate = new Date(paymentLink.due_date);
        const formattedDueDate = dueDate.toLocaleDateString('en-US');

        switch (reminderType) {
          case 'before_due':
            message = `This is a friendly reminder that your payment is due on ${formattedDueDate}.`;
            break;
          case 'on_due':
            message = `Your payment is due today (${formattedDueDate}).`;
            break;
          case 'after_due':
            message = `Your payment was due on ${formattedDueDate} and is now overdue.`;
            break;
          case 'manual':
            message = `This is a reminder about your payment which was due on ${formattedDueDate}.`;
            break;
        }
      }

      // Send email reminder
      await sendPaymentLinkEmail({
        recipientEmail: paymentLink.recipient_email || '',
        amount: parseFloat(paymentLink.amount),
        token: paymentLink.token || 'USDC',
        network: paymentLink.network || 'base',
        paymentLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.hedwigbot.xyz'}/payment-link/${paymentLinkId}`,
        senderName: paymentLink.users?.name || paymentLink.user_name || 'Your Service Provider',
        reason: paymentLink.payment_reason || 'Payment Request',
        customMessage: message,
        isReminder: true
      });

      // Update reminder count and last reminder timestamp
      await supabase
        .from('payment_links')
        .update({
          reminder_count: (paymentLink.reminder_count || 0) + 1,
          last_reminder_at: new Date().toISOString()
        })
        .eq('id', paymentLinkId);

      // Log the reminder
      await this.logReminder({
        payment_link_id: paymentLinkId,
        reminder_type: reminderType,
        message,
        success: true
      });

      return true;
    } catch (error: any) {
      console.error('Error sending payment link reminder:', error);
      return false;
    }
  }

  /**
   * Process all due date reminders for payment links
   */
  static async processDueDateReminders(): Promise<{ sent: number; failed: number }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let sent = 0;
    let failed = 0;
    
    // Get all unpaid payment links with due dates
    const { data: paymentLinks, error } = await supabase
      .from('payment_links')
      .select('*')
      .is('paid_at', null)
      .not('due_date', 'is', null)
      .not('status', 'eq', 'paid');

    if (error || !paymentLinks) return { sent: 0, failed: 0 };

    for (const paymentLink of paymentLinks) {
      try {
        const dueDate = new Date(paymentLink.due_date);
        const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        
        // Calculate days difference
        const diffTime = dueDateOnly.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Check if we should send a reminder
        let reminderType: 'before_due' | 'on_due' | 'after_due' | null = null;
        
        if (diffDays === 3) {
          reminderType = 'before_due';
        } else if (diffDays === 0) {
          reminderType = 'on_due';
        } else if (diffDays === -3) {
          reminderType = 'after_due';
        }
        
        if (reminderType) {
          // Check if we've already sent a reminder in the last 24 hours
          const lastReminderAt = paymentLink.last_reminder_at ? new Date(paymentLink.last_reminder_at) : null;
          const shouldSendReminder = !lastReminderAt || 
            (now.getTime() - lastReminderAt.getTime() > 24 * 60 * 60 * 1000);
          
          if (shouldSendReminder) {
            const success = await this.sendDueDateReminder(paymentLink.id, reminderType);
            if (success) {
              sent++;
            } else {
              failed++;
            }
          }
        }
      } catch (err) {
        console.error(`Error processing reminder for payment link ${paymentLink.id}:`, err);
        failed++;
      }
    }
    
    return { sent, failed };
  }

  /**
   * Log a reminder attempt
   */
  private static async logReminder(log: PaymentLinkReminderLog): Promise<void> {
    try {
      await supabase
        .from('payment_link_reminder_logs')
        .insert({
          payment_link_id: log.payment_link_id,
          reminder_type: log.reminder_type,
          email_sent_to: '', // Will be populated from payment link data
          email_subject: `Payment Reminder - ${log.reminder_type}`,
          email_body: log.message,
          success: log.success,
          error_message: log.error || null
        });
    } catch (error) {
      console.error('Error logging payment link reminder:', error);
    }
  }

  /**
   * Get reminder statistics for a payment link
   */
  static async getReminderStats(paymentLinkId: string): Promise<{
    totalReminders: number;
    lastReminderAt?: string;
    reminderTypes: Record<string, number>;
  }> {
    try {
      const { data: logs, error } = await supabase
        .from('payment_link_reminder_logs')
        .select('reminder_type, sent_at')
        .eq('payment_link_id', paymentLinkId)
        .eq('success', true)
        .order('sent_at', { ascending: false });

      if (error || !logs) {
        return { totalReminders: 0, reminderTypes: {} };
      }

      const reminderTypes: Record<string, number> = {};
      logs.forEach(log => {
        reminderTypes[log.reminder_type] = (reminderTypes[log.reminder_type] || 0) + 1;
      });

      return {
        totalReminders: logs.length,
        lastReminderAt: logs[0]?.sent_at,
        reminderTypes
      };
    } catch (error) {
      console.error('Error getting reminder stats:', error);
      return { totalReminders: 0, reminderTypes: {} };
    }
  }
}