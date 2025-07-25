// src/lib/telegramBot.ts
import TelegramBot from 'node-telegram-bot-api';
import { runLLM } from './llmAgent';

export interface TelegramBotConfig {
  token: string;
  polling?: boolean;
  webhook?: {
    url: string;
    port?: number;
  };
}

export class TelegramBotService {
  private bot: TelegramBot;
  private isPolling: boolean = false;

  constructor(config: TelegramBotConfig) {
    // Initialize the bot with polling or webhook
    this.bot = new TelegramBot(config.token, { 
      polling: config.polling || false 
    });

    this.setupEventHandlers();
    
    if (config.webhook) {
      this.setupWebhook(config.webhook.url, config.webhook.port);
    }
  }

  /**
   * Setup event handlers for the bot
   */
  private setupEventHandlers(): void {
    // Handle all text messages
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        console.error('[TelegramBot] Error handling message:', error);
        await this.sendErrorMessage(msg.chat.id);
      }
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (callbackQuery) => {
      try {
        await this.handleCallbackQuery(callbackQuery);
      } catch (error) {
        console.error('[TelegramBot] Error handling callback query:', error);
      }
    });

    // Handle inline queries
    this.bot.on('inline_query', async (inlineQuery) => {
      try {
        await this.handleInlineQuery(inlineQuery);
      } catch (error) {
        console.error('[TelegramBot] Error handling inline query:', error);
      }
    });

    // Handle errors
    this.bot.on('error', (error) => {
      console.error('[TelegramBot] Bot error:', error);
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      console.error('[TelegramBot] Polling error:', error);
    });

    // Handle webhook errors
    this.bot.on('webhook_error', (error) => {
      console.error('[TelegramBot] Webhook error:', error);
    });
  }

  /**
   * Setup webhook for receiving updates
   */
  private async setupWebhook(url: string, port?: number): Promise<void> {
    try {
      await this.bot.setWebHook(url);
      console.log(`[TelegramBot] Webhook set to: ${url}`);
      
      if (port) {
        // Start webhook server if port is provided
        this.bot.startPolling = () => {
          throw new Error('Cannot start polling when webhook is set');
        };
      }
    } catch (error) {
      console.error('[TelegramBot] Error setting webhook:', error);
      throw error;
    }
  }

  /**
   * Start polling for updates
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) {
      console.log('[TelegramBot] Already polling');
      return;
    }

    try {
      await this.bot.startPolling();
      this.isPolling = true;
      console.log('[TelegramBot] Started polling for updates');
    } catch (error) {
      console.error('[TelegramBot] Error starting polling:', error);
      throw error;
    }
  }

  /**
   * Stop polling for updates
   */
  async stopPolling(): Promise<void> {
    if (!this.isPolling) {
      console.log('[TelegramBot] Not currently polling');
      return;
    }

    try {
      await this.bot.stopPolling();
      this.isPolling = false;
      console.log('[TelegramBot] Stopped polling');
    } catch (error) {
      console.error('[TelegramBot] Error stopping polling:', error);
      throw error;
    }
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(
    chatId: number | string, 
    text: string, 
    options?: TelegramBot.SendMessageOptions
  ): Promise<TelegramBot.Message> {
    try {
      const message = await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...options
      });
      
      // Log outgoing message
      await this.logMessage(Number(chatId), 'outgoing', text);
      
      return message;
    } catch (error) {
      console.error('[TelegramBot] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send a photo to a chat
   */
  async sendPhoto(
    chatId: number | string,
    photo: string | Buffer,
    options?: TelegramBot.SendPhotoOptions
  ): Promise<TelegramBot.Message> {
    try {
      return await this.bot.sendPhoto(chatId, photo, options);
    } catch (error) {
      console.error('[TelegramBot] Error sending photo:', error);
      throw error;
    }
  }

  /**
   * Send a document to a chat
   */
  async sendDocument(
    chatId: number | string,
    document: string | Buffer,
    options?: TelegramBot.SendDocumentOptions
  ): Promise<TelegramBot.Message> {
    try {
      return await this.bot.sendDocument(chatId, document, options);
    } catch (error) {
      console.error('[TelegramBot] Error sending document:', error);
      throw error;
    }
  }

  /**
   * Send chat action (typing, uploading_document, etc.)
   */
  async sendChatAction(
    chatId: number | string, 
    action: TelegramBot.ChatAction
  ): Promise<boolean> {
    try {
      return await this.bot.sendChatAction(chatId, action);
    } catch (error) {
      console.error('[TelegramBot] Error sending chat action:', error);
      return false;
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const messageText = msg.text || '';
    const userId = msg.from?.id;
    const username = msg.from?.username;
    
    console.log('[TelegramBot] Handling message:', {
      chatId,
      userId,
      username,
      messageText: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''),
      messageLength: messageText.length,
    });

    try {
      // Ensure user exists in database
      if (msg.from) {
        console.log('[TelegramBot] Ensuring user exists in database');
        await this.ensureUserExists(msg.from, chatId);
      }

      // Log incoming message
      console.log('[TelegramBot] Logging incoming message');
      await this.logMessage(chatId, 'incoming', messageText, userId);

      // Send typing indicator
      console.log('[TelegramBot] Sending typing indicator');
      await this.sendChatAction(chatId, 'typing');

      // Handle commands
      if (messageText.startsWith('/')) {
        console.log('[TelegramBot] Processing command:', messageText ? messageText.split(' ')[0] : 'unknown');
        await this.handleCommand(messageText, chatId, msg.from);
        return;
      }

      // Process with AI if not a command
      if (messageText.trim()) {
        console.log('[TelegramBot] Processing message with AI');
        const response = await this.processWithAI(messageText, chatId);
        
        console.log('[TelegramBot] AI response received, sending to user');
        await this.sendMessage(chatId, response);
      } else {
        console.log('[TelegramBot] Empty message, sending default response');
        await this.sendMessage(
          chatId, 
          'Please send me a message and I\'ll help you with your freelancing tasks!'
        );
      }
    } catch (error) {
      console.error('[TelegramBot] Error handling message:', error);
      await this.sendErrorMessage(chatId);
    }
  }

  /**
   * Handle callback queries from inline keyboards
   */
  private async handleCallbackQuery(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;
    
    if (!chatId) return;

    console.log('[TelegramBot] Handling callback query:', { chatId, data });

    try {
      // Answer the callback query to remove loading state
      await this.bot.answerCallbackQuery(callbackQuery.id);

      // Handle different callback data
      switch (data) {
        case 'help':
          await this.sendHelpMessage(chatId);
          break;
        case 'about':
          await this.sendAboutMessage(chatId);
          break;
        default:
          await this.sendMessage(chatId, `You clicked: ${data}`);
      }
    } catch (error) {
      console.error('[TelegramBot] Error handling callback query:', error);
    }
  }

  /**
   * Handle inline queries
   */
  private async handleInlineQuery(inlineQuery: TelegramBot.InlineQuery): Promise<void> {
    const query = inlineQuery.query;
    
    console.log('[TelegramBot] Handling inline query:', query);

    try {
      // Example inline results
      const results: TelegramBot.InlineQueryResult[] = [
        {
          type: 'article',
          id: '1',
          title: 'Create Invoice',
          description: 'Create a new invoice',
          input_message_content: {
            message_text: 'Create an invoice'
          }
        },
        {
          type: 'article',
          id: '2',
          title: 'Check Earnings',
          description: 'Check your earnings',
          input_message_content: {
            message_text: 'Show me my earnings'
          }
        }
      ];

      await this.bot.answerInlineQuery(inlineQuery.id, results);
    } catch (error) {
      console.error('[TelegramBot] Error handling inline query:', error);
    }
  }

  /**
   * Handle bot commands
   */
  private async handleCommand(
    command: string, 
    chatId: number, 
    from?: TelegramBot.User
  ): Promise<void> {
    const userName = from?.first_name || 'User';
    const commandName = command && typeof command === 'string' ? command.split(' ')[0].toLowerCase() : '';
    
    switch (commandName) {
      case '/start':
        await this.sendWelcomeMessage(chatId, userName);
        break;
      case '/help':
        await this.sendHelpMessage(chatId);
        break;
      case '/about':
        await this.sendAboutMessage(chatId);
        break;
      case '/menu':
        await this.sendMenuMessage(chatId);
        break;
      default:
        await this.sendMessage(
          chatId,
          `❓ Unknown command: ${commandName || 'invalid'}\n\nType /help to see available commands.`
        );
        break;
    }
  }

  /**
   * Send welcome message with inline keyboard
   */
  private async sendWelcomeMessage(chatId: number, userName: string): Promise<void> {
    const welcomeText = `👋 Hello ${userName}! Welcome to Hedwig AI Assistant!

I'm here to help you with:
• 📄 Creating invoices
• 💰 Payment tracking
• 📊 Earnings summaries
• 🔄 Token swaps
• 💬 General assistance

Just send me a message and I'll help you out!`;

    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '📋 Help', callback_data: 'help' },
          { text: 'ℹ️ About', callback_data: 'about' }
        ],
        [
          { text: '💰 Create Invoice', callback_data: 'create_invoice' },
          { text: '📊 Check Earnings', callback_data: 'check_earnings' }
        ]
      ]
    };

    await this.sendMessage(chatId, welcomeText, { reply_markup: keyboard });
  }

  /**
   * Send help message
   */
  private async sendHelpMessage(chatId: number): Promise<void> {
    const helpText = `🤖 *Hedwig AI Assistant Help*

*Available Commands:*
/start - Start the bot
/help - Show this help message
/about - About Hedwig
/menu - Show quick action menu

*What I can do:*
• Create professional invoices
• Track your payments and earnings
• Provide payment summaries
• Help with token swaps
• Answer questions about your business

*How to use:*
Just type your request in natural language, like:
- "Create an invoice for $500"
- "Show me my earnings this month"
- "Send a payment reminder"
- "I want to swap tokens"

Feel free to ask me anything! 💬`;

    await this.sendMessage(chatId, helpText);
  }

  /**
   * Send about message
   */
  private async sendAboutMessage(chatId: number): Promise<void> {
    const aboutText = `ℹ️ *About Hedwig*

Hedwig is an AI-powered assistant for freelancers and businesses, helping you manage:

🔹 Invoice creation and management
🔹 Payment tracking and reminders
🔹 Earnings analytics
🔹 Crypto payments and swaps
🔹 Business automation

Built with ❤️ for the modern digital economy.

Version: 2.0.0
Powered by: node-telegram-bot-api`;

    await this.sendMessage(chatId, aboutText);
  }

  /**
   * Send menu with quick actions
   */
  private async sendMenuMessage(chatId: number): Promise<void> {
    const menuText = `📋 *Quick Actions Menu*

Choose an action below:`;

    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '💰 Create Invoice', callback_data: 'create_invoice' },
          { text: '📊 Check Earnings', callback_data: 'check_earnings' }
        ],
        [
          { text: '🔄 Token Swap', callback_data: 'token_swap' },
          { text: '📈 Payment Status', callback_data: 'payment_status' }
        ],
        [
          { text: '📋 Help', callback_data: 'help' },
          { text: 'ℹ️ About', callback_data: 'about' }
        ]
      ]
    };

    await this.sendMessage(chatId, menuText, { reply_markup: keyboard });
  }

  /**
   * Send error message to user
   */
  private async sendErrorMessage(chatId: number): Promise<void> {
    try {
      await this.sendMessage(
        chatId,
        'Sorry, I encountered an error processing your message. Please try again.'
      );
    } catch (error) {
      console.error('[TelegramBot] Failed to send error message:', error);
    }
  }

  /**
   * Process user message with AI agent
   */
  private async processWithAI(message: string, chatId: number): Promise<string> {
    try {
      // Use the user's Telegram chat ID as userId for context
      const userId = `telegram_${chatId}`;
      
      // Import required modules
      const { parseIntentAndParams } = await import('@/lib/intentParser');
      const { handleAction } = await import('../api/actions');
      
      // Get LLM response
      const llmResponse = await runLLM({
        userId,
        message
      });
      
      console.log('[TelegramBot] LLM Response:', llmResponse);
      
      // Parse the intent and parameters
      const { intent, params } = parseIntentAndParams(llmResponse);
      
      console.log('[TelegramBot] Parsed intent:', intent, 'Params:', params);
      
      // Execute the action based on the intent
      let actionResult: any;
      try {
        actionResult = await handleAction(
          intent,
          params,
          userId
        );
      } catch (actionError) {
        console.error('[TelegramBot] Action execution error:', actionError);
        return 'I encountered an error processing your request. Please try again.';
      }
      
      // Format the response for Telegram
      let responseMessage = 'Request processed successfully';
      
      if (actionResult) {
        if (typeof actionResult === 'string') {
          responseMessage = actionResult;
        } else if (actionResult && typeof actionResult === 'object') {
          if ('text' in actionResult && actionResult.text) {
            responseMessage = actionResult.text;
          } else if ('name' in actionResult && actionResult.name) {
            responseMessage = `Action completed: ${actionResult.name}`;
          }
        }
      }
      
      return responseMessage || "I'm sorry, I couldn't process your request at the moment. Please try again.";
    } catch (error) {
      console.error('[TelegramBot] Error processing with AI:', error);
      return "I'm experiencing some technical difficulties. Please try again later.";
    }
  }

  /**
   * Ensure user exists in database with Telegram information
   */
  private async ensureUserExists(from: TelegramBot.User, chatId: number): Promise<void> {
    try {
      const { supabase } = await import('./supabase');
      
      const { error } = await supabase.rpc('get_or_create_telegram_user', {
        p_telegram_chat_id: chatId,
        p_telegram_username: from?.username || null,
        p_telegram_first_name: from?.first_name || null,
        p_telegram_last_name: from?.last_name || null,
        p_telegram_language_code: from?.language_code || null,
      });

      if (error) {
        console.error('[TelegramBot] Error ensuring user exists:', error);
      }
    } catch (error) {
      console.error('[TelegramBot] Error in ensureUserExists:', error);
    }
  }

  /**
   * Log message to database
   */
  private async logMessage(
    chatId: number, 
    direction: 'incoming' | 'outgoing', 
    content: string, 
    userId?: number
  ): Promise<void> {
    try {
      const { supabase } = await import('./supabase');
      
      // Get user ID by telegram_chat_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_chat_id', chatId)
        .single();

      if (userError || !userData) {
        console.error('[TelegramBot] Error getting user for logging:', userError);
        return;
      }

      const { error } = await supabase
        .from('telegram_message_logs')
        .insert({
          telegram_chat_id: chatId,
          user_id: userData.id,
          message_type: 'text',
          content: content,
          direction: direction,
          metadata: {},
        });

      if (error) {
        console.error('[TelegramBot] Error logging message:', error);
      }
    } catch (error) {
      console.error('[TelegramBot] Error in logMessage:', error);
    }
  }

  /**
   * Get bot information
   */
  async getMe(): Promise<TelegramBot.User> {
    try {
      return await this.bot.getMe();
    } catch (error) {
      console.error('[TelegramBot] Error getting bot info:', error);
      throw error;
    }
  }

  /**
   * Set webhook URL
   */
  async setWebhook(url: string, options?: TelegramBot.SetWebHookOptions): Promise<boolean> {
    try {
      return await this.bot.setWebHook(url, options);
    } catch (error) {
      console.error('[TelegramBot] Error setting webhook:', error);
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(): Promise<boolean> {
    try {
      return await this.bot.deleteWebHook();
    } catch (error) {
      console.error('[TelegramBot] Error deleting webhook:', error);
      throw error;
    }
  }

  /**
   * Get webhook information
   */
  async getWebhookInfo(): Promise<TelegramBot.WebhookInfo> {
    try {
      return await this.bot.getWebHookInfo();
    } catch (error) {
      console.error('[TelegramBot] Error getting webhook info:', error);
      throw error;
    }
  }

  /**
   * Process webhook update (for webhook mode)
   */
  async processWebhookUpdate(update: TelegramBot.Update): Promise<void> {
    try {
      this.bot.processUpdate(update);
    } catch (error) {
      console.error('[TelegramBot] Error processing webhook update:', error);
      throw error;
    }
  }
}

// Factory function to create bot instance
export const createTelegramBot = (config: TelegramBotConfig): TelegramBotService => {
  return new TelegramBotService(config);
};

// Export for backward compatibility
export { TelegramBotService as TelegramBot };