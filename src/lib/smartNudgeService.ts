import { createClient } from '@supabase/supabase-js';
import { loadServerEnvironment } from './serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface NudgeTarget {
  id: string;
  type: 'payment_link' | 'invoice';
  userId: string;
  clientEmail?: string;
  amount: number;
  title: string;
  viewedAt?: string;
  paidAt?: string;
  nudgeCount: number;
  lastNudgeAt?: string;
  nudgeDisabled: boolean;
  createdAt: string;
}

export interface NudgeLog {
  targetType: 'payment_link' | 'invoice';
  targetId: string;
  userId: string;
  nudgeType: string;
  messageSent: string;
  sentVia: string;
  success: boolean;
  errorMessage?: string;
}

export class SmartNudgeService {
  private static readonly MAX_NUDGES = 3;
  private static readonly NUDGE_DELAY_HOURS = 24; // Wait 24 hours after viewing before first nudge
  private static readonly NUDGE_INTERVAL_HOURS = 48; // Wait 48 hours between nudges

  /**
   * Get all payment links and invoices that need nudging
   */
  static async getTargetsForNudging(): Promise<NudgeTarget[]> {
    const now = new Date();
    const nudgeThreshold = new Date(now.getTime() - (this.NUDGE_DELAY_HOURS * 60 * 60 * 1000));
    const intervalThreshold = new Date(now.getTime() - (this.NUDGE_INTERVAL_HOURS * 60 * 60 * 1000));

    const targets: NudgeTarget[] = [];

    // Get payment links that need nudging
    const { data: paymentLinks, error: paymentError } = await supabase
      .from('payment_links')
      .select(`
        id,
        amount,
        payment_reason,
        recipient_email,
        viewed_at,
        paid_at,
        nudge_count,
        last_nudge_at,
        nudge_disabled,
        created_at,
        created_by
      `)
      .eq('status', 'pending')
      .is('paid_at', null)
      .eq('nudge_disabled', false)
      .lt('nudge_count', this.MAX_NUDGES)
      .not('viewed_at', 'is', null)
      .or(`viewed_at.lt.${nudgeThreshold.toISOString()},and(viewed_at.not.is.null,last_nudge_at.lt.${intervalThreshold.toISOString()})`);

    if (!paymentError && paymentLinks) {
      for (const link of paymentLinks) {
        if (link.viewed_at && link.recipient_email) {
          // Check if enough time has passed since last nudge or if it's the first nudge
          const shouldNudge = !link.last_nudge_at || 
            new Date(link.last_nudge_at) < intervalThreshold;

          if (shouldNudge) {
            targets.push({
              id: link.id,
              type: 'payment_link',
              userId: link.created_by,
              clientEmail: link.recipient_email,
              amount: parseFloat(link.amount),
              title: link.payment_reason || 'Payment',
              viewedAt: link.viewed_at,
              paidAt: link.paid_at,
              nudgeCount: link.nudge_count || 0,
              lastNudgeAt: link.last_nudge_at,
              nudgeDisabled: link.nudge_disabled,
              createdAt: link.created_at
            });
          }
        }
      }
    }

    // Get invoices that need nudging
    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        total_amount,
        invoice_number,
        client_email,
        viewed_at,
        status,
        nudge_count,
        last_nudge_at,
        nudge_disabled,
        date_created,
        user_id
      `)
      .neq('status', 'paid')
      .eq('nudge_disabled', false)
      .lt('nudge_count', this.MAX_NUDGES)
      .not('viewed_at', 'is', null)
      .or(`viewed_at.lt.${nudgeThreshold.toISOString()},and(viewed_at.not.is.null,last_nudge_at.lt.${intervalThreshold.toISOString()})`);

    if (!invoiceError && invoices) {
      for (const invoice of invoices) {
        if (invoice.viewed_at && invoice.client_email) {
          // Check if enough time has passed since last nudge or if it's the first nudge
          const shouldNudge = !invoice.last_nudge_at || 
            new Date(invoice.last_nudge_at) < intervalThreshold;

          if (shouldNudge) {
            targets.push({
              id: invoice.id,
              type: 'invoice',
              userId: invoice.user_id,
              clientEmail: invoice.client_email,
              amount: parseFloat(invoice.total_amount),
              title: `Invoice ${invoice.invoice_number || invoice.id}`,
              viewedAt: invoice.viewed_at,
              paidAt: invoice.status === 'paid' ? invoice.date_created : undefined,
              nudgeCount: invoice.nudge_count || 0,
              lastNudgeAt: invoice.last_nudge_at,
              nudgeDisabled: invoice.nudge_disabled,
              createdAt: invoice.date_created
            });
          }
        }
      }
    }

    return targets;
  }

  /**
   * Send a nudge email for a specific payment link or invoice
   */
  static async sendNudge(target: NudgeTarget): Promise<boolean> {
    try {
      const message = this.generateNudgeMessage(target);
      let success = false;
      let errorMessage = '';

      // Send email reminder to client
      if (target.clientEmail) {
        try {
          // Here you would integrate with your email service (SendGrid, Resend, etc.)
          // For now, we'll just log the email that would be sent
          console.log(`Sending email reminder to ${target.clientEmail}:`);
          console.log(`Subject: Payment Reminder - ${target.title}`);
          console.log(`Message: ${message}`);
          
          // TODO: Implement actual email sending
          // await sendEmail({
          //   to: target.clientEmail,
          //   subject: `Payment Reminder - ${target.title}`,
          //   text: message
          // });
          
          success = true;
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : 'Email send failed';
          console.error(`Failed to send email nudge for ${target.type} ${target.id}:`, error);
        }
      }

      // Update nudge count and timestamp based on target type
      const tableName = target.type === 'payment_link' ? 'payment_links' : 'invoices';
      await supabase
        .from(tableName)
        .update({
          nudge_count: target.nudgeCount + 1,
          last_nudge_at: new Date().toISOString()
        })
        .eq('id', target.id);

      // Log the nudge attempt
      await this.logNudge({
        targetType: target.type,
        targetId: target.id,
        userId: target.userId,
        nudgeType: this.getNudgeType(target.nudgeCount + 1),
        messageSent: message,
        sentVia: 'email',
        success,
        errorMessage: errorMessage || undefined
      });

      return success;
    } catch (error) {
      console.error(`Error sending nudge for ${target.type} ${target.id}:`, error);
      return false;
    }
  }

  /**
   * Process all pending nudges
   */
  static async processNudges(): Promise<{ sent: number; failed: number }> {
    const targets = await this.getTargetsForNudging();
    let sent = 0;
    let failed = 0;

    console.log(`Processing ${targets.length} nudge targets`);

    for (const target of targets) {
      const success = await this.sendNudge(target);
      if (success) {
        sent++;
      } else {
        failed++;
      }

      // Add a small delay between sends to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Nudge processing complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }

  /**
   * Mark a payment link or invoice as viewed
   */
  static async markAsViewed(targetType: 'payment_link' | 'invoice', targetId: string): Promise<void> {
    const tableName = targetType === 'payment_link' ? 'payment_links' : 'invoices';
    await supabase
      .from(tableName)
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', targetId)
      .is('viewed_at', null); // Only update if not already viewed
  }

  /**
   * Mark a payment link or invoice as paid
   */
  static async markAsPaid(targetType: 'payment_link' | 'invoice', targetId: string): Promise<void> {
    const tableName = targetType === 'payment_link' ? 'payment_links' : 'invoices';
    const updateData = targetType === 'payment_link' 
      ? { paid_at: new Date().toISOString(), status: 'paid' }
      : { status: 'paid' }; // For invoices, we only update status
    
    await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', targetId);
  }

  /**
   * Disable nudges for a payment link or invoice
   */
  static async disableNudges(targetType: 'payment_link' | 'invoice', targetId: string): Promise<void> {
    const tableName = targetType === 'payment_link' ? 'payment_links' : 'invoices';
    await supabase
      .from(tableName)
      .update({ nudge_disabled: true })
      .eq('id', targetId);
  }

  /**
   * Generate contextual nudge message for email
   */
  private static generateNudgeMessage(target: NudgeTarget): string {
    const nudgeNumber = target.nudgeCount + 1;
    const daysSinceViewed = target.viewedAt ? 
      Math.floor((Date.now() - new Date(target.viewedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const baseMessages = {
      1: `Dear Client,\n\nThis is a friendly reminder that your payment for "${target.title}" in the amount of $${target.amount} was viewed ${daysSinceViewed} days ago but hasn't been completed yet.\n\nPlease complete your payment at your earliest convenience.\n\nThank you!`,
      2: `Dear Client,\n\nWe wanted to follow up regarding your pending payment for "${target.title}" ($${target.amount}). The payment link was accessed but the transaction hasn't been completed.\n\nIf you're experiencing any issues with the payment process, please don't hesitate to reach out.\n\nBest regards`,
      3: `Dear Client,\n\nThis is our final automated reminder regarding the outstanding payment for "${target.title}" ($${target.amount}).\n\nPlease complete your payment as soon as possible. If you have any questions or concerns, please contact us directly.\n\nThank you for your attention to this matter.`
    };

