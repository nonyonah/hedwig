import type { NextApiRequest, NextApiResponse } from 'next';
import { SmartNudgeService } from '@/lib/smartNudgeService';
import { loadServerEnvironment } from '@/lib/serverEnv';

loadServerEnvironment();

interface NudgeProcessResponse {
  success: boolean;
  sent?: number;
  failed?: number;
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NudgeProcessResponse>
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

    console.log('🔔 Starting automated nudge processing...');
    
    // Process all eligible nudges
    const result = await SmartNudgeService.processNudges();
    
    console.log(`✅ Nudge processing completed: ${result.sent} sent, ${result.failed} failed`);
    
    return res.status(200).json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message: `Processed nudges: ${result.sent} sent, ${result.failed} failed`
    });

  } catch (error) {
    console.error('❌ Error processing nudges:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}