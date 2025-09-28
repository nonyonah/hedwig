import { NextApiRequest, NextApiResponse } from 'next';
import { TelegramBot } from '@/lib/telegramBot';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, webhookUrl } = req.body;

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ 
        error: 'Telegram bot token not configured' 
      });
    }

    const bot = new TelegramBot({ 
      token: process.env.TELEGRAM_BOT_TOKEN,
      polling: false 
    });

    switch (action) {
      case 'setWebhook':
        if (!webhookUrl) {
          return res.status(400).json({ 
            error: 'Webhook URL is required' 
          });
        }

        // Validate webhook URL
        try {
          new URL(webhookUrl);
        } catch (error) {
          return res.status(400).json({ 
            error: 'Invalid webhook URL format' 
          });
        }

        // Set the webhook
        const success = await bot.setWebhook(webhookUrl);
        
        if (success) {
          console.log(`Webhook set successfully: ${webhookUrl}`);
          return res.status(200).json({ 
            success: true, 
            message: 'Webhook configured successfully',
            webhookUrl 
          });
        } else {
          return res.status(500).json({ 
            error: 'Failed to set webhook' 
          });
        }

      case 'getBotInfo':
        const botInfo = await bot.getMe();
        return res.status(200).json({ 
          success: true, 
          botInfo 
        });

      case 'getWebhookInfo':
        const webhookInfo = await bot.getWebhookInfo();
        return res.status(200).json({ 
          success: true, 
          webhookInfo 
        });

      default:
        return res.status(400).json({ 
          error: 'Invalid action' 
        });
    }

  } catch (error: any) {
    console.error('Telegram setup error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}