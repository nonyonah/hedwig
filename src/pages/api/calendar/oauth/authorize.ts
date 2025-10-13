import { NextApiRequest, NextApiResponse } from 'next';
import { googleCalendarService } from '../../../../lib/googleCalendarService';

/**
 * Generate Google OAuth2 authorization URL
 * This endpoint creates a secure authorization URL with state parameter
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'userId is required' 
      });
    }

    // Check if user is already connected
    const isConnected = await googleCalendarService.isConnected(userId);
    if (isConnected) {
      return res.status(400).json({ 
        error: 'Calendar already connected',
        details: 'User already has Google Calendar connected' 
      });
    }

    // Generate authorization URL with state parameter
    const authUrl = googleCalendarService.generateAuthUrl(userId);

    console.log(`Generated OAuth2 URL for user ${userId}`);

    res.status(200).json({
      success: true,
      authUrl,
      message: 'Authorization URL generated successfully'
    });

  } catch (error) {
    console.error('Error generating authorization URL:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}