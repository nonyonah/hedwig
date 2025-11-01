import { NextApiRequest, NextApiResponse } from 'next';
import { dueDateNotificationService } from '../../../services/dueDateNotificationService';

interface CronResponse {
  success: boolean;
  message?: string;
  data?: {
    overdueInvoices: number;
    overdueMilestones: number;
    notificationsSent: number;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  // Verify cron authorization (optional security measure)
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }

  try {
    console.log('[CronJob] Starting due date notification check...');
    
    // Check for overdue invoices
    const overdueInvoicesResult = await dueDateNotificationService.checkOverdueInvoices();
    
    // Check for overdue milestones
    const overdueMilestonesResult = await dueDateNotificationService.checkOverdueMilestones();
    
    const totalNotifications = overdueInvoicesResult.notificationsSent + overdueMilestonesResult.notificationsSent;
    
    console.log('[CronJob] Due date notification check completed:', {
      overdueInvoices: overdueInvoicesResult.overdueCount,
      overdueMilestones: overdueMilestonesResult.overdueCount,
      totalNotificationsSent: totalNotifications
    });

    return res.status(200).json({
      success: true,
      message: `Due date notification check completed. Sent ${totalNotifications} notifications.`,
      data: {
        overdueInvoices: overdueInvoicesResult.overdueCount,
        overdueMilestones: overdueMilestonesResult.overdueCount,
        notificationsSent: totalNotifications
      }
    });

  } catch (error) {
    console.error('[CronJob] Error in due date notification check:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

/**
 * Manual trigger for testing
 * Usage: POST /api/cron/due-date-notifications?test=true
 */
export async function testDueDateNotifications() {
  try {
    const overdueInvoicesResult = await dueDateNotificationService.checkOverdueInvoices();
    const overdueMilestonesResult = await dueDateNotificationService.checkOverdueMilestones();
    
    return {
      success: true,
      overdueInvoices: overdueInvoicesResult.overdueCount,
      overdueMilestones: overdueMilestonesResult.overdueCount,
      notificationsSent: overdueInvoicesResult.notificationsSent + overdueMilestonesResult.notificationsSent
    };
  } catch (error) {
    console.error('Error in test due date notifications:', error);
    throw error;
  }
}