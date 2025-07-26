// src/app/api/telegram/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return NextResponse.json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN not found in environment variables'
      });
    }

    // Test bot connection
    const botInfoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, {
      timeout: 10000,
    });

    // Get webhook info
    const webhookInfoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
      timeout: 10000,
    });

    return NextResponse.json({
      success: true,
      botInfo: botInfoResponse.data,
      webhookInfo: webhookInfoResponse.data,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error testing Telegram bot:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, webhookUrl } = await request.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return NextResponse.json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN not found in environment variables'
      });
    }

    if (action === 'setWebhook' && webhookUrl) {
      // Set webhook
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message'],
        drop_pending_updates: true,
      }, {
        timeout: 10000,
      });

      return NextResponse.json({
        success: true,
        action: 'setWebhook',
        result: response.data,
        webhookUrl: webhookUrl,
      });
    }

    if (action === 'deleteWebhook') {
      // Delete webhook
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
        drop_pending_updates: true,
      }, {
        timeout: 10000,
      });

      return NextResponse.json({
        success: true,
        action: 'deleteWebhook',
        result: response.data,
      });
    }

    if (action === 'sendTestMessage') {
      const { chatId, message } = await request.json();
      
      if (!chatId || !message) {
        return NextResponse.json({
          success: false,
          error: 'chatId and message are required for sendTestMessage'
        });
      }

      const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }, {
        timeout: 10000,
      });

      return NextResponse.json({
        success: true,
        action: 'sendTestMessage',
        result: response.data,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action. Supported actions: setWebhook, deleteWebhook, sendTestMessage'
    });

  } catch (error) {
    console.error('Error in Telegram test endpoint:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: axios.isAxiosError(error) ? {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      } : undefined,
    });
  }
}