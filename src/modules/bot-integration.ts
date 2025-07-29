import TelegramBot from 'node-telegram-bot-api';
import { InvoiceModule } from './invoices';
import { ProposalModule } from './proposals';
import { USDCPaymentModule } from './usdc-payments';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class BotIntegration {
  private bot: TelegramBot;
  private invoiceModule: InvoiceModule;
  private proposalModule: ProposalModule;
  private usdcPaymentModule: USDCPaymentModule;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.invoiceModule = new InvoiceModule(bot);
    this.proposalModule = new ProposalModule(bot);
    this.usdcPaymentModule = new USDCPaymentModule(bot);
  }

  // Enhanced main menu with business features
  getMainMenuKeyboard(): TelegramBot.ReplyKeyboardMarkup {
    return {
      keyboard: [
        [{ text: '💰 Balance' }, { text: '👛 Wallet' }],
        [{ text: '💸 Send Crypto' }, { text: '🔗 Payment Link' }],
        [{ text: '📄 Invoice' }, { text: '📋 Proposal' }],
        [{ text: '📊 Business Dashboard' }, { text: '📈 View History' }],
        [{ text: '❓ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }

  // Business dashboard menu
  getBusinessDashboardKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '📄 My Invoices', callback_data: 'business_invoices' },
          { text: '📋 My Proposals', callback_data: 'business_proposals' }
        ],
        [
          { text: '💰 Payment Stats', callback_data: 'business_stats' },
          { text: '⚙️ Settings', callback_data: 'business_settings' }
        ],
        [
          { text: '🔙 Back to Main Menu', callback_data: 'main_menu' }
        ]
      ]
    };
  }

  // Handle business dashboard
  async handleBusinessDashboard(chatId: number) {
    const message = (
      `📊 *Business Dashboard*\n\n` +
      `Manage your invoices, proposals, and payments from here.\n\n` +
      `What would you like to do?`
    );

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: this.getBusinessDashboardKeyboard()
    });
  }

  // Handle invoice list
  async handleInvoiceList(chatId: number, userId: string) {
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!invoices || invoices.length === 0) {
        await this.bot.sendMessage(chatId, 
          '📄 *No invoices found*\n\nYou haven\'t created any invoices yet. Use the "Invoice" button to create your first invoice!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📄 *Your Recent Invoices*\n\n';
      const keyboard = [];

      for (const invoice of invoices) {
        const status = this.getStatusEmoji(invoice.status);
        message += `${status} *${invoice.invoice_number}*\n`;
        message += `   Client: ${invoice.client_name}\n`;
        message += `   Amount: ${invoice.amount} ${invoice.currency}\n`;
        message += `   Status: ${invoice.status}\n\n`;

        keyboard.push([{
          text: `📄 ${invoice.invoice_number}`,
          callback_data: `view_invoice_${invoice.id}`
        }]);
      }

      keyboard.push([{ text: '🔙 Back', callback_data: 'business_dashboard' }]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('Error fetching invoices:', error);
      await this.bot.sendMessage(chatId, '❌ Error fetching invoices. Please try again.');
    }
  }

  // Handle proposal list
  async handleProposalList(chatId: number, userId: string) {
    try {
      const { data: proposals, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!proposals || proposals.length === 0) {
        await this.bot.sendMessage(chatId, 
          '📋 *No proposals found*\n\nYou haven\'t created any proposals yet. Use the "Proposal" button to create your first proposal!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 *Your Recent Proposals*\n\n';
      const keyboard = [];

      for (const proposal of proposals) {
        const status = this.getStatusEmoji(proposal.status);
        message += `${status} *${proposal.proposal_number}*\n`;
        message += `   Client: ${proposal.client_name}\n`;
        message += `   Amount: ${proposal.amount} ${proposal.currency}\n`;
        message += `   Status: ${proposal.status}\n\n`;

        keyboard.push([{
          text: `📋 ${proposal.proposal_number}`,
          callback_data: `view_proposal_${proposal.id}`
        }]);
      }

      keyboard.push([{ text: '🔙 Back', callback_data: 'business_dashboard' }]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('Error fetching proposals:', error);
      await this.bot.sendMessage(chatId, '❌ Error fetching proposals. Please try again.');
    }
  }

  // Handle payment statistics
  async handlePaymentStats(chatId: number, userId: string) {
    try {
      // Get invoice stats
      const { data: invoiceStats } = await supabase
        .from('invoices')
        .select('status, amount, currency')
        .eq('user_id', userId);

      // Get proposal stats
      const { data: proposalStats } = await supabase
        .from('proposals')
        .select('status, amount, currency')
        .eq('user_id', userId);

      const stats = this.calculateStats(invoiceStats || [], proposalStats || []);

      const message = (
        `💰 *Payment Statistics*\n\n` +
        `📄 *Invoices:*\n` +
        `   Total: ${stats.invoices.total}\n` +
        `   Paid: ${stats.invoices.paid}\n` +
        `   Pending: ${stats.invoices.pending}\n` +
        `   Revenue: $${stats.invoices.revenue.toFixed(2)}\n\n` +
        `📋 *Proposals:*\n` +
        `   Total: ${stats.proposals.total}\n` +
        `   Accepted: ${stats.proposals.accepted}\n` +
        `   Pending: ${stats.proposals.pending}\n` +
        `   Value: $${stats.proposals.value.toFixed(2)}\n\n` +
        `💵 *Total Revenue: $${(stats.invoices.revenue + stats.proposals.revenue).toFixed(2)}*`
      );

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: 'business_dashboard' }]
          ]
        }
      });

    } catch (error) {
      console.error('Error fetching payment stats:', error);
      await this.bot.sendMessage(chatId, '❌ Error fetching payment statistics.');
    }
  }

  // Calculate statistics
  private calculateStats(invoices: any[], proposals: any[]) {
    const invoiceStats = {
      total: invoices.length,
      paid: invoices.filter(i => i.status === 'paid').length,
      pending: invoices.filter(i => i.status === 'pending').length,
      revenue: invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + (i.currency === 'USD' ? i.amount : i.amount * 0.0012), 0)
    };

    const proposalStats = {
      total: proposals.length,
      accepted: proposals.filter(p => p.status === 'accepted').length,
      pending: proposals.filter(p => p.status === 'pending').length,
      value: proposals.reduce((sum, p) => sum + (p.currency === 'USD' ? p.amount : p.amount * 0.0012), 0),
      revenue: proposals
        .filter(p => p.status === 'accepted')
        .reduce((sum, p) => sum + (p.currency === 'USD' ? p.amount : p.amount * 0.0012), 0)
    };

    return { invoices: invoiceStats, proposals: proposalStats };
  }

  // Get status emoji
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'paid':
      case 'accepted':
        return '✅';
      case 'pending':
        return '⏳';
      case 'draft':
        return '📝';
      case 'sent':
        return '📤';
      case 'overdue':
        return '⚠️';
      default:
        return '📄';
    }
  }

  // Handle business settings
  async handleBusinessSettings(chatId: number) {
    const message = (
      `⚙️ *Business Settings*\n\n` +
      `Configure your business preferences and payment settings.`
    );

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏢 Business Info', callback_data: 'settings_business_info' },
            { text: '💳 Payment Methods', callback_data: 'settings_payment_methods' }
          ],
          [
            { text: '🔗 Wallet Addresses', callback_data: 'settings_wallet_addresses' },
            { text: '📧 Email Settings', callback_data: 'settings_email' }
          ],
          [
            { text: '🔙 Back', callback_data: 'business_dashboard' }
          ]
        ]
      }
    });
  }

  // Show main menu
  async showMainMenu(chatId: number) {
    await this.bot.sendMessage(chatId, 
      `🦉 Welcome to Hedwig Bot!\n\n` +
      `I'm your AI assistant for crypto payments and wallet management.\n\n` +
      `Use the menu below or chat with me naturally!`,
      {
        reply_markup: this.getMainMenuKeyboard()
      }
    );
  }

  // Handle main callback queries
  async handleCallback(callbackQuery: TelegramBot.CallbackQuery, userId?: string) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;
    if (!data || !chatId) return false;
    
    // Get userId if not provided
    if (!userId) {
      userId = chatId.toString();
    }

    try {
      // Business dashboard callbacks
      if (data === 'business_dashboard') {
        await this.handleBusinessDashboard(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_invoices') {
        await this.handleInvoiceList(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_proposals') {
        await this.handleProposalList(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_stats') {
        await this.handlePaymentStats(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_settings') {
        await this.handleBusinessSettings(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'main_menu') {
        await this.bot.sendMessage(chatId, 
          '🏠 *Main Menu*\n\nChoose an option:',
          {
            parse_mode: 'Markdown',
            reply_markup: this.getMainMenuKeyboard()
          }
        );
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Invoice module callbacks
      else if (data.startsWith('invoice_') || data.startsWith('view_invoice_')) {
        await this.invoiceModule.handleInvoiceCallback(callbackQuery);
        return true;
      }
      // Proposal module callbacks
      else if (data.startsWith('proposal_') || data.startsWith('view_proposal_')) {
        await this.proposalModule.handleProposalCallback(callbackQuery);
        return true;
      }
      // USDC payment callbacks
      else if (data.startsWith('usdc_') || data.startsWith('confirm_payment_')) {
        await this.usdcPaymentModule.handleCallback(callbackQuery);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error handling callback:', error);
      await this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred' });
      return false;
    }
  }

  // Handle text messages for business features
  async handleMessage(message: TelegramBot.Message, userId?: string) {
    if (!userId) {
      userId = message.chat.id.toString();
    }
    return this.handleBusinessMessage(message, userId);
  }

  async handleBusinessMessage(message: TelegramBot.Message, userId: string) {
    const chatId = message.chat.id;
    const text = message.text;

    if (!text) return false;

    try {
      switch (text) {
        case '📄 Invoice':
          await this.invoiceModule.handleInvoiceCreation(chatId, userId);
          return true;

        case '📋 Proposal':
          await this.proposalModule.handleProposalCreation(chatId, userId);
          return true;

        case '📊 Business Dashboard':
          await this.handleBusinessDashboard(chatId);
          return true;

        default:
          // Check if user is in invoice creation flow
          const ongoingInvoice = await this.getOngoingInvoice(userId);
          if (ongoingInvoice) {
            await this.invoiceModule.continueInvoiceCreation(message.chat.id, userId, ongoingInvoice, message.text);
            return true;
          }
          
          // Check if user is in proposal creation flow
          const ongoingProposal = await this.getOngoingProposal(userId);
          if (ongoingProposal) {
            await this.proposalModule.continueProposalCreation(message.chat.id, userId, ongoingProposal, message.text);
            return true;
          }
          return false;
      }
    } catch (error) {
      console.error('Error handling business message:', error);
      return false;
    }
  }

  // Get modules for external access
  getInvoiceModule() {
    return this.invoiceModule;
  }

  getProposalModule() {
    return this.proposalModule;
  }

  getUSDCPaymentModule() {
    return this.usdcPaymentModule;
  }

  private async getOngoingInvoice(userId: string) {
    const { data } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice')
      .single();
    
    return data?.state_data;
  }

  private async getOngoingProposal(userId: string) {
    const { data } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_proposal')
      .single();
    
    return data?.state_data;
  }
}