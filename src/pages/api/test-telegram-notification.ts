import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TestResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

async function sendTelegramNotification(telegramChatId: string, message: string) {
  try {
    console.log('Sending Telegram notification to chat ID:', telegramChatId);
    
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText} - ${JSON.stringify(responseData)}`);
    }

    console.log('Telegram notification sent successfully:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const { action, freelancerId, telegramChatId, testMessage } = req.body;

  try {
    switch (action) {
      case 'check_freelancer_telegram':
        if (!freelancerId) {
          return res.status(400).json({
            success: false,
            error: 'Freelancer ID is required'
          });
        }

        // Check freelancer's Telegram info
        const { data: freelancer, error: freelancerError } = await supabase
          .from('users')
          .select('id, email, username, telegram_chat_id')
          .eq('id', freelancerId)
          .single();

        if (freelancerError) {
          return res.status(404).json({
            success: false,
            error: `Freelancer not found: ${freelancerError.message}`
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Freelancer data retrieved',
          data: {
            freelancer,
            hasTelegramChatId: !!freelancer.telegram_chat_id,
            telegramChatId: freelancer.telegram_chat_id
          }
        });

      case 'test_telegram_send':
        const chatId = telegramChatId || req.body.chatId;
        const message = testMessage || `🧪 *Test Notification*

This is a test message from Hedwig to verify Telegram notifications are working.

✅ If you receive this message, Telegram notifications are configured correctly!

Time: ${new Date().toLocaleString()}`;

        if (!chatId) {
          return res.status(400).json({
            success: false,
            error: 'Telegram chat ID is required'
          });
        }

        const telegramResult = await sendTelegramNotification(chatId, message);

        return res.status(200).json({
          success: true,
          message: 'Test Telegram notification sent successfully',
          data: telegramResult
        });

      case 'check_bot_token':
        // Test if bot token is valid
        if (!process.env.TELEGRAM_BOT_TOKEN) {
          return res.status(400).json({
            success: false,
            error: 'TELEGRAM_BOT_TOKEN environment variable is not set'
          });
        }

        const botResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
        const botData = await botResponse.json();

        if (!botResponse.ok) {
          return res.status(400).json({
            success: false,
            error: `Invalid bot token: ${botData.description || 'Unknown error'}`
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Bot token is valid',
          data: {
            bot: botData.result,
            tokenConfigured: true
          }
        });

      case 'list_users_with_telegram':
        // List users who have Telegram chat IDs
        const { data: users } = await supabase
          .from('users')
          .select('id, email, username, telegram_chat_id')
          .not('telegram_chat_id', 'is', null)
          .limit(10);

        return res.status(200).json({
          success: true,
          message: 'Users with Telegram found',
          data: users || []
        });

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Available actions: check_freelancer_telegram, test_telegram_send, check_bot_token, list_users_with_telegram'
        });
    }
  } catch (error) {
    console.error('Error in test Telegram notification:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}