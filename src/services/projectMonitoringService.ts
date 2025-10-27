import { createClient } from '@supabase/supabase-js';
import { projectNotificationService, NotificationData } from './projectNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class ProjectMonitoringService {
  
  /**
   * Check for approaching deadlines (3 days before)
   */
  async checkApproachingDeadlines(): Promise<void> {
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      threeDaysFromNow.setHours(23, 59, 59, 999);

      // Check project_contracts table
      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          token_type,
          deadline,
          freelancer_id,
          client_email,
          legal_contracts!project_contracts_legal_contract_hash_fkey (
            freelancer_name,
            freelancer_email,
            client_name
          )
        `)
        .eq('status', 'approved')
        .gte('deadline', today.toISOString())
        .lte('deadline', threeDaysFromNow.toISOString());

      if (error) {
        console.error('[ProjectMonitoring] Error fetching approaching deadlines:', error);
        return;
      }

      // Check if we've already sent reminders for these contracts today
      for (const contract of contracts || []) {
        const alreadySent = await this.hasNotificationBeenSent(
          contract.id, 
          'deadline_reminder', 
          today
        );

        if (!alreadySent) {
          const notificationData: NotificationData = {
            contractId: contract.id,
            projectTitle: contract.project_title,
            freelancerId: contract.freelancer_id,
            freelancerName: contract.legal_contracts?.freelancer_name,
            freelancerEmail: contract.legal_contracts?.freelancer_email,
            clientName: contract.legal_contracts?.client_name,
            clientEmail: contract.client_email,
            amount: contract.total_amount,
            currency: contract.token_type || 'USDC',
            deadline: contract.deadline
          };

          await projectNotificationService.sendDeadlineReminder(notificationData, 'approaching');
        }
      }

      // Also check contracts table (Contracts 2.0)
      const { data: contracts2, error: error2 } = await supabase
        .from('contracts')
        .select(`
          id,
          title,
          total_amount,
          currency,
          deadline,
          freelancer_id,
          client_email,
          client_name,
          users!contracts_freelancer_id_fkey (
            email,
            first_name,
            last_name
          )
        `)
        .eq('status', 'approved')
        .gte('deadline', today.toISOString())
        .lte('deadline', threeDaysFromNow.toISOString());

      if (!error2) {
        for (const contract of contracts2 || []) {
          const alreadySent = await this.hasNotificationBeenSent(
            contract.id, 
            'deadline_reminder', 
            today
          );

          if (!alreadySent) {
            const notificationData: NotificationData = {
              contractId: contract.id,
              projectTitle: contract.title,
              freelancerId: contract.freelancer_id,
              freelancerName: `${contract.users?.first_name || ''} ${contract.users?.last_name || ''}`.trim(),
              freelancerEmail: contract.users?.email,
              clientName: contract.client_name,
              clientEmail: contract.client_email,
              amount: contract.total_amount,
              currency: contract.currency || 'USD',
              deadline: contract.deadline
            };

            await projectNotificationService.sendDeadlineReminder(notificationData, 'approaching');
          }
        }
      }

      console.log(`[ProjectMonitoring] Checked approaching deadlines: ${(contracts?.length || 0) + (contracts2?.length || 0)} contracts processed`);
    } catch (error) {
      console.error('[ProjectMonitoring] Error checking approaching deadlines:', error);
    }
  }

  /**
   * Check for overdue projects
   */
  async checkOverdueProjects(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check project_contracts table
      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          token_type,
          deadline,
          freelancer_id,
          client_email,
          legal_contracts!project_contracts_legal_contract_hash_fkey (
            freelancer_name,
            freelancer_email,
            client_name
          )
        `)
        .eq('status', 'approved')
        .lt('deadline', today.toISOString());

      if (error) {
        console.error('[ProjectMonitoring] Error fetching overdue projects:', error);
        return;
      }

      // Check if we've already sent overdue notifications today
      for (const contract of contracts || []) {
        const alreadySent = await this.hasNotificationBeenSent(
          contract.id, 
          'deadline_overdue', 
          today
        );

        if (!alreadySent) {
          const deadlineDate = new Date(contract.deadline);
          const daysOverdue = Math.floor((today.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));

          const notificationData: NotificationData = {
            contractId: contract.id,
            projectTitle: contract.project_title,
            freelancerId: contract.freelancer_id,
            freelancerName: contract.legal_contracts?.freelancer_name,
            freelancerEmail: contract.legal_contracts?.freelancer_email,
            clientName: contract.legal_contracts?.client_name,
            clientEmail: contract.client_email,
            amount: contract.total_amount,
            currency: contract.token_type || 'USDC',
            deadline: contract.deadline,
            daysOverdue
          };

          await projectNotificationService.sendDeadlineReminder(notificationData, 'overdue');
        }
      }

      // Also check contracts table (Contracts 2.0)
      const { data: contracts2, error: error2 } = await supabase
        .from('contracts')
        .select(`
          id,
          title,
          total_amount,
          currency,
          deadline,
          freelancer_id,
          client_email,
          client_name,
          users!contracts_freelancer_id_fkey (
            email,
            first_name,
            last_name
          )
        `)
        .eq('status', 'approved')
        .lt('deadline', today.toISOString());

      if (!error2) {
        for (const contract of contracts2 || []) {
          const alreadySent = await this.hasNotificationBeenSent(
            contract.id, 
            'deadline_overdue', 
            today
          );

          if (!alreadySent) {
            const deadlineDate = new Date(contract.deadline);
            const daysOverdue = Math.floor((today.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));

            const notificationData: NotificationData = {
              contractId: contract.id,
              projectTitle: contract.title,
              freelancerId: contract.freelancer_id,
              freelancerName: `${contract.users?.first_name || ''} ${contract.users?.last_name || ''}`.trim(),
              freelancerEmail: contract.users?.email,
              clientName: contract.client_name,
              clientEmail: contract.client_email,
              amount: contract.total_amount,
              currency: contract.currency || 'USD',
              deadline: contract.deadline,
              daysOverdue
            };

            await projectNotificationService.sendDeadlineReminder(notificationData, 'overdue');
          }
        }
      }

      console.log(`[ProjectMonitoring] Checked overdue projects: ${(contracts?.length || 0) + (contracts2?.length || 0)} contracts processed`);
    } catch (error) {
      console.error('[ProjectMonitoring] Error checking overdue projects:', error);
    }
  }

  /**
   * Monitor milestone completions
   */
  async monitorMilestoneCompletions(): Promise<void> {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Check for recently completed milestones that haven't been notified
      const { data: milestones, error } = await supabase
        .from('contract_milestones')
        .select(`
          id,
          title,
          amount,
          status,
          completed_at,
          contract_id,
          contracts!contract_milestones_contract_id_fkey (
            title,
            freelancer_id,
            client_email,
            client_name,
            currency,
            users!contracts_freelancer_id_fkey (
              email,
              first_name,
              last_name
            )
          )
        `)
        .eq('status', 'completed')
        .gte('completed_at', yesterday.toISOString())
        .lte('completed_at', today.toISOString());

      if (error) {
        console.error('[ProjectMonitoring] Error fetching completed milestones:', error);
        return;
      }

      for (const milestone of milestones || []) {
        const alreadySent = await this.hasNotificationBeenSent(
          milestone.contract_id, 
          'milestone_completed', 
          yesterday,
          milestone.id
        );

        if (!alreadySent) {
          const contract = milestone.contracts;
          const notificationData: NotificationData = {
            contractId: milestone.contract_id,
            projectTitle: contract.title,
            freelancerId: contract.freelancer_id,
            freelancerName: `${contract.users?.first_name || ''} ${contract.users?.last_name || ''}`.trim(),
            freelancerEmail: contract.users?.email,
            clientName: contract.client_name,
            clientEmail: contract.client_email,
            amount: milestone.amount,
            currency: contract.currency || 'USD',
            milestoneTitle: milestone.title
          };

          await projectNotificationService.sendMilestoneAchievement(notificationData);
        }
      }

      console.log(`[ProjectMonitoring] Monitored milestone completions: ${milestones?.length || 0} milestones processed`);
    } catch (error) {
      console.error('[ProjectMonitoring] Error monitoring milestone completions:', error);
    }
  }

  /**
   * Monitor invoice payments
   */
  async monitorInvoicePayments(): Promise<void> {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Check for recently paid invoices
      const { data: invoices, error } = await supabase
        .from('contract_invoices')
        .select(`
          id,
          title,
          amount,
          currency,
          status,
          paid_at,
          contract_id,
          freelancer_id,
          client_email,
          client_name,
          contracts!contract_invoices_contract_id_fkey (
            title,
            users!contracts_freelancer_id_fkey (
              email,
              first_name,
              last_name
            )
          )
        `)
        .eq('status', 'paid')
        .gte('paid_at', yesterday.toISOString())
        .lte('paid_at', today.toISOString());

      if (error) {
        console.error('[ProjectMonitoring] Error fetching paid invoices:', error);
        return;
      }

      for (const invoice of invoices || []) {
        const alreadySent = await this.hasNotificationBeenSent(
          invoice.contract_id, 
          'invoice_paid', 
          yesterday,
          invoice.id
        );

        if (!alreadySent) {
          const contract = invoice.contracts;
          const notificationData: NotificationData = {
            contractId: invoice.contract_id,
            projectTitle: contract?.title || invoice.title,
            freelancerId: invoice.freelancer_id,
            freelancerName: `${contract?.users?.first_name || ''} ${contract?.users?.last_name || ''}`.trim(),
            freelancerEmail: contract?.users?.email,
            clientName: invoice.client_name,
            clientEmail: invoice.client_email,
            amount: invoice.amount,
            currency: invoice.currency || 'USD',
            invoiceId: invoice.id
          };

          await projectNotificationService.sendInvoicePayment(notificationData);
        }
      }

      console.log(`[ProjectMonitoring] Monitored invoice payments: ${invoices?.length || 0} invoices processed`);
    } catch (error) {
      console.error('[ProjectMonitoring] Error monitoring invoice payments:', error);
    }
  }

  /**
   * Check if a notification has already been sent
   */
  private async hasNotificationBeenSent(
    contractId: string, 
    notificationType: string, 
    since: Date,
    relatedId?: string
  ): Promise<boolean> {
    try {
      let query = supabase
        .from('project_notifications')
        .select('id')
        .eq('contract_id', contractId)
        .eq('notification_type', notificationType)
        .gte('created_at', since.toISOString());

      // For milestone and invoice notifications, we can be more specific
      if (relatedId && (notificationType === 'milestone_completed' || notificationType === 'invoice_paid')) {
        query = query.ilike('message', `%${relatedId}%`);
      }

      const { data, error } = await query.limit(1);

      if (error) {
        console.error('[ProjectMonitoring] Error checking notification history:', error);
        return false; // If we can't check, send the notification to be safe
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error('[ProjectMonitoring] Error in hasNotificationBeenSent:', error);
      return false;
    }
  }

  /**
   * Run all monitoring checks
   */
  async runAllChecks(): Promise<void> {
    console.log('[ProjectMonitoring] Starting monitoring checks...');
    
    try {
      await Promise.all([
        this.checkApproachingDeadlines(),
        this.checkOverdueProjects(),
        this.monitorMilestoneCompletions(),
        this.monitorInvoicePayments()
      ]);
      
      console.log('[ProjectMonitoring] All monitoring checks completed successfully');
    } catch (error) {
      console.error('[ProjectMonitoring] Error running monitoring checks:', error);
    }
  }
}

// Export singleton instance
export const projectMonitoringService = new ProjectMonitoringService();