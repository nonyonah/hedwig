import { NextApiRequest, NextApiResponse } from 'next';
import { googleCalendarService } from '../../../lib/googleCalendarService';

/**
 * Check Google Calendar connection status for a user
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    // Validate required parameters
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'userId is required as query parameter' 
      });
    }

    // Check if user has connected calendar
    const isConnected = await googleCalendarService.isConnected(userId);
    
    let connectionWorking = false;
    if (isConnected) {
      // Test if the connection is still working
      connectionWorking = await googleCalendarService.testConnection(userId);
    }

    res.status(200).json({
      success: true,
      userId,
      connected: isConnected,
      connectionWorking,
      message: isConnected 
        ? (connectionWorking ? 'Calendar connected and working' : 'Calendar connected but needs reconnection')
        : 'Calendar not connected'
    });

  } catch (error) {
    console.error('Error checking calendar status:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}