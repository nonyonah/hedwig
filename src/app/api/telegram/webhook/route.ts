// src/app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import TelegramBot from 'node-telegram-bot-api';
import { createTelegramBot } from '@/lib/telegramBot';

export async function POST(request: NextRequest) {
  try {
    const update: TelegramBot.Update = await request.json();
    console.log('Received webhook update:', JSON.stringify(update, null, 2));
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN is not set');
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    // Create bot instance for webhook processing
    const bot = createTelegramBot({ token: botToken, polling: false });
    
    // Process the webhook update
    await bot.processWebhookUpdate(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  
  return NextResponse.json({ 
    status: 'active',
    timestamp: new Date().toISOString(),
    version: '2.0.0 (node-telegram-bot-api)',
    botConfigured: !!botToken,
    webhookUrl: webhookUrl ? `${webhookUrl}/api/telegram/webhook` : 'Not configured'
  });
}