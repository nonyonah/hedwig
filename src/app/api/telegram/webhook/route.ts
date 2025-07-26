// src/app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import TelegramBot from 'node-telegram-bot-api';

// Global bot instance for webhook mode
let bot: TelegramBot | null = null;

// Initialize bot for webhook mode
function initializeBot() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }

  if (!bot) {
    // Create bot instance without polling for webhook mode
    bot = new TelegramBot(botToken, { polling: false });
    
    // Setup event handlers
    setupBotHandlers();
    console.log('[Webhook] Bot initialized for webhook mode');
  }
  
  return bot;
}

// Setup bot event handlers
function setupBotHandlers() {
  if (!bot) return;

  // Handle all text messages
  bot.on('message', async (msg) => {
    try {
      console.log('[Webhook] Received message:', {
        chatId: msg.chat.id,
        text: msg.text,
        from: msg.from?.username || msg.from?.first_name
      });

      const chatId = msg.chat.id;
      
      // Ensure user exists in database
      if (msg.from) {
        await ensureUserExists(msg.from, chatId);
      }

      // Send typing indicator
      await bot?.sendChatAction(chatId, 'typing');

      // Handle commands
      if (msg.text?.startsWith('/')) {
        await handleCommand(msg);
      } else if (msg.text) {
        // Process with AI
        const response = await processWithAI(msg.text, chatId);
        await bot?.sendMessage(chatId, response);
      } else {
        await bot?.sendMessage(chatId, 'Please send a text message or use a command like /start');
      }
    } catch (error) {
      console.error('[Webhook] Error handling message:', error);
      await bot?.sendMessage(msg.chat.id, 'Sorry, I encountered an error. Please try again.');
    }
  });

  // Handle callback queries
  bot.on('callback_query', async (callbackQuery) => {
    try {
      console.log('[Webhook] Received callback query:', callbackQuery.data);
      await bot?.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('[Webhook] Error handling callback query:', error);
    }
  });

  // Handle errors
  bot.on('error', (error) => {
    console.error('[Webhook] Bot error:', error);
  });
}

// Handle bot commands
async function handleCommand(msg: TelegramBot.Message) {
  if (!bot || !msg.text) return;

  const chatId = msg.chat.id;
  const command = msg.text.split(' ')[0].toLowerCase();

  switch (command) {
    case '/start':
      await bot.sendMessage(chatId, 
        `🤖 Welcome to Hedwig Bot!\n\n` +
        `I'm your AI assistant for crypto payments and wallet management.\n\n` +
        `Available commands:\n` +
        `/help - Show this help message\n` +
        `/wallet - Check your wallet status\n` +
        `/balance - Check your balance\n\n` +
        `You can also just chat with me naturally!`,
        {
          reply_markup: {
            keyboard: [[{ text: '/help' }, { text: '/wallet' }], [{ text: '/balance' }]],
            resize_keyboard: true
          }
        }
      );
      break;

    case '/help':
      await bot.sendMessage(chatId,
        `🆘 *Hedwig Bot Help*\n\n` +
        `*Commands:*\n` +
        `/start - Welcome message\n` +
        `/help - Show this help\n` +
        `/wallet - Wallet information\n` +
        `/balance - Check balance\n\n` +
        `*Natural Language:*\n` +
        `You can also chat with me naturally! Try:\n` +
        `• "Send 10 USDC to alice@example.com"\n` +
        `• "What's my balance?"\n` +
        `• "Create an invoice for $100"\n` +
        `• "Show my transaction history"`,
        { parse_mode: 'Markdown' }
      );
      break;

    case '/wallet':
      await bot.sendMessage(chatId, 'Checking your wallet status...');
      // Add wallet status logic here
      break;

    case '/balance':
      await bot.sendMessage(chatId, 'Checking your balance...');
      // Add balance check logic here
      break;

    default:
      await bot.sendMessage(chatId, 
        `Unknown command: ${command}\n\nUse /help to see available commands.`
      );
  }
}

// Process message with AI
async function processWithAI(message: string, chatId: number): Promise<string> {
  try {
    const { runLLM } = await import('@/lib/llmAgent');
    const userId = `telegram_${chatId}`;
    
    const llmResponse = await runLLM({
      userId,
      message
    });
    
    return llmResponse || "I'm sorry, I couldn't process your request at the moment.";
  } catch (error) {
    console.error('[Webhook] Error processing with AI:', error);
    return "I'm experiencing some technical difficulties. Please try again later.";
  }
}

// Ensure user exists in database
async function ensureUserExists(from: TelegramBot.User, chatId: number): Promise<void> {
  try {
    const { supabase } = await import('@/lib/supabase');
    
    const { error } = await supabase.rpc('get_or_create_telegram_user', {
      p_telegram_chat_id: chatId,
      p_telegram_username: from?.username || null,
      p_telegram_first_name: from?.first_name || null,
      p_telegram_last_name: from?.last_name || null,
      p_telegram_language_code: from?.language_code || null,
    });

    if (error) {
      console.error('[Webhook] Error ensuring user exists:', error);
    }
  } catch (error) {
    console.error('[Webhook] Error in ensureUserExists:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramBot.Update = await request.json();
    console.log('[Webhook] Received update:', {
      updateId: update.update_id,
      type: update.message ? 'message' : update.callback_query ? 'callback_query' : 'other'
    });
    
    // Initialize bot if not already done
    const botInstance = initializeBot();
    
    // Process the webhook update using the bot's built-in method
    botInstance.processUpdate(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Error processing update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
    
    if (!botToken) {
      return NextResponse.json({ 
        status: 'error',
        error: 'TELEGRAM_BOT_TOKEN not configured'
      });
    }

    if (!webhookUrl) {
      return NextResponse.json({ 
        status: 'error',
        error: 'Webhook URL not configured (NEXT_PUBLIC_APP_URL missing)'
      });
    }

    // Initialize bot to check status
    const botInstance = initializeBot();
    const webhookInfo = await botInstance.getWebHookInfo();
    const expectedUrl = `${webhookUrl}/api/telegram/webhook`;
    
    return NextResponse.json({ 
      status: 'active',
      timestamp: new Date().toISOString(),
      botConfigured: true,
      webhookUrl: expectedUrl,
      currentWebhook: webhookInfo.url,
      webhookSet: webhookInfo.url === expectedUrl,
      webhookInfo
    });
  } catch (error) {
    console.error('[Webhook] Error in GET handler:', error);
    return NextResponse.json({ 
      status: 'error',
      error: 'Failed to check webhook status'
    });
  }
}