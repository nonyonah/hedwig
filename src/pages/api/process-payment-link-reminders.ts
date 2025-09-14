import type { NextApiRequest, NextApiResponse } from 'next';
import { PaymentLinkReminderService } from '@/lib/paymentLinkReminderService';
import { loadServerEnvironment } from '@/lib/serverEnv';

interface PaymentLinkReminderResponse {
  success: boolean;
  sent?: number;
  failed?: number;
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PaymentLinkReminderResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    // Load environment variables
    await loadServerEnvironment();

    console.log('🔗 Starting payment link due date reminder processing...');
    
    // Process payment link due date reminders
    const result = await PaymentLinkReminderService.processDueDateReminders();
    
    console.log(`✅ Payment link reminder processing completed: ${result.sent} sent, ${result.failed} failed`);
    
    return res.status(200).json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message: `Payment link reminders processed: ${result.sent} sent, ${result.failed} failed`
    });
    
  } catch (error) {
    console.error('❌ Error processing payment link reminders:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}