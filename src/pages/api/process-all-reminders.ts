import type { NextApiRequest, NextApiResponse } from 'next';
import { SmartNudgeService } from '@/lib/smartNudgeService';
import { InvoiceReminderService } from '@/lib/invoiceReminderService';
import { PaymentLinkReminderService } from '@/lib/paymentLinkReminderService';
import { loadServerEnvironment } from '@/lib/serverEnv';

loadServerEnvironment();

interface AllRemindersResponse {
  success: boolean;
  nudges?: {
    sent: number;
    failed: number;
  };
  invoiceDueDateReminders?: {
    sent: number;
    failed: number;
  };
  paymentLinkDueDateReminders?: {
    sent: number;
    failed: number;
  };
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AllRemindersResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    // Verify the request is from a cron job or authorized source
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }

    console.log('🔔 Starting comprehensive reminder processing...');
    
    // Process smart nudges (existing system)
    console.log('📱 Processing smart nudges...');
    const nudgeResult = await SmartNudgeService.processNudges();
    console.log(`✅ Smart nudges completed: ${nudgeResult.sent} sent, ${nudgeResult.failed} failed`);
    
    // Process invoice due date reminders
    console.log('📅 Processing invoice due date reminders...');
    const invoiceDueDateResult = await InvoiceReminderService.processDueDateReminders();
    console.log(`✅ Invoice due date reminders completed: ${invoiceDueDateResult.sent} sent, ${invoiceDueDateResult.failed} failed`);
    
    // Process payment link due date reminders
    console.log('🔗 Processing payment link due date reminders...');
    const paymentLinkDueDateResult = await PaymentLinkReminderService.processDueDateReminders();
    console.log(`✅ Payment link due date reminders completed: ${paymentLinkDueDateResult.sent} sent, ${paymentLinkDueDateResult.failed} failed`);
    
    const totalSent = nudgeResult.sent + invoiceDueDateResult.sent + paymentLinkDueDateResult.sent;
    const totalFailed = nudgeResult.failed + invoiceDueDateResult.failed + paymentLinkDueDateResult.failed;
    
    console.log(`🎯 All reminders completed: ${totalSent} total sent, ${totalFailed} total failed`);
    
    return res.status(200).json({
      success: true,
      nudges: {
        sent: nudgeResult.sent,
        failed: nudgeResult.failed
      },
      invoiceDueDateReminders: {
        sent: invoiceDueDateResult.sent,
        failed: invoiceDueDateResult.failed
      },
      paymentLinkDueDateReminders: {
        sent: paymentLinkDueDateResult.sent,
        failed: paymentLinkDueDateResult.failed
      },
      message: `Successfully processed all reminders: ${totalSent} sent, ${totalFailed} failed`
    });
    
  } catch (error) {
    console.error('❌ Error processing reminders:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}