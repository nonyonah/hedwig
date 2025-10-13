import { NextApiRequest, NextApiResponse } from 'next';
import { googleCalendarService } from '../../../../lib/googleCalendarService';

/**
 * OAuth2 callback handler
 * Handles the callback from Google OAuth2 flow
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error } = req.query;

    // Handle OAuth2 error
    if (error) {
      console.error('OAuth2 error:', error);
      return res.status(400).json({ 
        error: 'OAuth2 authorization failed',
        details: error 
      });
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'Authorization code and state are required' 
      });
    }

    // Validate state parameter
    const userId = googleCalendarService.validateStateToken(state as string);
    if (!userId) {
      return res.status(400).json({ 
        error: 'Invalid or expired state token',
        details: 'The authorization request has expired or is invalid' 
      });
    }

    // Exchange authorization code for tokens
    const credentials = await googleCalendarService.exchangeCodeForTokens(code as string);
    if (!credentials) {
      return res.status(500).json({ 
        error: 'Failed to exchange authorization code',
        details: 'Could not obtain access tokens from Google' 
      });
    }

    // Store credentials for the user
    const success = await googleCalendarService.storeCredentials(userId, credentials);
    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to store credentials',
        details: 'Could not save Google Calendar credentials' 
      });
    }

    // Test the connection to ensure it works
    const connectionTest = await googleCalendarService.testConnection(userId);
    if (!connectionTest) {
      console.warn(`Calendar connection test failed for user ${userId}`);
      // Don't fail the request, just log the warning
    }

    console.log(`✅ Successfully connected Google Calendar for user ${userId}`);

    // Check if there's a post-calendar intent to execute
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Get user's chat ID for Telegram notification
      const { data: user } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', userId)
        .single();

      if (user?.telegram_chat_id) {
        // Import and execute post-calendar intent
        const TelegramBot = require('node-telegram-bot-api');
        const { BotIntegration } = await import('../../../../modules/bot-integration');
        
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
        const botIntegration = new BotIntegration(bot);
        
        await botIntegration.executePostCalendarIntent(userId, user.telegram_chat_id);
      }
    } catch (intentError) {
      console.error('Error executing post-calendar intent:', intentError);
      // Don't fail the OAuth callback for this
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Google Calendar connected successfully',
      userId,
      connected: true
    });

  } catch (error) {
    console.error('Error in OAuth2 callback:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}