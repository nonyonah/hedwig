// src/lib/telegramBot.ts
import TelegramBot from 'node-telegram-bot-api';
import { runLLM } from './llmAgent';
import { BotIntegration } from '../modules/bot-integration';
import { supabase } from './supabase';
import type { ActionResult } from '../api/actions';
import { FonbnkService } from '../services/fonbnkService';
import { getOrCreateCdpWallet } from './cdp';

export interface TelegramBotConfig {
  token: string;
  polling?: boolean;
  webhook?: {
    url: string;
    port?: number;
  };
}

// Onramp conversation state interface
interface OnrampConversationState {
  step: 'token_selection' | 'chain_selection' | 'region_selection' | 'amount_input' | 'confirmation';
  selectedToken?: string;
  selectedChain?: string;
  selectedCurrency?: string;
  amount?: number;
  rates?: Record<string, number>;
  userId?: string;
}

export class TelegramBotService {
  private bot: TelegramBot;
  private botIntegration: BotIntegration;
  private isPolling: boolean = false;
  private fonbnkService: FonbnkService;
  private onrampConversations: Map<number, OnrampConversationState> = new Map();

  constructor(config: TelegramBotConfig) {
    // Initialize the bot with polling or webhook
    this.bot = new TelegramBot(config.token, {
      polling: config.polling || false
    });
    this.botIntegration = new BotIntegration(this.bot);
    this.fonbnkService = new FonbnkService();

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

    // Calendar commands are handled via the main message handler and AI processing

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

      // Check if user is in milestone completion state
      const milestoneHandled = await this.handleMilestoneCompletionInput(chatId, userId?.toString() || '', messageText);
      if (milestoneHandled) {
        return;
      }

      // Check if user is in onramp flow and handle text input
      const onrampHandled = await this.handleOnrampTextInput(chatId, messageText);
      if (onrampHandled) {
        return;
      }

      // Quick check for common onramp phrases - feature currently disabled
      const lowerText = messageText.toLowerCase();
      if (lowerText.includes('buy crypto') || lowerText.includes('buy cryptocurrency') ||
        lowerText.includes('purchase crypto') || lowerText.includes('buy tokens') ||
        lowerText.includes('buy usdc') || lowerText.includes('buy usdt') ||
        lowerText.includes('onramp') || lowerText.includes('buy with') ||
        (lowerText.includes('buy') && (lowerText.includes('ngn') || lowerText.includes('naira') ||
          lowerText.includes('kes') || lowerText.includes('ghs') || lowerText.includes('ugx')))) {
        console.log('[TelegramBot] Onramp phrase detected but feature is disabled');
        await this.sendMessage(chatId, '🚧 **Buy Crypto Feature Coming Soon**\n\nI understand you want to buy cryptocurrency! This feature is currently under development and will be available soon.\n\nIn the meantime, you can:\n• Check your wallet balance\n• Send crypto to others\n• Create invoices and payment links', { parse_mode: 'Markdown' });
        return;
      }

      // Handle commands
      if (messageText.startsWith('/')) {
        const commandName = messageText.split(' ')[0].toLowerCase();
        const baseCmd = commandName.includes('@') ? commandName.split('@')[0] : commandName;

        console.log('[TelegramBot] Command detected:', { messageText, commandName, baseCmd });

        // Allow certain commands to be processed by AI instead of handleCommand
        if (baseCmd === '/send' || baseCmd === '/balance' || baseCmd === '/swap' || baseCmd === '/bridge' || baseCmd === '/price' || baseCmd === '/buy' || baseCmd === '/purchase' || baseCmd === '/onramp') {
          console.log('[TelegramBot] Processing AI-handled command:', baseCmd);
          console.log('[TelegramBot] Full message text:', messageText);
          const response = await this.processWithAI(messageText, chatId);
          console.log('[TelegramBot] AI response received:', response);
          await this.sendMessage(chatId, response);
          return;
        }

        console.log('[TelegramBot] Processing command via handleCommand:', messageText ? messageText.split(' ')[0] : 'unknown');
        await this.handleCommand(msg);
        return;
      }

      // Process with AI if not a command
      if (messageText.trim()) {
        console.log('[TelegramBot] Processing non-command message with AI:', messageText);
        const response = await this.processWithAI(messageText, chatId);

        console.log('[TelegramBot] AI response received:', response);
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
        case 'start_onramp':
          // Onramp feature is currently disabled
          await this.sendMessage(chatId, '🚧 **Buy Crypto Feature Coming Soon**\n\nThe onramp feature is currently under development. We\'ll notify you when it\'s available!', { parse_mode: 'Markdown' });
          break;
        case 'onramp_history':
          // Onramp feature is currently disabled
          await this.sendMessage(chatId, '🚧 **Buy Crypto Feature Coming Soon**\n\nThe onramp feature is currently under development. Transaction history will be available when the feature launches!', { parse_mode: 'Markdown' });
          break;

        case 'check_balance':
          await this.botIntegration.handleBusinessMessage({ chat: { id: chatId }, text: '/balance', from: { id: parseInt(userId) } } as any, userId);
          break;
        case 'price_check':
          await this.sendMessage(chatId, '💰 **Token Prices**\n\nTo check token prices, just ask me! For example:\n• "What\'s the price of ETH?"\n• "Show me USDC price"\n• "How much is Bitcoin worth?"', { parse_mode: 'Markdown' });
          break;
        case 'swap_tokens':
          await this.sendMessage(chatId, '🔄 **Token Swap**\n\nTo swap tokens, just tell me what you want to do! For example:\n• "Swap 100 USDC to ETH"\n• "I want to swap tokens"\n• "Convert my USDT to USDC"', { parse_mode: 'Markdown' });
          break;
        case 'milestone_list':
          await this.showMilestoneList(chatId, userId);
          break;
        case 'milestone_submit':
          await this.showMilestoneSubmissionForm(chatId, userId);
          break;
        case 'milestone_menu':
          await this.showMilestoneMenu(chatId, userId);
          break;
        case 'milestone_status':
          await this.showMilestoneList(chatId, userId);
          break;
        case 'milestone_due_soon':
          await this.showMilestonesApproachingDeadline(chatId, userId);
          break;
        default:
          // Handle onramp callbacks
          if (data.startsWith('onramp_')) {
            console.log(`[TelegramBot] Routing onramp callback: ${data}`);
            await this.handleOnrampCallback(callbackQuery);
            break;
          }

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

          // Handle milestone-specific callbacks
          if (data.startsWith('milestone_submit_')) {
            const milestoneId = data.replace('milestone_submit_', '');
            await this.handleMilestoneSubmission(chatId, userId, milestoneId);
          } else if (data.startsWith('milestone_quick_submit_')) {
            const milestoneId = data.replace('milestone_quick_submit_', '');
            await this.handleQuickMilestoneSubmit(chatId, userId, milestoneId);
          } else if (data.startsWith('milestone_start_')) {
            const milestoneId = data.replace('milestone_start_', '');
            await this.handleMilestoneStart(chatId, userId, milestoneId);
          }
          // Handle dynamic callbacks like 'view_invoice_ID' or 'delete_invoice_ID'
          else if (data.startsWith('view_invoice_') || data.startsWith('delete_invoice_')) {
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
      case '/buy_crypto':
      case '/buy':
      case '/onramp': {
        // Handle onramp commands via bot-integration (same as calendar/invoice)
        const resolvedUserId = from?.id?.toString() || await this.botIntegration.getUserIdByChatId(chatId) || chatId.toString();
        console.log('[TelegramBot] Onramp command user resolution:', { resolvedUserId });
        await this.botIntegration.handleBusinessMessage(msg, resolvedUserId);
        break;
      }
      case '/onramp_history': {
        // Onramp feature is currently disabled
        await this.sendMessage(chatId, '🚧 **Buy Crypto Feature Coming Soon**\n\nThe onramp feature is currently under development. Transaction history will be available when the feature launches!', { parse_mode: 'Markdown' });
        break;
      }
      case '/onramp_status': {
        // Onramp feature is currently disabled
        await this.sendMessage(chatId, '🚧 **Buy Crypto Feature Coming Soon**\n\nThe onramp feature is currently under development. Transaction status checking will be available when the feature launches!', { parse_mode: 'Markdown' });
        break;
      }
      case '/contract':
      case '/contracts': {
        // Handle contract creation and management
        const resolvedUserId = from?.id?.toString() || await this.botIntegration.getUserIdByChatId(chatId) || chatId.toString();
        console.log('[TelegramBot] Contract command user resolution:', { resolvedUserId });
        await this.botIntegration.handleBusinessMessage(msg, resolvedUserId);
        break;
      }
      case '/milestone':
      case '/milestones': {
        // Handle milestone submission and management
        const resolvedUserId = from?.id?.toString() || await this.botIntegration.getUserIdByChatId(chatId) || chatId.toString();
        console.log('[TelegramBot] Milestone command user resolution:', { resolvedUserId });
        await this.handleMilestoneCommand(chatId, resolvedUserId, command);
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

    const welcomeText = `👋 Hello ${userName}! Welcome to Hedwig AI Assistant! 🦉

🚀 I'm here to help you with:
• 📄 Creating invoices
• 💰 Payment tracking
• 📊 Earnings summaries
• 🔄 Token swaps
• 📊 Payment tracking and analytics
• 💬 General assistance

Just send me a message and I'll help you out! ✨`;

    const keyboard: TelegramBot.InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '❓ Help', callback_data: 'help' },
          { text: 'ℹ️ About', callback_data: 'about' }
        ],
        [
          { text: '📄 Create Invoice', callback_data: 'create_invoice' },
          { text: '📊 Check Earnings', callback_data: 'check_earnings' }
        ],
        [
          { text: '🔄 Token Swap', callback_data: 'swap_tokens' }
        ]
      ]
    };

