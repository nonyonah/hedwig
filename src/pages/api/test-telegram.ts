import { NextApiRequest, NextApiResponse } from 'next';
const TelegramBot = require('node-telegram-bot-api');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { chatId, message } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({ error: 'chatId and message are required' });
    }

    // Check if bot token is configured
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    }

    console.log('🤖 Testing Telegram bot with token:', botToken.substring(0, 10) + '...');

    // Create bot instance
    const bot = new TelegramBot(botToken, { polling: false });

    // Test bot info
    const botInfo = await bot.getMe();
    console.log('🤖 Bot info:', botInfo);

    // Send test message
    const response = await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML'
    });

    console.log('✅ Test message sent successfully:', response);

    return res.status(200).json({
      success: true,
      botInfo,
      messageResponse: response
    });

  } catch (error: any) {
    console.error('❌ Telegram test failed:', error);
    return res.status(500).json({
      error: 'Telegram test failed',
      message: error.message,
      code: error.code,
      response: error.response?.body
    });
  }
}