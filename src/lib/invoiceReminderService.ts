import { createClient } from '@supabase/supabase-js';
import { sendEmail, generateInvoiceEmailTemplate } from './emailService';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Interface for reminder logs
interface InvoiceReminderLog {
  id?: string;
  invoice_id: string;
  reminder_type: 'before_due' | 'on_due' | 'after_due' | 'manual';
  message: string;
  success: boolean;
  error?: string;
  created_at?: string;
}

/**
 * Service for handling invoice reminders
 */
export class InvoiceReminderService {
  /**
   * Send a reminder email for an invoice
   */
  static async sendDueDateReminder(
    invoiceId: string,
    reminderType: 'before_due' | 'on_due' | 'after_due' | 'manual',
    customMessage?: string
  ): Promise<boolean> {
    try {
      // Fetch invoice details
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, users!invoices_user_id_fkey(name, email)')
        .eq('id', invoiceId)
        .single();

      if (invoiceError || !invoice) {
        console.error('Error fetching invoice:', invoiceError);
        await this.logReminder({
          invoice_id: invoiceId,
          reminder_type: reminderType,
          message: 'Failed to fetch invoice details',
          success: false,
          error: invoiceError?.message || 'Invoice not found'
        });
        return false;
      }

      // Check if invoice is already paid
      if (invoice.status === 'paid' || invoice.paid_at) {
        console.log(`Invoice ${invoiceId} is already paid, skipping reminder`);
        return false;
      }

      // Generate reminder message based on type
      let message = customMessage || '';
      if (!message) {
        const dueDate = new Date(invoice.due_date);
        const formattedDueDate = dueDate.toLocaleDateString('en-US');

        switch (reminderType) {
          case 'before_due':
            message = `This is a friendly reminder that your invoice is due on ${formattedDueDate}.`;
            break;
          case 'on_due':
            message = `Your invoice is due today (${formattedDueDate}).`;
            break;
          case 'after_due':
            message = `Your invoice was due on ${formattedDueDate} and is now overdue.`;
            break;
          case 'manual':
            message = `This is a reminder about your invoice which was due on ${formattedDueDate}.`;
            break;
        }
      }

      // Send email reminder
      const invoiceData = {
        id: invoiceId,
        invoice_number: invoice.invoice_number || invoiceId,
        project_description: invoice.project_description || 'Services Rendered',
        amount: invoice.amount,
        currency: invoice.token || 'USDC',
        due_date: invoice.due_date,
        client_name: invoice.client_name || 'Valued Client',
        client_email: invoice.client_email || '',
        freelancer_name: invoice.users?.name || invoice.freelancer_name || 'Your Freelancer',
        custom_message: message
      };
      
      await sendEmail({
        to: invoice.client_email || '',
        subject: `Invoice Reminder: ${invoice.invoice_number || invoiceId}`,
        html: generateInvoiceEmailTemplate(invoiceData)
      });

      // Update reminder count and last reminder timestamp
      await supabase
        .from('invoices')
        .update({
          reminder_count: (invoice.reminder_count || 0) + 1,
          last_reminder_at: new Date().toISOString()
        })
        .eq('id', invoiceId);

      // Log the reminder
      await this.logReminder({
        invoice_id: invoiceId,
        reminder_type: reminderType,
        message,
        success: true
      });

      return true;
    } catch (error: any) {
      console.error('Error sending invoice reminder:', error);
      return false;
    }
  }

  /**
   * Process all due date reminders
   */
  static async processDueDateReminders(): Promise<{ sent: number; failed: number }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let sent = 0;
    let failed = 0;
    
    // Get all unpaid invoices with due dates
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .is('paid_at', null)
      .not('due_date', 'is', null)
      .not('status', 'eq', 'paid');

    if (error || !invoices) return { sent: 0, failed: 0 };

    for (const invoice of invoices) {
      try {
        const dueDate = new Date(invoice.due_date);
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
          const lastReminderAt = invoice.last_reminder_at ? new Date(invoice.last_reminder_at) : null;
          const shouldSendReminder = !lastReminderAt || 
            (now.getTime() - lastReminderAt.getTime() > 24 * 60 * 60 * 1000);
          
          if (shouldSendReminder) {
            const success = await this.sendDueDateReminder(invoice.id, reminderType);
            if (success) {
              sent++;
            } else {
              failed++;
            }
          }
        }
      } catch (err) {
        console.error(`Error processing reminder for invoice ${invoice.id}:`, err);
        failed++;
      }
    }
    
    return { sent, failed };
  }

  /**
   * Log a reminder attempt
   */
  private static async logReminder(log: InvoiceReminderLog): Promise<void> {
    try {
      await supabase.from('invoice_reminder_logs').insert(log);
    } catch (err) {
      console.error('Failed to log invoice reminder:', err);
    }
  }

  /**
   * Get reminder history for an invoice
   */
  static async getReminderHistory(invoiceId: string): Promise<InvoiceReminderLog[]> {
    try {
      const { data, error } = await supabase
        .from('invoice_reminder_logs')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });

      return data || [];
    } catch (err) {
      console.error('Failed to get reminder history:', err);
      return [];
    }
  }
}