// src/lib/telegramBot.ts
import TelegramBot from 'node-telegram-bot-api';
import { runLLM } from './llmAgent';
import { BotIntegration } from '../modules/bot-integration';
import { supabase } from './supabase';
import type { ActionResult } from '../api/actions';

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
  private botIntegration: BotIntegration;
  private isPolling: boolean = false;

  constructor(config: TelegramBotConfig) {
    // Initialize the bot with polling or webhook
    this.bot = new TelegramBot(config.token, { 
      polling: config.polling || false 
    });
    this.botIntegration = new BotIntegration(this.bot);

    this.setupEventHandlers();
    
    // Setup bot commands menu
    this.setupBotCommands().catch(error => {
      console.error('[TelegramBot] Failed to setup bot commands:', error);
    });
    
    if (config.webhook) {
      this.setupWebhook(config.webhook.url, config.webhook.port);
    }
  }

  /**
   * Build Offramp Mini App URL with context
   */
  private buildOfframpUrl(userId: string, chatId: number, chain: string): string {
    // Prefer explicit WEBAPP_BASE_URL for flexibility (ngrok, custom host), else VERCEL_URL
    const rawBase = process.env.WEBAPP_BASE_URL
      ? process.env.WEBAPP_BASE_URL
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    let base = rawBase;
    if (base.startsWith('http://')) base = base.replace('http://', 'https://');
    if (base && !base.startsWith('https://')) base = '';
    if (!base) {
      throw new Error('Offramp mini app URL not configured. Set WEBAPP_BASE_URL to an HTTPS URL (e.g., your ngrok https URL).');
    }
    const params = new URLSearchParams({ userId, chatId: String(chatId), chain });
    return `${base.replace(/\/$/, '')}/offramp-new?${params.toString()}`;
  }

  /**
   * Setup event handlers for the bot
   */
  private setupEventHandlers(): void {
    // Explicitly handle /offramp and /withdraw via onText to ensure routing in all contexts
    this.bot.onText(/^\s*\/(offramp|withdraw)(?:@\w+)?\b/i, async (msg) => {
      const chatId = msg.chat.id;
      console.log('[TelegramBot] onText matched offramp/withdraw');
      try {
        const userId = await this.botIntegration.getUserIdByChatId(chatId);
        if (!userId) {
          await this.sendMessage(chatId, 'I don\'t see you in our system yet. Please run /start first to get set up!');
          return;
        }
        const url = this.buildOfframpUrl(userId, chatId, 'Base');
        await this.sendMessage(chatId, 'Start your cash-out with our secure mini app:', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Open Offramp', web_app: { url } }]]
          }
        });
      } catch (err) {
        console.error('[TelegramBot] onText offramp error:', err);
        await this.sendErrorMessage(chatId);
      }
    });

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

      // Track session_started event for user activity analysis
      try {
        const { trackEvent } = await import('./posthog');
        await trackEvent(
          'session_started',
          {
            feature: 'bot_interaction',
            timestamp: new Date().toISOString(),
          },
          userId?.toString() || chatId.toString(),
        );
      } catch (trackingError) {
        console.error('[TelegramBot] Error tracking session_started event:', trackingError);
      }

      // Log incoming message
      console.log('[TelegramBot] Logging incoming message');
      await this.logMessage(chatId, 'incoming', messageText, userId);

      // Send typing indicator
      console.log('[TelegramBot] Sending typing indicator');
      await this.sendChatAction(chatId, 'typing');

      // Check if user is in email collection state
      const emailHandled = await this.handleEmailCollection(chatId, messageText);
      if (emailHandled) {
        return;
      }

      // Handle commands
      if (messageText.startsWith('/')) {
        const commandName = messageText.split(' ')[0].toLowerCase();
        const baseCmd = commandName.includes('@') ? commandName.split('@')[0] : commandName;
        
        // Allow certain commands to be processed by AI instead of handleCommand
        if (baseCmd === '/send' || baseCmd === '/balance' || baseCmd === '/swap' || baseCmd === '/bridge' || baseCmd === '/price') {
          console.log('[TelegramBot] Processing AI-handled command:', baseCmd);
          const response = await this.processWithAI(messageText, chatId);
          console.log('[TelegramBot] AI response received, sending to user');
          await this.sendMessage(chatId, response);
          return;
        }
        
        console.log('[TelegramBot] Processing command:', messageText ? messageText.split(' ')[0] : 'unknown');
        await this.handleCommand(msg);
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
    const from = callbackQuery.from;

    if (!chatId || !data) {
      console.error('[TelegramBot] Invalid callback query received.');
      return;
    }

    console.log('[TelegramBot] Handling callback query:', { chatId, data, fromId: from.id });
    console.log('[TelegramBot] Callback query data received:', data);

    try {
      // Answer the callback query to remove loading state
      await this.bot.answerCallbackQuery(callbackQuery.id);

      // Ensure we have a user context to pass to handlers
      const userId = from.id.toString();

      // Route callback data to the appropriate handler in BotIntegration
      switch (data) {
        case 'business_dashboard':
          await this.botIntegration.handleBusinessDashboard(chatId);
          break;
        case 'business_invoices':
          await this.botIntegration.handleInvoiceList(chatId, userId);
          break;
        case 'business_proposals':
          await this.botIntegration.handleProposalList(chatId, userId);
          break;
        case 'business_stats':
          await this.botIntegration.handlePaymentStats(chatId, userId);
          break;
        case 'check_earnings': {
          // Deterministic earnings summary via BotIntegration
          await this.botIntegration.handleEarningsSummary(chatId, userId, 'lastMonth');
          break;
        }
        case 'earnings_tf_last7days': {
          await this.botIntegration.handleEarningsSummary(chatId, userId, 'last7days');
          break;
        }
        case 'earnings_tf_lastMonth': {
          await this.botIntegration.handleEarningsSummary(chatId, userId, 'lastMonth');
          break;
        }
        case 'earnings_tf_last3months': {
          await this.botIntegration.handleEarningsSummary(chatId, userId, 'last3months');
          break;
        }
        case 'earnings_tf_allTime': {
          await this.botIntegration.handleEarningsSummary(chatId, userId, 'allTime');
          break;
        }
        case 'create_wallet':
          await this.botIntegration.handleCreateWallet(chatId, userId);
          break;
        case 'check_balance':
          await this.botIntegration.handleCheckBalance(chatId, userId);
          break;
        case 'send_crypto':
          await this.botIntegration.handleSendCrypto(chatId, userId);
          break;
        case 'create_payment_link':
          await this.botIntegration.handlePaymentLink(chatId, userId);
          break;
        case 'help':
          await this.sendHelpMessage(chatId);
          break;
        case 'about':
          await this.sendAboutMessage(chatId);
          break;
        default:
          // Handle offramp callbacks
          if (data.startsWith('payout_bank_') || data.startsWith('select_bank_') || data.startsWith('back_to_') || data.startsWith('offramp_') || data === 'action_offramp') {
            console.log(`[TelegramBot] Routing offramp callback: ${data}`);
            // Route to actions.ts offramp handler
            const { handleAction } = await import('../api/actions');
            const result = await handleAction('offramp', { callback_data: data }, userId);
            if (result && result.text) {
              await this.sendMessage(chatId, result.text, {
                reply_markup: result.reply_markup as any,
                parse_mode: 'Markdown'
              });
            }
            break;
          }
          
          // Handle dynamic callbacks like 'view_invoice_ID' or 'delete_invoice_ID'
          if (data.startsWith('view_invoice_') || data.startsWith('delete_invoice_')) {
            // Delegate to a specific handler in BotIntegration if it exists
            // This part is not implemented in the provided bot-integration.ts, but this is where it would go.
            console.log(`[TelegramBot] Received dynamic invoice action: ${data}`)
            await this.sendMessage(chatId, `Action for ${data} is not yet implemented.`);
          } else {
            await this.sendMessage(chatId, `Action for '${data}' is not yet implemented.`);
          }
      }
    } catch (error) {
      console.error(`[TelegramBot] Error handling callback query '${data}':`, error);
      await this.sendErrorMessage(chatId);
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
  private async handleCommand(msg: TelegramBot.Message): Promise<void> {
    const command = msg.text || '';
    const chatId = msg.chat.id;
    const from = msg.from || undefined;
    const userName = from?.first_name || from?.username || 'User';
    // Normalize command name: remove bot username suffix like /offramp@MyBot
    const baseCmd = command.split(' ')[0].toLowerCase();
    const commandName = baseCmd.includes('@') ? baseCmd.split('@')[0] : baseCmd;

    console.log('[TelegramBot] Command received:', { raw: command, commandName, chatId, hasFrom: !!from });
    switch (commandName) {
      case '/start':
        await this.botIntegration.showWelcomeMessage(chatId);
        break;
      case '/help':
        await this.sendHelpMessage(chatId);
        break;
      case '/cancel':
        await this.handleCancelCommand(chatId, from?.id?.toString());
        break;
      case '/send_reminder':
      case '/sendreminder':
        await this.handleSendReminderCommand(chatId, from?.id?.toString(), command);
        break;
      case '/about':
        await this.sendAboutMessage(chatId);
        break;
      case '/menu':
        await this.sendMenuMessage(chatId);
        break;
      case '/offramp':
      case '/withdraw': {
        console.log('[TelegramBot] Routing to Offramp mini app');
        // Resolve user UUID by chatId using BotIntegration helper
        const userId = await this.botIntegration.getUserIdByChatId(chatId);
        if (!userId) {
          await this.sendMessage(chatId, 'I don\'t see you in our system yet. Please run /start first to get set up!');
          break;
        }
        const url = this.buildOfframpUrl(userId, chatId, 'Base');
        await this.sendMessage(chatId, '💱 Start your cash-out with our secure mini app:', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Open Offramp', web_app: { url } }]]
          }
        });
        break;
      }
      case '/invoice':
      case '/proposal':
      case '/support': {
        // Resolve userId from from.id or fallback via chatId
        const resolvedUserId = from?.id?.toString() || await this.botIntegration.getUserIdByChatId(chatId) || chatId.toString();
        console.log('[TelegramBot] Business command user resolution:', { resolvedUserId });
        await this.botIntegration.handleBusinessMessage(msg, resolvedUserId);
        break;
      }
      case '/earnings':
      case '/summary':
      case '/earnings_summary': {
        // Deterministic earnings summary using earningsService via BotIntegration
        const resolvedUserId = msg.from?.id?.toString() || await this.botIntegration.getUserIdByChatId(chatId);
        await this.botIntegration.handleEarningsSummary(chatId, resolvedUserId, 'lastMonth');
        break;
      }
      case '/referral': {
        // Handle referral command
        const resolvedUserId = msg.from?.id?.toString() || await this.botIntegration.getUserIdByChatId(chatId);
        if (resolvedUserId) {
          await this.botIntegration.handleReferralCommand(chatId, resolvedUserId);
        } else {
          await this.sendMessage(chatId, 'I don\'t see you in our system yet. Please run /start first to get set up!');
        }
        break;
      }
      case '/leaderboard': {
        // Handle leaderboard command
        await this.botIntegration.handleLeaderboardCommand(chatId);
        break;
      }
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
    // Track bot_started event for PostHog analytics
    try {
      const { trackEvent } = await import('./posthog');
      await trackEvent(
        'bot_started',
        {
          feature: 'bot_interaction',
          timestamp: new Date().toISOString(),
        },
        chatId.toString(),
      );
    } catch (error) {
      console.error('[TelegramBot] Error tracking bot_started event:', error);
    }

    const welcomeText = `Hello ${userName}! Welcome to Hedwig AI Assistant!

I'm here to help you with:
• Creating invoices
• Payment tracking
• Earnings summaries
• Token swaps
• General assistance

Just send me a message and I'll help you out!`;

    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: 'Help', callback_data: 'help' },
          { text: 'About', callback_data: 'about' }
        ],
        [
          { text: 'Create Invoice', callback_data: 'create_invoice' },
          { text: 'Check Earnings', callback_data: 'check_earnings' }
        ]
      ]
    };

    await this.sendMessage(chatId, welcomeText, { reply_markup: keyboard });
  }

  /**
   * Send help message
   */
  private async sendHelpMessage(chatId: number): Promise<void> {
    const helpText = `**Hedwig AI Assistant Help**

**Available Commands:**
/start - Start the bot
/help - Show this help message
/about - About Hedwig
/menu - Show quick action menu

**What I can do:**
• Create professional invoices
• Track your payments and earnings
• Provide payment summaries
• Help with token swaps
• Answer questions about your business

**How to use:**
Just type your request in natural language, like:
- "Create an invoice for $500"
- "Show me my earnings this month"
- "Send a payment reminder"
- "I want to swap tokens"

Feel free to ask me anything!`;

    await this.sendMessage(chatId, helpText);
  }

  /**
   * Send about message
   */
  private async sendAboutMessage(chatId: number): Promise<void> {
    const aboutText = `**About Hedwig**

Hedwig is an AI-powered assistant for freelancers and businesses, helping you manage:

• Invoice creation and management
• Payment tracking and reminders
• Earnings analytics
• Crypto payments and swaps
• Business automation

Built with care for the modern digital economy.

Version: 2.0.0
Powered by: node-telegram-bot-api`;

    await this.sendMessage(chatId, aboutText);
  }

  /**
   * Send menu with quick actions
   */
  private async sendMenuMessage(chatId: number): Promise<void> {
    const menuText = `**Quick Actions Menu**

Choose an action below:`;

    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: 'Create Invoice', callback_data: 'create_invoice' },
          { text: 'Check Earnings', callback_data: 'check_earnings' }
        ],
        [
          { text: 'Send Crypto', callback_data: 'send_crypto' },
          { text: 'Token Swap', callback_data: 'token_swap' }
        ],
        [
          { text: 'Payment Status', callback_data: 'payment_status' },
          { text: 'Check Balance', callback_data: 'check_balance' }
        ],
        [
          { text: 'Help', callback_data: 'help' },
          { text: 'About', callback_data: 'about' }
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
      // Get the actual user UUID from the database
      const { supabase } = await import('./supabase');
      const { data: user } = await supabase
        .from('users')
        .select('id, telegram_username')
        .eq('telegram_chat_id', chatId)
        .single();

      if (!user) {
        return "I don't see you in our system yet. Please try /start to initialize your account.";
      }

      // Use Telegram username as identifier for LLM, fallback to user UUID if no username
      const llmUserId = user.telegram_username || user.id;
      
      // Import required modules
      const { parseIntentAndParams } = await import('@/lib/intentParser');
      const { handleAction } = await import('../api/actions');
      
      // Get LLM response
      const llmResponse = await runLLM({
        userId: llmUserId,
        message
      });
      
      console.log('[TelegramBot] LLM Response:', llmResponse);
      
      // Parse the intent and parameters
      const { intent, params } = parseIntentAndParams(llmResponse);
      
      console.log('[TelegramBot] Parsed intent:', intent, 'Params:', params);

      // Special-case: Offramp intent should open the mini app (not conversational flow)
      if (intent === 'offramp' || intent === 'withdraw') {
        // If the user provided complete information (amount, token, chain), start the flow directly
        if (params.hasCompleteInfo) {
          console.log('[TelegramBot] Complete offramp info provided, starting flow with params:', params);
          
          // Execute the offramp action with the parsed parameters
          try {
            const actionResult = await handleAction(
              'offramp',
              { 
                ...params,
                step: 'amount',
                skipAmountStep: true // Flag to skip amount input since we have it
              },
              user.id
            );
            
            // Handle the action result
            if (actionResult && typeof actionResult === 'object' && actionResult.reply_markup) {
              await this.sendMessage(chatId, actionResult.text || 'Processing your withdrawal...', {
                reply_markup: actionResult.reply_markup
              });
              return 'Starting offramp flow with provided details';
            } else {
              await this.sendMessage(chatId, (actionResult as ActionResult).text || 'Processing your withdrawal...');
              return 'Starting offramp flow';
            }
          } catch (actionError) {
            console.error('[TelegramBot] Offramp action error:', actionError);
            // Fallback to mini app if action fails
            const url = this.buildOfframpUrl(user.id, chatId, 'Base');
            await this.sendMessage(chatId, '💱 Start your cash-out with our secure mini app:', {
              reply_markup: {
                inline_keyboard: [[{ text: 'Open Offramp', web_app: { url } }]]
              }
            });
            return 'Opening mini app…';
          }
        } else {
          // If incomplete information, open mini app as before
          const url = this.buildOfframpUrl(user.id, chatId, 'Base');
          await this.sendMessage(chatId, '💱 Start your cash-out with our secure mini app:', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Open Offramp', web_app: { url } }]]
            }
          });
          return 'Opening mini app…';
        }
      }

      // Execute the action based on the intent using the user's UUID
      let actionResult: ActionResult | string;
      try {
        actionResult = await handleAction(
          intent,
          params,
          user.id
        );
      } catch (actionError) {
        console.error('[TelegramBot] Action execution error:', actionError);
        return 'I encountered an error processing your request. Please try again.';
      }
      
      // Handle the action result - if it has reply_markup, send it directly
      if (actionResult && typeof actionResult === 'object' && actionResult.reply_markup) {
        await this.sendMessage(chatId, actionResult.text || 'Request processed', {
          reply_markup: actionResult.reply_markup
        });
        return 'Message sent with interactive options';
      }
      
      // Format the response for Telegram (simple text response)
      let responseMessage = 'Request processed successfully';
      
      if (actionResult) {
        if (typeof actionResult === 'string') {
          responseMessage = actionResult;
        } else if (actionResult && typeof actionResult === 'object') {
          const result = actionResult as Record<string, any>;
          if (result.text && typeof result.text === 'string') {
            responseMessage = result.text;
          } else if (result.name && typeof result.name === 'string') {
            responseMessage = `Action completed: ${result.name}`;
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
      
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_chat_id', chatId)
        .single();
      
      // Create or get user
      const { error } = await supabase.rpc('get_or_create_telegram_user', {
        p_telegram_chat_id: chatId,
        p_telegram_username: from?.username || null,
        p_telegram_first_name: from?.first_name || null,
        p_telegram_last_name: from?.last_name || null,
        p_telegram_language_code: from?.language_code || null,
      });

      if (error) {
        console.error('[TelegramBot] Error ensuring user exists:', error);
        return;
      }

      // If this is a new user, identify them in PostHog
      if (!existingUser) {
        try {
          const { identifyUser } = await import('./posthog');
          await identifyUser(chatId.toString(), {
            first_name: from?.first_name || null,
            username: from?.username || null,
            telegram_user_id: chatId,
            language_code: from?.language_code || null,
            context: 'telegram',
            user_type: 'new_telegram_user',
            created_via: 'telegram_bot'
          });
          console.log('[TelegramBot] Identified new user in PostHog:', chatId);
        } catch (posthogError) {
          console.error('[TelegramBot] Error identifying user in PostHog:', posthogError);
        }
      }

      // Check if user has email
      await this.checkAndRequestEmail(chatId);
    } catch (error) {
      console.error('[TelegramBot] Error in ensureUserExists:', error);
    }
  }

  /**
   * Check if user has email and request it if missing
   */
  private async checkAndRequestEmail(chatId: number): Promise<void> {
    try {
      
      // Get user data
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name, telegram_first_name')
        .eq('telegram_chat_id', chatId)
        .single();

      if (error || !user) {
        console.error('[TelegramBot] Error fetching user for email check:', error);
        return;
      }

      // If email is missing, request it
      if (!user.email) {
        const userName = user.name || user.telegram_first_name || 'there';
        await this.requestUserEmail(chatId, userName);
      }
    } catch (error) {
      console.error('[TelegramBot] Error checking user email:', error);
    }
  }

  /**
   * Request email from user
   */
  private async requestUserEmail(chatId: number, userName: string): Promise<void> {
    try {
      // Set session state to expect email
      await supabase
        .from('sessions')
        .upsert({
          user_id: chatId.toString(),
          context: { awaiting_email: true },
          updated_at: new Date().toISOString()
        });

      const message = `👋 Hi ${userName}! To personalize your invoices and proposals, I need your email address.

📧 Please reply with your email address:`;
      
      await this.sendMessage(chatId, message);
    } catch (error) {
      console.error('[TelegramBot] Error requesting user email:', error);
    }
  }

  /**
   * Handle email collection from user input
   */
  private async handleEmailCollection(chatId: number, messageText: string): Promise<boolean> {
    try {
      // Check if user is in email collection state
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('context')
        .eq('user_id', chatId.toString())
        .single();

      if (sessionError || !session?.context?.awaiting_email) {
        return false; // Not in email collection state
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(messageText.trim())) {
        await this.sendMessage(chatId, '❌ Please enter a valid email address (e.g., john@example.com):');
        return true; // Handled, but invalid
      }

      const email = messageText.trim().toLowerCase();

      // Update user with email
      const { error: updateError } = await supabase
        .from('users')
        .update({ email })
        .eq('telegram_chat_id', chatId);

      if (updateError) {
        console.error('[TelegramBot] Error updating user email:', updateError);
        await this.sendMessage(chatId, '❌ Failed to save your email. Please try again.');
        return true;
      }

      // Clear session state
      await supabase
        .from('sessions')
        .update({ context: {} })
        .eq('user_id', chatId.toString());

      // Confirm email saved
      await this.sendMessage(chatId, `✅ Great! Your email (${email}) has been saved.

Now you can create personalized invoices and proposals. Type /help to see what I can do for you!`);
      
      return true; // Successfully handled
    } catch (error) {
      console.error('[TelegramBot] Error handling email collection:', error);
      return false;
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
   * Setup bot commands menu
   */
  async setupBotCommands(): Promise<void> {
    try {
      const commands = [
        { command: 'start', description: 'Start the bot and show main menu' },
        { command: 'help', description: 'Show help and available commands' },
        { command: 'cancel', description: 'Cancel current action or flow' },
        { command: 'send_reminder', description: 'Send a payment reminder' },
        { command: 'wallet', description: 'View wallet information' },
        { command: 'balance', description: 'Check wallet balance' },
        { command: 'send', description: 'Send crypto to someone' },
        { command: 'offramp', description: 'Withdraw crypto to bank account' },
        { command: 'earnings', description: 'View earnings summary' },
        { command: 'summary', description: 'View earnings summary' },
        { command: 'earnings_summary', description: 'View earnings summary' },
        { command: 'business_dashboard', description: 'Access business dashboard' },
        { command: 'invoice', description: 'Create an invoice' },
        { command: 'proposal', description: 'Create a proposal' },
        { command: 'paymentlink', description: 'Create a payment link' },
        { command: 'referral', description: 'Get your referral link and stats' },
        { command: 'leaderboard', description: 'View referral leaderboard' }
      ];

      await this.bot.setMyCommands(commands);
      console.log('[TelegramBot] Bot commands menu set successfully');
    } catch (error) {
      console.error('[TelegramBot] Error setting bot commands:', error);
      throw error;
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
   * Handle cancel command to stop any ongoing flow
   */
  async handleCancelCommand(chatId: number, userId?: string): Promise<void> {
    try {
      if (userId) {
        // Clear user session state
        const { sessionManager } = await import('./sessionManager');
        const { supabase } = await import('./supabase');
        
        // Get user's wallet address to clear session
        const { data: userWallet } = await supabase
          .from('wallets')
          .select('address')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (userWallet?.address) {
          sessionManager.invalidateSession(userWallet.address);
        }
        
        // Clear offramp session if exists
        const { offrampSessionService } = await import('../services/offrampSessionService');
        const activeOfframpSession = await offrampSessionService.getActiveSession(userId);
        if (activeOfframpSession) {
          await offrampSessionService.clearSession(activeOfframpSession.id);
        }
        
        // Clear any other state management
        await supabase
          .from('user_states')
          .delete()
          .eq('user_id', userId);
      }
      
      await this.bot.sendMessage(chatId, '✅ All ongoing actions have been cancelled. You can start fresh with any command.');
    } catch (error) {
      console.error('[TelegramBot] Error handling cancel command:', error);
      await this.bot.sendMessage(chatId, '❌ Error cancelling actions. Please try again.');
    }
  }

  /**
   * Handle send reminder command
   */
  async handleSendReminderCommand(chatId: number, userId?: string, command?: string): Promise<void> {
    try {
      if (!userId) {
        await this.bot.sendMessage(chatId, '❌ User identification required for sending reminders.');
        return;
      }

      await this.bot.sendMessage(chatId, '📧 Please provide the email address to send the reminder to:');
      
      // Set user state to expect email input for reminder
      const { supabase } = await import('./supabase');
      await supabase
        .from('user_states')
        .upsert({
          user_id: userId,
          state_type: 'awaiting_reminder_email',
          state_data: {},
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,state_type'
        });
      
    } catch (error) {
      console.error('[TelegramBot] Error handling send reminder command:', error);
      await this.bot.sendMessage(chatId, '❌ Error setting up reminder. Please try again.');
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


// Add this function to the end of the file
export async function processWithAI(text: string, chatId: number): Promise<string> {
  const { runLLM } = await import('./llmAgent');
  const { handleAction } = await import('../api/actions');
  
  const actionResult = await runLLM({
    userId: String(chatId),
    message: text
  });

  if (actionResult && typeof actionResult === 'object') {
    // Type guard to ensure actionResult is a record
    const actionParams = actionResult as Record<string, any>;

    if ('intent' in actionParams && typeof actionParams.intent === 'string') {
      // Call handleAction and return its string result
      const result = await handleAction(actionParams.intent, actionParams.params, String(chatId));
      return result.text || 'Action completed successfully.';
    }
  }
  
  // Fallback for unexpected cases
  return 'I received a response I couldn\'t process. Please try again.';
}