    await this.sendMessage(chatId, welcomeText, { reply_markup: keyboard });
  }

  /**
   * Send help message
   */
  private async sendHelpMessage(chatId: number): Promise<void> {
    const helpText = `🦉 **Hedwig AI Assistant Help** 🦉

📋 **Available Commands:**
/start - 🚀 Start the bot
/help - ❓ Show this help message
/about - ℹ️ About Hedwig
/menu - 📱 Show quick action menu


🪙 **Buy Crypto Commands:**
/buy_crypto - 💰 Buy cryptocurrency with fiat
/onramp - 🪙 Purchase crypto with local currency

✨ **What I can do:**
• 📄 Create professional invoices
• 💰 Track your payments and earnings
• 📊 Provide payment summaries
• 🔄 Help with token swaps
• 📊 Track payment status and history
• 🪙 Buy crypto with local currency (onramp)
• 💱 Sell crypto for local currency (offramp)
• 💬 Answer questions about your business

🎯 **How to use:**
Just type your request in natural language, like:
- "Create an invoice for $500" 💵
- "Show me my earnings this month" 📈
- "Send a payment reminder" 📧
- "I want to swap tokens" 🔄
- "Check my balance" or "token prices" 💰
- "Buy crypto with NGN" 🪙

Feel free to ask me anything! 😊`;

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
          { text: '💰 Check Balance', callback_data: 'check_balance' },
          { text: '📊 Price Check', callback_data: 'price_check' }
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

      // Check if user is in contract creation flow first (use UUID for contract flow tracking)
      console.log('[TelegramBot] Checking contract flow for user:', user.id);
      const isInFlow = await this.botIntegration?.getContractModule()?.isInContractFlow(user.id);
      console.log('[TelegramBot] Is user in contract flow?', isInFlow);
      
      if (isInFlow) {
        console.log('[TelegramBot] User is in contract flow, handling contract input directly');
        const contractHandled = await this.botIntegration.getContractModule().handleContractInput(chatId, user.id, message);
        console.log('[TelegramBot] Contract input handled:', contractHandled);
        if (contractHandled) {
          return 'Contract input processed successfully.';
        }
      }

      // Import required modules
      const { parseIntentAndParams } = await import('./intentParser');
      const { handleAction } = await import('../api/actions');

      // Get LLM response
      console.log('🔥 [TelegramBot] About to call runLLM with:', { userId: llmUserId, message, generateNaturalResponse: false });
      const llmResponse = await runLLM({
        userId: llmUserId,
        message,
        generateNaturalResponse: false
      });
      console.log('🔥 [TelegramBot] runLLM returned:', llmResponse);

      console.log('[TelegramBot] LLM Response:', llmResponse);

      // Parse the intent and parameters
      const { intent, params } = parseIntentAndParams(llmResponse);

      console.log('[TelegramBot] LLM Response:', llmResponse);
      console.log('[TelegramBot] Parsed intent from LLM:', intent, 'Params:', params);

      // Debug: Also try direct intent parsing for comparison
      const directIntent = parseIntentAndParams(message);
      console.log('[TelegramBot] Direct intent parsing (bypass LLM):', directIntent);

      // Fallback: If LLM didn't recognize intent but direct parser did, use direct parser
      let finalIntent = intent;
      let finalParams = params;

      if (intent === 'unknown' && (directIntent.intent === 'onramp')) {
        console.log('[TelegramBot] Using direct parser result as fallback for:', directIntent.intent);
        finalIntent = directIntent.intent;
        finalParams = directIntent.params || {};
      }

      console.log('[TelegramBot] Final intent to execute:', finalIntent, 'Final params:', finalParams);

      // Enhanced fallback logic for onramp
      console.log('[TelegramBot] Checking fallback logic. Current finalIntent:', finalIntent);
      if (finalIntent === 'unknown' || finalIntent === 'conversation' || finalIntent === 'clarification') {
        const lowerMessage = message.toLowerCase();
        console.log('[TelegramBot] Applying enhanced fallback for message:', lowerMessage);

        // Onramp fallback: Check for onramp keywords
        if (lowerMessage.includes('buy crypto') || lowerMessage.includes('buy cryptocurrency') ||
          lowerMessage.includes('purchase crypto') || lowerMessage.includes('buy tokens') ||
          lowerMessage.includes('buy usdc') || lowerMessage.includes('buy usdt') ||
          lowerMessage.includes('onramp') || lowerMessage.includes('fiat to crypto') ||
          (lowerMessage.includes('buy') && (lowerMessage.includes('ngn') || lowerMessage.includes('naira')))) {
          console.log('[TelegramBot] Forcing onramp intent due to clear onramp keywords');
          finalIntent = 'onramp';
          finalParams = { text: message };
        }
        // Calendar fallback: Show disabled message for calendar keywords
        else if (lowerMessage.includes('calendar')) {
          console.log('[TelegramBot] Calendar keywords detected, but calendar is disabled');
          await this.sendMessage(chatId, '📅 **Calendar Sync Unavailable**\n\nCalendar sync is currently disabled. Please contact support if you need this feature.', { parse_mode: 'Markdown' });
          return 'Calendar sync is currently disabled.';
        }
      }

      // Check direct parser for non-calendar intents as additional fallback
      console.log('[TelegramBot] Checking direct parser fallback. directIntent:', directIntent.intent, 'finalIntent:', finalIntent);
      if (finalIntent === 'unknown' && directIntent.intent === 'onramp') {
        console.log('[TelegramBot] Using direct parser result as fallback for onramp intent:', directIntent.intent);
        finalIntent = directIntent.intent;
        finalParams = directIntent.params || {};
      }

      console.log('[TelegramBot] Final intent after all fallbacks:', finalIntent);

      // Special-case: Offramp intent should open the mini app (not conversational flow)
      if (finalIntent === 'offramp' || finalIntent === 'withdraw') {
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
        console.log('[handleAction] Intent:', finalIntent, 'Params:', finalParams, 'UserId:', user.id);
        actionResult = await handleAction(
          finalIntent,
          finalParams,
          user.id
        );
        console.log('[TelegramBot] handleAction result:', actionResult);
        console.log('[TelegramBot] actionResult type:', typeof actionResult);
        console.log('[TelegramBot] actionResult has reply_markup:', actionResult && typeof actionResult === 'object' && 'reply_markup' in actionResult);
      } catch (actionError) {
        console.error('[TelegramBot] Action execution error:', actionError);
        return 'I encountered an error processing your request. Please try again.';
      }

      // Handle the action result - if it has reply_markup, send it directly
      if (actionResult && typeof actionResult === 'object' && actionResult.reply_markup) {
        console.log('[TelegramBot] Sending message with reply_markup:', actionResult.reply_markup);
        await this.sendMessage(chatId, actionResult.text || 'Request processed', {
          reply_markup: actionResult.reply_markup
        });
        return 'Message sent with interactive options';
      }

      // Check if action handler already sent the message (empty text response)
      if (actionResult && typeof actionResult === 'object' && actionResult.text === '') {
        console.log('[TelegramBot] Action handler already sent message, skipping response');
        return 'Message already sent by action handler';
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

      console.log('[TelegramBot] Final response message:', responseMessage);
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
        { command: 'start', description: '🚀 Start the bot and show main menu' },
        { command: 'help', description: '❓ Show help and available commands' },
        { command: 'cancel', description: '❌ Cancel current action or flow' },
        { command: 'send_reminder', description: '📧 Send a payment reminder' },
        { command: 'wallet', description: '👛 View wallet information' },
        { command: 'balance', description: '💰 Check wallet balance' },
        { command: 'send', description: '💸 Send crypto to someone' },

        { command: 'offramp', description: '🏦 Withdraw crypto to bank account' },
        { command: 'earnings', description: '📊 View earnings summary' },
        { command: 'summary', description: '📈 View earnings summary' },
        { command: 'earnings_summary', description: '💹 View earnings summary' },
        { command: 'business_dashboard', description: '📋 Access business dashboard' },
        { command: 'invoice', description: '📄 Create an invoice' },
        { command: 'proposal', description: '📝 Create a proposal' },
        { command: 'contract', description: '📝 Create smart contract' },
        { command: 'milestone', description: '🎯 Submit milestone completion' },
        { command: 'milestones', description: '📋 View my milestones' },
        { command: 'paymentlink', description: '🔗 Create a payment link' },
        { command: 'referral', description: '🎁 Get your referral link and stats' },
        { command: 'leaderboard', description: '🏆 View referral leaderboard' },

        { command: 'onramp', description: '💰 Purchase cryptocurrency' }
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

  /**
   * Handle Buy Crypto command - route through bot-integration
   */
  private async handleBuyCryptoCommand(chatId: number, userId: string, params: any = {}): Promise<void> {
    try {
      console.log(`[TelegramBot] Routing onramp to bot-integration for user ${userId}`);

      // Route to bot-integration for consistent handling
      await this.botIntegration.handleBuyCrypto(chatId, userId, params);

    } catch (error) {
      console.error('[TelegramBot] Error handling buy crypto command:', error);
      await this.sendMessage(chatId, '❌ Sorry, there was an error starting the purchase flow. Please try again.');
    }
  }

  /**
   * Handle Buy Crypto command with conversation flow (legacy method)
   */
  private async handleBuyCryptoCommandWithFlow(chatId: number, userId: string): Promise<void> {
    try {
      console.log(`[TelegramBot] Starting onramp conversation flow for user ${userId}`);

      // Track onramp started event
      try {
        const { trackEvent } = await import('./posthog');
        await trackEvent('onramp_started', {
          feature: 'onramp',
          timestamp: new Date().toISOString(),
        }, userId);
      } catch (trackingError) {
        console.error('[TelegramBot] Error tracking onramp_started event:', trackingError);
      }

      // Initialize conversation state
      this.onrampConversations.set(chatId, {
        step: 'token_selection',
        userId: userId
      });

      // Show token selection
      await this.showTokenSelection(chatId);

    } catch (error) {
      console.error('[TelegramBot] Error handling buy crypto command with flow:', error);
      await this.sendMessage(chatId, '❌ Sorry, there was an error starting the purchase flow. Please try again.');
    }
  }

  /**
   * Show token selection interface
   */
  private async showTokenSelection(chatId: number): Promise<void> {
    try {
      const supportedTokens = await this.fonbnkService.getSupportedTokens();

      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: supportedTokens.map(token => [{
          text: `${token.symbol} - ${token.name}`,
          callback_data: `onramp_token_${token.symbol.toLowerCase()}`
        }])
      };

      await this.sendMessage(chatId,
        '🪙 **Choose the token you want to buy:**\n\n' +
        supportedTokens.map(token =>
          `• **${token.symbol}** - ${token.name}\n  Available on: ${token.chains.join(', ')}`
        ).join('\n\n'),
        { reply_markup: keyboard }
      );

    } catch (error) {
      console.error('[TelegramBot] Error showing token selection:', error);
      await this.sendMessage(chatId, '❌ Error loading available tokens. Please try again.');
    }
  }

  /**
   * Show chain selection interface
   */
  private async showChainSelection(chatId: number, token: string): Promise<void> {
    try {
      const supportedTokens = await this.fonbnkService.getSupportedTokens();
      const tokenInfo = supportedTokens.find(t => t.symbol.toLowerCase() === token.toLowerCase());

      if (!tokenInfo) {
        throw new Error(`Token ${token} not found`);
      }

      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: tokenInfo.chains.map(chain => [{
          text: `${chain.charAt(0).toUpperCase() + chain.slice(1)} Network`,
          callback_data: `onramp_chain_${chain.toLowerCase()}`
        }])
      };

      await this.sendMessage(chatId,
        `🔗 **Choose the network for ${tokenInfo.symbol}:**\n\n` +
        tokenInfo.chains.map(chain =>
          `• **${chain.charAt(0).toUpperCase() + chain.slice(1)}** Network`
        ).join('\n'),
        { reply_markup: keyboard }
      );

    } catch (error) {
      console.error('[TelegramBot] Error showing chain selection:', error);
      await this.sendMessage(chatId, '❌ Error loading available networks. Please try again.');
    }
  }

  /**
   * Show currency/region selection interface
   */
  private async showCurrencySelection(chatId: number): Promise<void> {
    try {
      const supportedCurrencies = await this.fonbnkService.getSupportedCurrencies();

      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: supportedCurrencies.map(currency => [{
          text: `${currency.symbol} ${currency.name} (${currency.code})`,
          callback_data: `onramp_currency_${currency.code.toLowerCase()}`
        }])
      };

      await this.sendMessage(chatId,
        '🌍 **Choose your currency/region:**\n\n' +
        supportedCurrencies.map(currency =>
          `• **${currency.symbol} ${currency.name}** (${currency.code})\n  Regions: ${currency.regions.join(', ')}`
        ).join('\n\n'),
        { reply_markup: keyboard }
      );

    } catch (error) {
      console.error('[TelegramBot] Error showing currency selection:', error);
      await this.sendMessage(chatId, '❌ Error loading available currencies. Please try again.');
    }
  }

  /**
   * Handle onramp callback queries
   */
  private async handleOnrampCallback(callbackQuery: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id.toString();

    if (!chatId || !data) return;

    try {
      const conversation = this.onrampConversations.get(chatId);
      if (!conversation) {
        await this.sendMessage(chatId, '❌ Session expired. Please start again with /buy_crypto');
        return;
      }

      if (data.startsWith('onramp_token_')) {
        const token = data.replace('onramp_token_', '').toUpperCase();
        conversation.selectedToken = token;
        conversation.step = 'chain_selection';

        // Track token selection
        try {
          const { trackEvent } = await import('./posthog');
          await trackEvent('onramp_token_selected', {
            feature: 'onramp',
            token: token,
            timestamp: new Date().toISOString(),
          }, userId);
        } catch (trackingError) {
          console.error('[TelegramBot] Error tracking onramp_token_selected event:', trackingError);
        }

        await this.showChainSelection(chatId, token);

      } else if (data.startsWith('onramp_chain_')) {
        const chain = data.replace('onramp_chain_', '').toLowerCase();
        conversation.selectedChain = chain;
        conversation.step = 'region_selection';

        // Track chain selection
        try {
          const { trackEvent } = await import('./posthog');
          await trackEvent('onramp_chain_selected', {
            feature: 'onramp',
            token: conversation.selectedToken,
            chain: chain,
            timestamp: new Date().toISOString(),
          }, userId);
        } catch (trackingError) {
          console.error('[TelegramBot] Error tracking onramp_chain_selected event:', trackingError);
        }

        await this.showCurrencySelection(chatId);

      } else if (data.startsWith('onramp_currency_')) {
        const currency = data.replace('onramp_currency_', '').toUpperCase();
        conversation.selectedCurrency = currency;
        conversation.step = 'amount_input';

        await this.sendMessage(chatId,
          `💰 **Enter the amount you want to spend in ${currency}:**\n\n` +
          `Example: 1000 (for ${currency} 1,000)\n\n` +
          `Minimum: $5 USD equivalent\n` +
          `Maximum: $10,000 USD equivalent`
        );

      } else if (data.startsWith('onramp_confirm_')) {
        await this.processOnrampTransaction(chatId, conversation);

      } else if (data === 'onramp_cancel') {
        this.onrampConversations.delete(chatId);
        await this.sendMessage(chatId, '❌ Purchase cancelled. You can start again with /buy_crypto');
      }

    } catch (error) {
      console.error('[TelegramBot] Error handling onramp callback:', error);
      await this.sendMessage(chatId, '❌ Error processing your request. Please try again.');
    }
  }

  /**
   * Process onramp transaction creation
   */
  private async processOnrampTransaction(chatId: number, conversation: OnrampConversationState): Promise<void> {
    try {
      if (!conversation.selectedToken || !conversation.selectedChain || !conversation.selectedCurrency || !conversation.amount || !conversation.userId) {
        throw new Error('Missing required information');
      }

      await this.sendMessage(chatId, '⏳ Creating your purchase transaction...');

      // Get user's wallet address
      const wallet = await getOrCreateCdpWallet(conversation.userId, conversation.selectedChain);
      if (!wallet || !wallet.address) {
        throw new Error('Failed to get wallet address');
      }

      // Create transaction
      const transactionResponse = await this.fonbnkService.createTransaction({
        userId: conversation.userId,
        token: conversation.selectedToken,
        chain: conversation.selectedChain,
        amount: conversation.amount,
        currency: conversation.selectedCurrency,
        walletAddress: wallet.address
      });

      // Track transaction creation
      try {
        const { trackEvent } = await import('./posthog');
        await trackEvent('onramp_transaction_created', {
          feature: 'onramp',
          token: conversation.selectedToken,
          chain: conversation.selectedChain,
          currency: conversation.selectedCurrency,
          amount: conversation.amount,
          transaction_id: transactionResponse.transactionId,
          timestamp: new Date().toISOString(),
        }, conversation.userId);
      } catch (trackingError) {
        console.error('[TelegramBot] Error tracking onramp_transaction_created event:', trackingError);
      }

      // Send success message with payment link
      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [[
          { text: '💳 Complete Payment', url: transactionResponse.paymentUrl }
        ]]
      };

      await this.sendMessage(chatId,
        `✅ **Transaction Created Successfully!**\n\n` +
        `🪙 **Token:** ${conversation.selectedToken}\n` +
        `🔗 **Network:** ${conversation.selectedChain}\n` +
        `💰 **Amount:** ${conversation.amount} ${conversation.selectedCurrency}\n` +
        `📍 **Wallet:** ${wallet.address}\n\n` +
        `🔗 **Transaction ID:** \`${transactionResponse.transactionId}\`\n\n` +
        `⏰ **Expires:** ${transactionResponse.expiresAt.toLocaleString()}\n\n` +
        `👆 Click the button below to complete your payment. You'll receive your tokens within 1-5 minutes after payment confirmation.`,
        { reply_markup: keyboard }
      );

      // Clear conversation state
      this.onrampConversations.delete(chatId);

    } catch (error) {
      console.error('[TelegramBot] Error processing onramp transaction:', error);
      await this.sendMessage(chatId, `❌ Error creating transaction: ${error.message}`);
    }
  }

  /**
   * Handle onramp transaction history
   */
  private async handleOnrampHistory(chatId: number, userId: string): Promise<void> {
    try {
      const transactions = await this.fonbnkService.getUserTransactionHistory(userId, 10);

      if (transactions.length === 0) {
        await this.sendMessage(chatId, '📝 No onramp transactions found. Start your first purchase with /buy_crypto');
        return;
      }

      let message = '📋 **Your Recent Onramp Transactions:**\n\n';

      transactions.forEach((tx, index) => {
        const statusEmoji = tx.status === 'completed' ? '✅' :
          tx.status === 'failed' ? '❌' :
            tx.status === 'processing' ? '⏳' : '🕐';

        message += `${index + 1}. ${statusEmoji} **${tx.token}** on ${tx.chain}\n`;
        message += `   💰 ${tx.amount} ${tx.token} (${tx.fiatAmount} ${tx.fiatCurrency})\n`;
        message += `   📅 ${tx.createdAt.toLocaleDateString()}\n`;
        message += `   🆔 \`${tx.fonbnkTransactionId}\`\n\n`;
      });

      await this.sendMessage(chatId, message);

    } catch (error) {
      console.error('[TelegramBot] Error getting onramp history:', error);
      await this.sendMessage(chatId, '❌ Error loading transaction history. Please try again.');
    }
  }

  /**
   * Handle onramp transaction status check
   */
  private async handleOnrampStatus(chatId: number, userId: string, transactionId: string): Promise<void> {
    try {
      const transaction = await this.fonbnkService.checkTransactionStatus(transactionId);

      if (!transaction) {
        await this.sendMessage(chatId, '❌ Transaction not found. Please check the transaction ID.');
        return;
      }

      if (transaction.userId !== userId) {
        await this.sendMessage(chatId, '❌ You can only check your own transactions.');
        return;
      }

      const statusEmoji = transaction.status === 'completed' ? '✅' :
        transaction.status === 'failed' ? '❌' :
          transaction.status === 'processing' ? '⏳' : '🕐';

      let message = `${statusEmoji} **Transaction Status**\n\n`;
      message += `🆔 **ID:** \`${transaction.fonbnkTransactionId}\`\n`;
      message += `🪙 **Token:** ${transaction.token} on ${transaction.chain}\n`;
      message += `💰 **Amount:** ${transaction.amount} ${transaction.token}\n`;
      message += `💵 **Paid:** ${transaction.fiatAmount} ${transaction.fiatCurrency}\n`;
      message += `📍 **Wallet:** \`${transaction.walletAddress}\`\n`;
      message += `📊 **Status:** ${transaction.status.toUpperCase()}\n`;
      message += `📅 **Created:** ${transaction.createdAt.toLocaleString()}\n`;

      if (transaction.txHash) {
        message += `🔗 **Tx Hash:** \`${transaction.txHash}\`\n`;
      }

      if (transaction.completedAt) {
        message += `✅ **Completed:** ${transaction.completedAt.toLocaleString()}\n`;
      }

      if (transaction.errorMessage) {
        message += `❌ **Error:** ${transaction.errorMessage}\n`;
      }

      await this.sendMessage(chatId, message);

    } catch (error) {
      console.error('[TelegramBot] Error checking onramp status:', error);
      await this.sendMessage(chatId, '❌ Error checking transaction status. Please try again.');
    }
  }

  /**
   * Handle text messages during onramp flow (for amount input)
   */
  private async handleOnrampTextInput(chatId: number, messageText: string): Promise<boolean> {
    const conversation = this.onrampConversations.get(chatId);

    if (!conversation || conversation.step !== 'amount_input') {
      return false; // Not in onramp flow or not expecting text input
    }

    try {
      const amount = parseFloat(messageText.replace(/[^\d.]/g, ''));

      if (isNaN(amount) || amount <= 0) {
        await this.sendMessage(chatId, '❌ Please enter a valid amount (numbers only).');
        return true;
      }

      if (amount < 5) {
        await this.sendMessage(chatId, '❌ Minimum amount is $5 USD equivalent.');
        return true;
      }

      if (amount > 10000) {
        await this.sendMessage(chatId, '❌ Maximum amount is $10,000 USD equivalent.');
        return true;
      }

      conversation.amount = amount;
      conversation.step = 'confirmation';

      // Get exchange rate
      try {
        const rateResponse = await this.fonbnkService.getExchangeRates(
          conversation.selectedToken!,
          amount,
          conversation.selectedCurrency!
        );

        const keyboard: TelegramBot.InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: '✅ Confirm Purchase', callback_data: 'onramp_confirm_yes' }],
            [{ text: '❌ Cancel', callback_data: 'onramp_cancel' }]
          ]
        };

        await this.sendMessage(chatId,
          `📋 **Purchase Summary:**\n\n` +
          `🪙 **Token:** ${conversation.selectedToken}\n` +
          `🔗 **Network:** ${conversation.selectedChain}\n` +
          `💰 **You Pay:** ${amount} ${conversation.selectedCurrency}\n` +
          `🎯 **You Get:** ~${(amount / rateResponse.rate).toFixed(6)} ${conversation.selectedToken}\n` +
          `📊 **Rate:** 1 ${conversation.selectedToken} = ${rateResponse.rate.toFixed(2)} ${conversation.selectedCurrency}\n` +
          `💸 **Fees:** ${rateResponse.fees.totalFee.toFixed(2)} ${conversation.selectedCurrency}\n\n` +
          `⏰ **Rate expires in 30 seconds**\n\n` +
          `Confirm to proceed with the purchase?`,
          { reply_markup: keyboard }
        );

      } catch (error) {
        console.error('[TelegramBot] Error getting exchange rate:', error);
        await this.sendMessage(chatId, '❌ Error getting current rates. Please try again.');
      }

      return true;

    } catch (error) {
      console.error('[TelegramBot] Error handling onramp text input:', error);
      await this.sendMessage(chatId, '❌ Error processing amount. Please try again.');
      return true;
    }
  }

  /**
   * Handle milestone commands
   */
  async handleMilestoneCommand(chatId: number, userId: string, command: string): Promise<void> {
    try {
      const commandParts = command.split(' ');
      const baseCommand = commandParts[0].toLowerCase();

      if (baseCommand === '/milestones') {
        await this.showMilestoneList(chatId, userId);
      } else if (baseCommand === '/milestone') {
        if (commandParts.length > 1) {
          const action = commandParts[1].toLowerCase();
          if (action === 'submit') {
            await this.showMilestoneSubmissionForm(chatId, userId);
          } else {
            await this.showMilestoneMenu(chatId, userId);
          }
        } else {
          await this.showMilestoneMenu(chatId, userId);
        }
      }
    } catch (error) {
      console.error('[TelegramBot] Error handling milestone command:', error);
      await this.sendMessage(chatId, '❌ Error processing milestone command. Please try again.');
    }
  }

  /**
   * Show milestone menu with options
   */
  private async showMilestoneMenu(chatId: number, userId: string): Promise<void> {
    try {
      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: '📋 View My Milestones', callback_data: 'milestone_list' },
            { text: '✅ Submit Milestone', callback_data: 'milestone_submit' }
          ],
          [
            { text: '📊 Milestone Status', callback_data: 'milestone_status' },
            { text: '🔔 Due Soon', callback_data: 'milestone_due_soon' }
          ]
        ]
      };

      const menuText = `🎯 **Milestone Management**

Choose an action:

📋 **View My Milestones** - See all your active milestones
✅ **Submit Milestone** - Mark a milestone as completed
📊 **Milestone Status** - Check status of your milestones
🔔 **Due Soon** - See milestones approaching deadline

You can also use:
• \`/milestones\` - View all milestones
• \`/milestone submit\` - Quick submit form`;

      await this.sendMessage(chatId, menuText, { reply_markup: keyboard });
    } catch (error) {
      console.error('[TelegramBot] Error showing milestone menu:', error);
      await this.sendMessage(chatId, '❌ Error loading milestone menu. Please try again.');
    }
  }

  /**
   * Show list of user's milestones
   */
  private async showMilestoneList(chatId: number, userId: string): Promise<void> {
    try {
      // Get user's milestones from database
      const { supabase } = await import('./supabase');
      
      const { data: milestones, error } = await supabase
        .from('contract_milestones')
        .select(`
          id,
          title,
          description,
          amount,
          status,
          deadline,
          started_at,
          contract_id,
          project_contracts (
            project_title,
            client_email,
            freelancer_id
          )
        `)
        .eq('project_contracts.freelancer_id', userId)
        .order('deadline', { ascending: true });

      if (error) {
        console.error('[TelegramBot] Error fetching milestones:', error);
        await this.sendMessage(chatId, '❌ Error loading your milestones. Please try again.');
        return;
      }

      if (!milestones || milestones.length === 0) {
        await this.sendMessage(chatId, '📋 **No Milestones Found**\n\nYou don\'t have any active milestones at the moment.\n\nMilestones will appear here when you have active contracts with milestone-based payments.');
        return;
      }

      let message = '📋 **Your Milestones**\n\n';
      
      milestones.forEach((milestone, index) => {
        const contract = Array.isArray(milestone.project_contracts) 
          ? milestone.project_contracts[0] 
          : milestone.project_contracts;
        
        const statusEmoji = this.getMilestoneStatusEmoji(milestone.status);
        const deadlineDate = new Date(milestone.deadline).toLocaleDateString();
        
        message += `${index + 1}. **${milestone.title}** ${statusEmoji}\n`;
        message += `   📁 Project: ${contract?.project_title || 'Unknown'}\n`;
        message += `   💰 Amount: $${milestone.amount}\n`;
        message += `   📅 Due: ${deadlineDate}\n`;
        message += `   📊 Status: ${milestone.status.replace('_', ' ').toUpperCase()}\n\n`;
      });

      // Add action buttons for in-progress milestones
      const inProgressMilestones = milestones.filter(m => m.status === 'in_progress');
      
      if (inProgressMilestones.length > 0) {
        const keyboard: TelegramBot.InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: '✅ Submit Milestone', callback_data: 'milestone_submit' }],
            [{ text: '🔄 Refresh List', callback_data: 'milestone_list' }]
          ]
        };
        
        message += '\n💡 **Tip:** Click "Submit Milestone" when you\'ve completed work on any in-progress milestone.';
        
        await this.sendMessage(chatId, message, { reply_markup: keyboard });
      } else {
        await this.sendMessage(chatId, message);
      }

    } catch (error) {
      console.error('[TelegramBot] Error showing milestone list:', error);
      await this.sendMessage(chatId, '❌ Error loading milestone list. Please try again.');
    }
  }

  /**
   * Show milestone submission form
   */
  private async showMilestoneSubmissionForm(chatId: number, userId: string): Promise<void> {
    try {
      // Get user's in-progress milestones
      const { supabase } = await import('./supabase');
      
      const { data: milestones, error } = await supabase
        .from('contract_milestones')
        .select(`
          id,
          title,
          description,
          amount,
          deadline,
          contract_id,
          project_contracts (
            project_title,
            client_email,
            freelancer_id
          )
        `)
        .eq('project_contracts.freelancer_id', userId)
        .eq('status', 'in_progress')
        .order('deadline', { ascending: true });

      if (error) {
        console.error('[TelegramBot] Error fetching in-progress milestones:', error);
        await this.sendMessage(chatId, '❌ Error loading your milestones. Please try again.');
        return;
      }

      if (!milestones || milestones.length === 0) {
        await this.sendMessage(chatId, '📋 **No In-Progress Milestones**\n\nYou don\'t have any milestones currently in progress.\n\nStart working on a milestone first, then you can submit it for review.');
        return;
      }

      let message = '✅ **Submit Milestone Completion**\n\nSelect a milestone to submit:\n\n';
      
      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: milestones.map((milestone, index) => {
          const contract = Array.isArray(milestone.project_contracts) 
            ? milestone.project_contracts[0] 
            : milestone.project_contracts;
          
          return [{
            text: `${index + 1}. ${milestone.title} ($${milestone.amount})`,
            callback_data: `milestone_submit_${milestone.id}`
          }];
        })
      };

      // Add cancel button
      keyboard.inline_keyboard.push([{ text: '❌ Cancel', callback_data: 'milestone_menu' }]);

      await this.sendMessage(chatId, message, { reply_markup: keyboard });

    } catch (error) {
      console.error('[TelegramBot] Error showing milestone submission form:', error);
      await this.sendMessage(chatId, '❌ Error loading submission form. Please try again.');
    }
  }

  /**
   * Handle milestone submission
   */
  async handleMilestoneSubmission(chatId: number, userId: string, milestoneId: string): Promise<void> {
    try {
      // Get milestone details
      const { supabase } = await import('./supabase');
      
      const { data: milestone, error } = await supabase
        .from('contract_milestones')
        .select(`
          id,
          title,
          description,
          amount,
          status,
          contract_id,
          project_contracts (
            project_title,
            client_email,
            freelancer_id
          )
        `)
        .eq('id', milestoneId)
        .single();

      if (error || !milestone) {
        await this.sendMessage(chatId, '❌ Milestone not found. Please try again.');
        return;
      }

      if (milestone.status !== 'in_progress') {
        await this.sendMessage(chatId, `❌ This milestone is currently "${milestone.status}" and cannot be submitted.`);
        return;
      }

      // Show submission confirmation template
      const contract = Array.isArray(milestone.project_contracts) 
        ? milestone.project_contracts[0] 
        : milestone.project_contracts;

      const confirmationMessage = `🎯 **Milestone Submission Confirmation**

**Project:** ${contract?.project_title || 'Unknown'}
**Milestone:** ${milestone.title}
**Amount:** $${milestone.amount}
**Description:** ${milestone.description || 'No description'}

📝 **Please provide details about your completed work:**

You can describe:
• What you've delivered
• Key features completed
• Any notes for the client
• Links to deliverables (if applicable)

Type your completion notes below, or use the quick submit button:`;

      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: '⚡ Quick Submit', callback_data: `milestone_quick_submit_${milestoneId}` }],
          [{ text: '❌ Cancel', callback_data: 'milestone_submit' }]
        ]
      };

      // Set user state to expect completion notes
      await supabase
        .from('user_states')
        .upsert({
          user_id: userId,
          state_type: 'awaiting_milestone_completion',
          state_data: { milestone_id: milestoneId },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,state_type'
        });

      await this.sendMessage(chatId, confirmationMessage, { reply_markup: keyboard });

    } catch (error) {
      console.error('[TelegramBot] Error handling milestone submission:', error);
      await this.sendMessage(chatId, '❌ Error processing milestone submission. Please try again.');
    }
  }

  /**
   * Process milestone completion notes
   */
  async processMilestoneCompletion(chatId: number, userId: string, milestoneId: string, completionNotes: string): Promise<void> {
    try {
      // Submit milestone via API
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/milestones/${milestoneId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliverables: 'Submitted via Telegram',
          completion_notes: completionNotes
        })
      });

      const result = await response.json();

      if (result.success) {
        const successMessage = `✅ **Milestone Submitted Successfully!**

Your milestone has been submitted for client review.

📧 **Client Notified:** The client has been notified via email
⏰ **Next Steps:** Wait for client approval or feedback
💰 **Payment:** You'll receive payment once approved

**Submitted Work:**
${completionNotes}

You'll be notified when the client responds!`;

        await this.sendMessage(chatId, successMessage);

        // Clear user state
        const { supabase } = await import('./supabase');
        await supabase
          .from('user_states')
          .delete()
          .eq('user_id', userId)
          .eq('state_type', 'awaiting_milestone_completion');

      } else {
        await this.sendMessage(chatId, `❌ **Submission Failed**\n\n${result.error || 'Unknown error occurred'}\n\nPlease try again.`);
      }

    } catch (error) {
      console.error('[TelegramBot] Error processing milestone completion:', error);
      await this.sendMessage(chatId, '❌ Error submitting milestone. Please try again.');
    }
  }

  /**
   * Handle quick milestone submission
   */
  async handleQuickMilestoneSubmit(chatId: number, userId: string, milestoneId: string): Promise<void> {
    const defaultNotes = 'Work completed as requested. Ready for review.';
    await this.processMilestoneCompletion(chatId, userId, milestoneId, defaultNotes);
  }

  /**
   * Get emoji for milestone status
   */
  private getMilestoneStatusEmoji(status: string): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'in_progress': return '🔄';
      case 'submitted': return '📤';
      case 'completed': return '✅';
      case 'approved': return '✅';
      case 'changes_requested': return '🔄';
      case 'paid': return '💰';
      default: return '❓';
    }
  }

  /**
   * Send milestone deadline reminder
   */
  async sendMilestoneDeadlineReminder(chatId: number, milestone: any, daysUntilDeadline: number): Promise<void> {
    try {
      const urgencyEmoji = daysUntilDeadline <= 1 ? '🚨' : daysUntilDeadline <= 3 ? '⚠️' : '📅';
      const urgencyText = daysUntilDeadline <= 1 ? 'URGENT' : daysUntilDeadline <= 3 ? 'Soon' : 'Upcoming';
      
      const message = `${urgencyEmoji} **Milestone Deadline ${urgencyText}**

**Project:** ${milestone.project_title}
**Milestone:** ${milestone.title}
**Amount:** $${milestone.amount}
**Deadline:** ${new Date(milestone.deadline).toLocaleDateString()}
**Days Remaining:** ${daysUntilDeadline}

${daysUntilDeadline <= 1 ? 
  '🚨 **This milestone is due very soon!**' : 
  daysUntilDeadline <= 3 ? 
  '⚠️ **This milestone is due soon.**' : 
  '📅 **Reminder: This milestone is approaching its deadline.**'
}

Current Status: ${milestone.status.replace('_', ' ').toUpperCase()}`;

      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [
          milestone.status === 'in_progress' ? 
            [{ text: '✅ Submit Now', callback_data: `milestone_submit_${milestone.id}` }] : 
            [{ text: '🔄 Start Working', callback_data: `milestone_start_${milestone.id}` }],
          [{ text: '📋 View All Milestones', callback_data: 'milestone_list' }]
        ]
      };

      await this.sendMessage(chatId, message, { reply_markup: keyboard });

    } catch (error) {
      console.error('[TelegramBot] Error sending milestone deadline reminder:', error);
    }
  }

  /**
   * Show milestones approaching deadline
   */
  private async showMilestonesApproachingDeadline(chatId: number, userId: string): Promise<void> {
    try {
      const { supabase } = await import('./supabase');
      
      // Get milestones due within 7 days
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      
      const { data: milestones, error } = await supabase
        .from('contract_milestones')
        .select(`
          id,
          title,
          description,
          amount,
          status,
          deadline,
          contract_id,
          project_contracts (
            project_title,
            client_email,
            freelancer_id
          )
        `)
        .eq('project_contracts.freelancer_id', userId)
        .in('status', ['pending', 'in_progress'])
        .lte('deadline', sevenDaysFromNow.toISOString())
        .order('deadline', { ascending: true });

      if (error) {
        console.error('[TelegramBot] Error fetching approaching milestones:', error);
        await this.sendMessage(chatId, '❌ Error loading milestones. Please try again.');
        return;
      }

      if (!milestones || milestones.length === 0) {
        await this.sendMessage(chatId, '✅ **No Urgent Milestones**\n\nYou don\'t have any milestones due in the next 7 days.\n\nKeep up the great work! 🎉');
        return;
      }

      let message = '🔔 **Milestones Due Soon**\n\n';
      
      milestones.forEach((milestone, index) => {
        const contract = Array.isArray(milestone.project_contracts) 
          ? milestone.project_contracts[0] 
          : milestone.project_contracts;
        
        const deadlineDate = new Date(milestone.deadline);
        const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const urgencyEmoji = daysUntilDeadline <= 1 ? '🚨' : daysUntilDeadline <= 3 ? '⚠️' : '📅';
        
        message += `${urgencyEmoji} **${milestone.title}**\n`;
        message += `   📁 ${contract?.project_title || 'Unknown'}\n`;
        message += `   💰 $${milestone.amount}\n`;
        message += `   📅 Due in ${daysUntilDeadline} day${daysUntilDeadline !== 1 ? 's' : ''}\n`;
        message += `   📊 ${milestone.status.replace('_', ' ').toUpperCase()}\n\n`;
      });

      const keyboard: TelegramBot.InlineKeyboardMarkup = {
        inline_keyboard: [
          [{ text: '✅ Submit Milestone', callback_data: 'milestone_submit' }],
          [{ text: '📋 View All Milestones', callback_data: 'milestone_list' }]
        ]
      };

      await this.sendMessage(chatId, message, { reply_markup: keyboard });

    } catch (error) {
      console.error('[TelegramBot] Error showing approaching milestones:', error);
      await this.sendMessage(chatId, '❌ Error loading approaching milestones. Please try again.');
    }
  }

  /**
   * Handle milestone start
   */
  async handleMilestoneStart(chatId: number, userId: string, milestoneId: string): Promise<void> {
    try {
      // Start milestone via API
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/milestones/${milestoneId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          freelancer_id: userId
        })
      });

      const result = await response.json();

      if (result.success) {
        const successMessage = `🚀 **Milestone Started!**

You've successfully started working on this milestone.

**Next Steps:**
• Work on the milestone deliverables
• Submit for review when completed
• Get paid once approved by client

Good luck with your work! 💪`;

        await this.sendMessage(chatId, successMessage);
      } else {
        await this.sendMessage(chatId, `❌ **Failed to Start Milestone**\n\n${result.error || 'Unknown error occurred'}\n\nPlease try again.`);
      }

    } catch (error) {
      console.error('[TelegramBot] Error starting milestone:', error);
      await this.sendMessage(chatId, '❌ Error starting milestone. Please try again.');
    }
  }

  /**
   * Handle milestone completion text input
   */
  async handleMilestoneCompletionInput(chatId: number, userId: string, messageText: string): Promise<boolean> {
    try {
      // Check if user is in milestone completion state
      const { supabase } = await import('./supabase');
      
      const { data: userState, error } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_milestone_completion')
        .single();

      if (error || !userState) {
        return false; // Not in milestone completion state
      }

      const milestoneId = userState.state_data?.milestone_id;
      if (!milestoneId) {
        return false;
      }

      // Process the completion
      await this.processMilestoneCompletion(chatId, userId, milestoneId, messageText);
      return true;

    } catch (error) {
      console.error('[TelegramBot] Error handling milestone completion input:', error);
      return false;
    }
  }


}

// Factory function to create bot instance
export const createTelegramBot = (config: TelegramBotConfig): TelegramBotService => {
  return new TelegramBotService(config);
};

// Export for backward compatibility
export { TelegramBotService as TelegramBot };

