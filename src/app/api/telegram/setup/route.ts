import { NextRequest, NextResponse } from 'next/server';
import { createTelegramBot } from '@/lib/telegramBot';

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    // Get the webhook URL from environment variables
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: 'Base URL not configured. Set NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_BASE_URL' }, { status: 500 });
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    const bot = createTelegramBot({ token: botToken, polling: false });

    if (action === 'setWebhook') {
      console.log(`Setting webhook to: ${webhookUrl}`);
      const result = await bot.setWebhook(webhookUrl, {
        allowed_updates: ['message', 'callback_query', 'inline_query']
      });
      
      if (result) {
        console.log('Webhook set successfully');
        return NextResponse.json({ 
          success: true, 
          message: 'Webhook set successfully',
          webhookUrl 
        });
      } else {
        return NextResponse.json({ error: 'Failed to set webhook' }, { status: 500 });
      }
    } else if (action === 'deleteWebhook') {
      const result = await bot.deleteWebhook();
      
      if (result) {
        console.log('Webhook deleted successfully');
        return NextResponse.json({ 
          success: true, 
          message: 'Webhook deleted successfully' 
        });
      } else {
        return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
      }
    } else if (action === 'getWebhookInfo') {
      const webhookInfo = await bot.getWebhookInfo();
      return NextResponse.json({ webhookInfo });
    } else if (action === 'getBotInfo') {
      const botInfo = await bot.getMe();
      return NextResponse.json({ botInfo });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!botToken) {
      return NextResponse.json({ 
        configured: false, 
        error: 'TELEGRAM_BOT_TOKEN not set' 
      });
    }

    if (!baseUrl) {
      return NextResponse.json({ 
        configured: false, 
        error: 'Base URL not configured. Set NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_BASE_URL' 
      });
    }

    const bot = createTelegramBot({ token: botToken, polling: false });
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;
    
    try {
      const [botInfo, webhookInfo] = await Promise.all([
        bot.getMe(),
        bot.getWebhookInfo()
      ]);

      return NextResponse.json({
        configured: true,
        botInfo,
        webhookInfo,
        expectedWebhookUrl: webhookUrl,
        webhookSet: webhookInfo.url === webhookUrl
      });
    } catch (apiError) {
      console.error('Error fetching bot/webhook info:', apiError);
      return NextResponse.json({
        configured: false,
        error: 'Failed to connect to Telegram API'
      });
    }
  } catch (error) {
    console.error('Setup GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}