    return baseMessages[nudgeNumber as 1 | 2 | 3] || 
           `Reminder: Please complete your payment for "${target.title}" ($${target.amount}).`;
  }

  /**
   * Get nudge type for logging
   */
  private static getNudgeType(nudgeNumber: number): string {
    const types = {
      1: 'first_reminder',
      2: 'second_reminder',
      3: 'final_reminder'
    };
    return types[nudgeNumber as 1 | 2 | 3] || 'reminder';
  }

  /**
   * Log nudge attempt
   */
  private static async logNudge(log: NudgeLog): Promise<void> {
    await supabase
      .from('nudge_logs')
      .insert({
        target_type: log.targetType,
        target_id: log.targetId,
        user_id: log.userId,
        nudge_type: log.nudgeType,
        message_sent: log.messageSent,
        sent_via: log.sentVia,
        success: log.success,
        error_message: log.errorMessage
      });
  }

  /**
   * Get nudge statistics
   */
  static async getNudgeStats(userId?: string): Promise<{
    totalNudgesSent: number;
    successRate: number;
    activeTargets: number;
  }> {
    let query = supabase
      .from('nudge_logs')
      .select('success');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: logs } = await query;
    const totalNudgesSent = logs?.length || 0;
    const successfulNudges = logs?.filter(log => log.success).length || 0;
    const successRate = totalNudgesSent > 0 ? (successfulNudges / totalNudgesSent) * 100 : 0;

    // Get active targets (not paid, not disabled, under max nudges)
    const activeTargets = await this.getTargetsForNudging();
    
    return {
      totalNudgesSent,
      successRate: Math.round(successRate * 100) / 100,
      activeTargets: activeTargets.length
    };
  }
}