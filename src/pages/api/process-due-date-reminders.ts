import type { NextApiRequest, NextApiResponse } from 'next';
import { InvoiceReminderService } from '@/lib/invoiceReminderService';
import { loadServerEnvironment } from '@/lib/serverEnv';

loadServerEnvironment();

interface DueDateReminderResponse {
  success: boolean;
  sent?: number;
  failed?: number;
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DueDateReminderResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized' 
      });
    }

    console.log('🔔 Starting automated due date reminder processing...');
    
    const result = await InvoiceReminderService.processDueDateReminders();
    
    console.log(`✅ Due date reminder processing completed: ${result.sent} sent, ${result.failed} failed`);
    
    return res.status(200).json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message: `Processed due date reminders: ${result.sent} sent, ${result.failed} failed`
    });

  } catch (error) {
    console.error('❌ Error processing due date reminders:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}