import { NextApiRequest, NextApiResponse } from 'next';
import { contractReminderService } from '../../../services/contractReminderService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the request is from a cron job or authorized source
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.CRON_SECRET || process.env.HEDWIG_API_KEY;
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting contract reminder cron job...');
    
    // Send milestone reminders
    await contractReminderService.sendMilestoneReminders();
    console.log('Milestone reminders sent');
    
    // Send deadline reminders
    await contractReminderService.sendDeadlineReminders();
    console.log('Deadline reminders sent');
    
    res.status(200).json({ 
      success: true, 
      message: 'Contract reminders sent successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Contract reminder cron job failed:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}

// Export config for Vercel cron jobs
export const config = {
  maxDuration: 300, // 5 minutes
};