import { NextApiRequest, NextApiResponse } from 'next';
import { parseIntentAndParams } from '../../lib/intentParser';
import { handleAction } from '../../api/actions';

/**
 * Debug endpoint to test calendar integration
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, userId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'message and userId are required' 
      });
    }

    // Test intent parsing
    const { intent, params } = parseIntentAndParams(message);
    
    // Test action handling
    let actionResult: any = null;
    if (intent !== 'unknown') {
      actionResult = await handleAction(intent, params, userId);
    }

    res.status(200).json({
      success: true,
      input: { message, userId },
      parsing: { intent, params },
      actionResult,
      calendarIntents: ['connect_calendar', 'disconnect_calendar', 'calendar_status']
    });

  } catch (error) {
    console.error('Error in calendar debug:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}