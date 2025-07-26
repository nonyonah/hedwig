import { NextRequest, NextResponse } from 'next/server';
import TelegramBot from 'node-telegram-bot-api';

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!botToken) {
      return NextResponse.json({ 
        error: 'TELEGRAM_BOT_TOKEN is not configured' 
      }, { status: 400 });
    }

    if (!baseUrl) {
      return NextResponse.json({ 
        error: 'NEXT_PUBLIC_APP_URL is not configured' 
      }, { status: 400 });
    }

    // Create bot instance for setup operations
    const bot = new TelegramBot(botToken, { polling: false });
    const webhookUrl = `${baseUrl}/api/webhook`;

    switch (action) {
      case 'set':
        try {
          console.log('[Setup] Setting webhook to:', webhookUrl);
          
          // First delete any existing webhook
          await bot.deleteWebHook();
          console.log('[Setup] Deleted existing webhook');
          
          // Wait a moment before setting new webhook
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Set the new webhook with proper configuration
          const result = await bot.setWebHook(webhookUrl, {
            max_connections: 40,
            allowed_updates: ['message', 'callback_query', 'inline_query']
          });
          
          if (result) {
            console.log('[Setup] Webhook set successfully');
            
            // Verify the webhook was set correctly
            const webhookInfo = await bot.getWebHookInfo();
            
            return NextResponse.json({
              success: true,
              message: 'Webhook set successfully',
              webhookUrl,
              webhookInfo
            });
          } else {
            throw new Error('Failed to set webhook');
          }
        } catch (error) {
          console.error('[Setup] Error setting webhook:', error);
          return NextResponse.json({ 
            error: 'Failed to set webhook',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }

      case 'delete':
        try {
          console.log('[Setup] Deleting webhook');
          const result = await bot.deleteWebHook();
          
          if (result) {
            console.log('[Setup] Webhook deleted successfully');
            return NextResponse.json({
              success: true,
              message: 'Webhook deleted successfully'
            });
          } else {
            throw new Error('Failed to delete webhook');
          }
        } catch (error) {
          console.error('[Setup] Error deleting webhook:', error);
          return NextResponse.json({ 
            error: 'Failed to delete webhook',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }

      case 'info':
        try {
          console.log('[Setup] Getting webhook info');
          const webhookInfo = await bot.getWebHookInfo();
          const botInfo = await bot.getMe();
          
          return NextResponse.json({
            success: true,
            botInfo,
            webhookInfo,
            expectedWebhookUrl: webhookUrl,
            webhookConfigured: webhookInfo.url === webhookUrl
          });
        } catch (error) {
          console.error('[Setup] Error getting webhook info:', error);
          return NextResponse.json({ 
            error: 'Failed to get webhook info',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }

      default:
        return NextResponse.json({ 
          error: 'Invalid action. Use "set", "delete", or "info"' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[Setup] Error in POST handler:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!botToken) {
      return NextResponse.json({ 
        error: 'TELEGRAM_BOT_TOKEN is not configured' 
      }, { status: 400 });
    }

    if (!baseUrl) {
      return NextResponse.json({ 
        error: 'NEXT_PUBLIC_APP_URL is not configured' 
      }, { status: 400 });
    }

    // Create bot instance to check status
    const bot = new TelegramBot(botToken, { polling: false });
    const expectedWebhookUrl = `${baseUrl}/api/webhook`;

    try {
      const [botInfo, webhookInfo] = await Promise.all([
        bot.getMe(),
        bot.getWebHookInfo()
      ]);

      const isWebhookSet = webhookInfo.url === expectedWebhookUrl;
      
      return NextResponse.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
          can_join_groups: (botInfo as any).can_join_groups,
          can_read_all_group_messages: (botInfo as any).can_read_all_group_messages,
          supports_inline_queries: (botInfo as any).supports_inline_queries
        },
        webhook: {
          configured: isWebhookSet,
          expectedUrl: expectedWebhookUrl,
          currentUrl: webhookInfo.url || null,
          pendingUpdateCount: webhookInfo.pending_update_count,
          lastErrorDate: webhookInfo.last_error_date,
          lastErrorMessage: webhookInfo.last_error_message,
          maxConnections: webhookInfo.max_connections,
          allowedUpdates: webhookInfo.allowed_updates
        },
        environment: {
          botTokenConfigured: true,
          baseUrlConfigured: true,
          baseUrl
        }
      });
    } catch (error) {
      console.error('[Setup] Error getting bot/webhook info:', error);
      return NextResponse.json({ 
        error: 'Failed to get bot information',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[Setup] Error in GET handler:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}