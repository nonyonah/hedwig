import { NextApiRequest, NextApiResponse } from 'next';
import { nudgeScheduler } from '../../lib/nudgeScheduler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      // Get scheduler status
      const status = nudgeScheduler.getStatus();
      
      return res.status(200).json({
        success: true,
        scheduler: status,
        message: status.isRunning ? 'Scheduler is running' : 'Scheduler is stopped'
      });
      
    } else if (req.method === 'POST') {
      const { action, intervalHours } = req.body;
      
      if (action === 'start') {
        nudgeScheduler.start(intervalHours || 6);
        return res.status(200).json({
          success: true,
          message: `Scheduler started with ${intervalHours || 6} hour interval`
        });
        
      } else if (action === 'stop') {
        nudgeScheduler.stop();
        return res.status(200).json({
          success: true,
          message: 'Scheduler stopped'
        });
        
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use "start" or "stop"'
        });
      }
      
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
  } catch (error: any) {
    console.error('Nudge scheduler API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}