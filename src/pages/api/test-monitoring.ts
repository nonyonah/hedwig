import { NextApiRequest, NextApiResponse } from 'next';
import { projectMonitoringService } from '../../services/projectMonitoringService';
import { projectNotificationService } from '../../services/projectNotificationService';

interface TestResponse {
  success: boolean;
  message?: string;
  results?: any;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  const { action, testData } = req.body;

  try {
    switch (action) {
      case 'check_deadlines':
        await projectMonitoringService.checkApproachingDeadlines();
        return res.status(200).json({
          success: true,
          message: 'Deadline check completed'
        });

      case 'check_overdue':
        await projectMonitoringService.checkOverdueProjects();
        return res.status(200).json({
          success: true,
          message: 'Overdue check completed'
        });

      case 'check_milestones':
        await projectMonitoringService.monitorMilestoneCompletions();
        return res.status(200).json({
          success: true,
          message: 'Milestone monitoring completed'
        });

      case 'check_payments':
        await projectMonitoringService.monitorInvoicePayments();
        return res.status(200).json({
          success: true,
          message: 'Payment monitoring completed'
        });

      case 'run_all':
        await projectMonitoringService.runAllChecks();
        return res.status(200).json({
          success: true,
          message: 'All monitoring checks completed'
        });

      case 'test_deadline_notification':
        if (!testData) {
          return res.status(400).json({
            success: false,
            error: 'Test data is required for deadline notification test'
          });
        }
        
        await projectNotificationService.sendDeadlineReminder(testData, 'approaching');
        return res.status(200).json({
          success: true,
          message: 'Test deadline notification sent'
        });

      case 'test_milestone_notification':
        if (!testData) {
          return res.status(400).json({
            success: false,
            error: 'Test data is required for milestone notification test'
          });
        }
        
        await projectNotificationService.sendMilestoneAchievement(testData);
        return res.status(200).json({
          success: true,
          message: 'Test milestone notification sent'
        });

      case 'test_payment_notification':
        if (!testData) {
          return res.status(400).json({
            success: false,
            error: 'Test data is required for payment notification test'
          });
        }
        
        await projectNotificationService.sendInvoicePayment(testData);
        return res.status(200).json({
          success: true,
          message: 'Test payment notification sent'
        });

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Available actions: check_deadlines, check_overdue, check_milestones, check_payments, run_all, test_deadline_notification, test_milestone_notification, test_payment_notification'
        });
    }
  } catch (error) {
    console.error('Error in test monitoring:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Example test data for manual testing
export const exampleTestData = {
  deadline: {
    contractId: 'test-contract-id',
    projectTitle: 'Test Project',
    freelancerId: 'test-freelancer-id',
    freelancerName: 'John Doe',
    freelancerEmail: 'freelancer@example.com',
    clientName: 'Jane Client',
    clientEmail: 'client@example.com',
    amount: 1000,
    currency: 'USDC',
    deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
  },
  milestone: {
    contractId: 'test-contract-id',
    projectTitle: 'Test Project',
    freelancerId: 'test-freelancer-id',
    freelancerName: 'John Doe',
    freelancerEmail: 'freelancer@example.com',
    clientName: 'Jane Client',
    clientEmail: 'client@example.com',
    amount: 500,
    currency: 'USDC',
    milestoneTitle: 'First Milestone'
  },
  payment: {
    contractId: 'test-contract-id',
    projectTitle: 'Test Project',
    freelancerId: 'test-freelancer-id',
    freelancerName: 'John Doe',
    freelancerEmail: 'freelancer@example.com',
    clientName: 'Jane Client',
    clientEmail: 'client@example.com',
    amount: 500,
    currency: 'USDC',
    invoiceId: 'test-invoice-id'
  }
};