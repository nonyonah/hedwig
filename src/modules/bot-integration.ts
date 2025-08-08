import TelegramBot from 'node-telegram-bot-api';
import { InvoiceModule } from './invoices';
import { ProposalModule } from './proposals';
import { USDCPaymentModule } from './usdc-payments';
import { createClient } from '@supabase/supabase-js';
// Dynamic import to prevent serverEnv loading during build
// import { getBusinessStats } from '../lib/earningsService';

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

  // Get persistent keyboard for all messages
  getPersistentKeyboard() {
    return {
      keyboard: [
        [{ text: '💰 Balance' }, { text: '👛 Wallet' }],
        [{ text: '💸 Send Crypto' }, { text: '🔗 Payment Link' }],
        [{ text: '📝 Proposal' }, { text: '🧾 Invoice' }],
        [{ text: '💰 Earnings Summary' }, { text: '📊 Menu' }],
        [{ text: '❓ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }

  // Enhanced main menu with business features
  getMainMenuKeyboard(): TelegramBot.ReplyKeyboardMarkup {
    return {
      keyboard: [
        [{ text: '💰 Balance' }, { text: '👛 Wallet' }],
        [{ text: '💸 Send Crypto' }, { text: '🔗 Payment Link' }],
        [{ text: '📄 Invoice' }, { text: '📋 Proposal' }],
        [{ text: '💰 Earnings Summary' }, { text: '📊 Menu' }],
        [{ text: '❓ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }

  // Menu keyboard with business dashboard and other options
  getMenuKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '📊 Business Dashboard', callback_data: 'business_dashboard' }
        ],
        [
          { text: '💰 Earnings Summary', callback_data: 'transaction_history' },
          { text: '⚙️ Settings', callback_data: 'settings' }
        ],
        [
          { text: '🔙 Back to Main', callback_data: 'back_to_main' }
        ]
      ]
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
          { text: '🔄 Ongoing Creations', callback_data: 'ongoing_creations' },
          { text: '💰 Earnings Summary', callback_data: 'earnings_summary' }
        ],
        [
          { text: '🔙 Back to Menu', callback_data: 'main_menu' }
        ]
      ]
    };
  }

  // Handle menu
  async handleMenu(chatId: number) {
    const message = (
      `📊 *Menu*\n\n` +
      `Access business features and settings from here.\n\n` +
      `What would you like to do?`
    );

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: this.getMenuKeyboard()
    });
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
      // Get the actual user UUID if userId is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        }
      }

      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', actualUserId)
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
      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

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
      // Get the actual user UUID if userId is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        }
      }

      const { data: proposals, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('user_id', actualUserId)
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
      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

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
      // Get the actual user UUID if userId is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        }
      }

      // Use the enhanced business stats service with dynamic import
      const { getBusinessStats } = await import('../lib/earningsService');
      const stats = await getBusinessStats(actualUserId);

      const message = (
        `💰 *Payment Statistics*\n\n` +
        `📄 *Invoices:*\n` +
        `   Total: ${stats.invoices.total}\n` +
        `   Paid: ${stats.invoices.paid}\n` +
        `   Pending: ${stats.invoices.pending}\n` +
        `   Draft: ${stats.invoices.draft}\n` +
        `   Overdue: ${stats.invoices.overdue}\n` +
        `   Revenue: $${stats.invoices.revenue.toFixed(2)}\n\n` +
        `📋 *Proposals:*\n` +
        `   Total: ${stats.proposals.total}\n` +
        `   Accepted: ${stats.proposals.accepted}\n` +
        `   Pending: ${stats.proposals.pending}\n` +
        `   Draft: ${stats.proposals.draft}\n` +
        `   Rejected: ${stats.proposals.rejected}\n` +
        `   Total Value: $${stats.proposals.value.toFixed(2)}\n` +
        `   Revenue: $${stats.proposals.revenue.toFixed(2)}\n\n` +
        `💵 *Total Revenue: $${stats.totalRevenue.toFixed(2)}*`
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

  // Handle ongoing creations
  async handleOngoingCreations(chatId: number, userId: string) {
    try {
      // Get the actual user UUID if userId is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        }
      }

      // Check for ongoing invoice and proposal creations
      const { data: userStates } = await supabase
        .from('user_states')
        .select('state_type, state_data')
        .eq('user_id', actualUserId)
        .in('state_type', ['creating_invoice', 'creating_proposal']);

      const ongoingInvoice = userStates?.find(state => state.state_type === 'creating_invoice')?.state_data;
      const ongoingProposal = userStates?.find(state => state.state_type === 'creating_proposal')?.state_data;

      let message = '🔄 *Ongoing Creations*\n\n';
      const buttons: any[] = [];

      if (ongoingInvoice) {
        const step = ongoingInvoice.step || 'unknown';
        message += `📄 **Invoice Creation**\n`;
        message += `• Status: In progress (Step: ${step})\n`;
        message += `• Freelancer: ${ongoingInvoice.freelancer_name || 'Not set'}\n`;
        message += `• Client: ${ongoingInvoice.client_name || 'Not set'}\n`;
        message += `• Project: ${ongoingInvoice.project_description || 'Not set'}\n`;
        message += `• Amount: ${ongoingInvoice.amount ? `${ongoingInvoice.amount} ${ongoingInvoice.currency || 'USD'}` : 'Not set'}\n\n`;
        
        buttons.push([
          { text: '▶️ Continue Invoice', callback_data: 'continue_invoice' },
          { text: '❌ Cancel Invoice', callback_data: 'cancel_ongoing_invoice' }
        ]);
      }

      if (ongoingProposal) {
        const step = ongoingProposal.step || 'unknown';
        message += `📋 **Proposal Creation**\n`;
        message += `• Status: In progress (Step: ${step})\n`;
        message += `• Freelancer: ${ongoingProposal.freelancer_name || 'Not set'}\n`;
        message += `• Client: ${ongoingProposal.client_name || 'Not set'}\n`;
        message += `• Project: ${ongoingProposal.project_description || 'Not set'}\n`;
        message += `• Amount: ${ongoingProposal.amount ? `${ongoingProposal.amount} ${ongoingProposal.currency || 'USD'}` : 'Not set'}\n\n`;
        
        buttons.push([
          { text: '▶️ Continue Proposal', callback_data: 'continue_proposal' },
          { text: '❌ Cancel Proposal', callback_data: 'cancel_ongoing_proposal' }
        ]);
      }

      if (!ongoingInvoice && !ongoingProposal) {
        message += '✅ No ongoing creations found.\n\n';
        message += 'You can start creating a new invoice or proposal from the main menu.';
      }

      buttons.push([{ text: '🔙 Back to Dashboard', callback_data: 'business_dashboard' }]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons
        }
      });
    } catch (error) {
      console.error('Error handling ongoing creations:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to load ongoing creations.');
    }
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

  // Handle wallet creation
  async handleCreateWallet(chatId: number, userId: string) {
    try {
      // Send "wallet being created" message
      await this.bot.sendMessage(chatId, 
        `🏦 *Creating your wallets...*\n\n` +
        `Please wait while I set up your EVM and Solana wallets. This may take a few moments.`,
        { parse_mode: 'Markdown' }
      );

      // Ensure user exists in database first
      let actualUserId = userId;
      
      // If userId is just a chatId (numeric string), we need to ensure the user exists
      if (/^\d+$/.test(userId)) {
        console.log(`[BotIntegration] UserId ${userId} appears to be a chatId, ensuring user exists...`);
        
        // Check if user already exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (existingUser) {
          actualUserId = existingUser.id;
          console.log(`[BotIntegration] Found existing user with UUID: ${actualUserId}`);
        } else {
          // Create user using the get_or_create_telegram_user function
          console.log(`[BotIntegration] Creating new user for chatId: ${userId}`);
          const { data: newUserId, error: createError } = await supabase.rpc('get_or_create_telegram_user', {
            p_telegram_chat_id: parseInt(userId),
            p_telegram_username: null,
            p_name: null
          });
          
          if (createError || !newUserId) {
            console.error(`[BotIntegration] Failed to create user:`, createError);
            throw new Error('Failed to create user account');
          }
          
          actualUserId = newUserId;
          console.log(`[BotIntegration] Created new user with UUID: ${actualUserId}`);
        }
      }

      // Import createWallet function
      const { createWallet } = await import('../lib/cdp');

      // Create EVM wallet
      const evmWallet = await createWallet(actualUserId, 'evm');
      console.log(`[BotIntegration] EVM wallet created for user ${actualUserId}: ${evmWallet.address}`);

      // Create Solana wallet
      const solanaWallet = await createWallet(actualUserId, 'solana');
      console.log(`[BotIntegration] Solana wallet created for user ${actualUserId}: ${solanaWallet.address}`);

      // Send confirmation message with wallet addresses
      await this.bot.sendMessage(chatId, 
        `🎉 *Wallets Created Successfully!*\n\n` +
        `Your crypto wallets have been created and are ready to use:\n\n` +
        `🔷 *EVM Wallet (Base Network):*\n` +
        `\`${evmWallet.address}\`\n\n` +
        `🟣 *Solana Wallet:*\n` +
        `\`${solanaWallet.address}\`\n\n` +
        `You can now receive payments, check balances, and send crypto using these wallets!`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Check Balance', callback_data: 'check_balance' }]
            ]
          }
        }
      );

    } catch (error) {
      console.error('[BotIntegration] Error creating wallets:', error);
      
      await this.bot.sendMessage(chatId, 
        `❌ *Wallet Creation Failed*\n\n` +
        `Sorry, there was an error creating your wallets. Please try again later or contact support.\n\n` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'create_wallet' }]
            ]
          }
        }
      );
    }
   }

  // Handle balance check
  async handleCheckBalance(chatId: number, userId: string) {
    try {
      // Send "checking balance" message
      await this.bot.sendMessage(chatId, 
        `💰 *Checking your wallet balances...*\n\n` +
        `Please wait while I fetch your current balances.`,
        { parse_mode: 'Markdown' }
      );

      // First, get the actual user ID if this is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        // This looks like a chatId, get the user UUID
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        }
      }
      
      // Get user's wallets from database
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('user_id', actualUserId);
      
      if (error) {
        console.error('[BotIntegration] Error fetching wallets:', error);
        await this.bot.sendMessage(chatId, 
          `❌ *Failed to fetch wallet information*\n\nPlease try again later.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      if (!wallets || wallets.length === 0) {
        await this.bot.sendMessage(chatId, 
          `💡 *No wallets found*\n\nYou don't have any wallets yet. Use the 'Create Wallet' button to get started!`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🏦 Create Wallet', callback_data: 'create_wallet' }]
              ]
            }
          }
        );
        return;
      }
      
      // Import balance checking function
      const { getBalances } = await import('../lib/cdp');
      
      // Find EVM and Solana wallets
      const evmWallet = wallets.find(w => w.chain === 'evm');
      const solanaWallet = wallets.find(w => w.chain === 'solana');
      
      let response = `💰 *Your Wallet Balances*\n\n`;
      
      // Get EVM balances if wallet exists
      if (evmWallet) {
        try {
          const evmBalances = await getBalances(evmWallet.address, 'evm');
          
          response += `🔷 *EVM Wallet (Base Network):*\n`;
          if (evmBalances && Array.isArray(evmBalances) && evmBalances.length > 0) {
            evmBalances.forEach((balance: any) => {
              const amount = balance.amount || balance.balance || '0';
              const symbol = balance.asset?.symbol || balance.symbol || 'Unknown';
              response += `• ${amount} ${symbol}\n`;
            });
          } else {
            response += `• No balances found\n`;
          }
          response += `\n`;
        } catch (evmError) {
          console.error('[BotIntegration] Error fetching EVM balances:', evmError);
          response += `🔷 *EVM Wallet (Base Network):* Error fetching balances\n\n`;
        }
      }
      
      // Get Solana balances if wallet exists
      if (solanaWallet) {
        try {
          const solanaBalances = await getBalances(solanaWallet.address, 'solana');
          
          response += `🟣 *Solana Wallet:*\n`;
          if (solanaBalances && Array.isArray(solanaBalances) && solanaBalances.length > 0) {
            solanaBalances.forEach((balance: any) => {
              const amount = balance.amount || balance.balance || '0';
              const symbol = balance.asset?.symbol || balance.symbol || 'Unknown';
              response += `• ${amount} ${symbol}\n`;
            });
          } else {
            response += `• No balances found\n`;
          }
        } catch (solanaError) {
          console.error('[BotIntegration] Error fetching Solana balances:', solanaError);
          response += `🟣 *Solana Wallet:* Error fetching balances\n`;
        }
      }
      
      if (!evmWallet && !solanaWallet) {
        response = `💡 *No wallets found*\n\nYou don't have any wallets yet. Use the 'Create Wallet' button to get started!`;
      } else {
        response += `\nUse the menu below to send crypto or manage your wallets.`;
      }
      
      // Send balance information
      await this.bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💸 Send Crypto', callback_data: 'send_crypto' }]
          ]
        }
      });

    } catch (error) {
      console.error('[BotIntegration] Error checking balance:', error);
      
      await this.bot.sendMessage(chatId, 
        `❌ *Balance Check Failed*\n\n` +
        `Sorry, there was an error checking your wallet balances. Please try again later.\n\n` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'check_balance' }]
            ]
          }
        }
      );
    }
  }

  // Handle send crypto
  async handleSendCrypto(chatId: number, userId: string) {
    await this.bot.sendMessage(chatId, 
      `💸 *Send Crypto*\n\n` +
      `To send cryptocurrency, you can:\n\n` +
      `• Type naturally: "Send 10 USDC to alice@example.com"\n` +
      `• Use the format: "Send [amount] [token] to [recipient]"\n\n` +
      `Supported tokens: USDC, ETH, SOL\n` +
      `Recipients can be email addresses or wallet addresses.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Check Balance', callback_data: 'check_balance' }]
          ]
        }
      }
    );
  }

  // Handle payment link creation
  async handlePaymentLink(chatId: number, userId: string) {
    await this.bot.sendMessage(chatId, 
      `🔗 *Create Payment Link*\n\n` +
      `To create a payment link, you can:\n\n` +
      `• Type: "Create payment link for $50"\n` +
      `• Or: "Payment link for 25 USDC for web design"\n\n` +
      `I'll help you create a shareable payment link that others can use to pay you directly.`,
      {
        parse_mode: 'Markdown'
      }
    );
  }

  // Handle earnings summary with creative display
  async handleEarningsSummary(chatId: number, userId: string) {
    try {
      // Get the actual user UUID if userId is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        }
      }

      // Get earnings data from invoices and payment links
      const [invoicesResult, paymentLinksResult, proposalsResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('amount, currency, status, created_at, client_name')
          .eq('user_id', actualUserId)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_links')
          .select('amount, currency, status, created_at, title')
          .eq('user_id', actualUserId)
          .order('created_at', { ascending: false }),
        supabase
          .from('proposals')
          .select('amount, currency, status, created_at, client_name')
          .eq('user_id', actualUserId)
          .order('created_at', { ascending: false })
      ]);

      // Calculate earnings statistics
      const invoices = invoicesResult.data || [];
      const paymentLinks = paymentLinksResult.data || [];
      const proposals = proposalsResult.data || [];

      // Calculate totals
      let totalEarned = 0;
      let totalPending = 0;
      let totalProposed = 0;
      let paidInvoices = 0;
      let paidPaymentLinks = 0;
      let acceptedProposals = 0;

      // Process invoices
      invoices.forEach(invoice => {
        const amount = parseFloat(invoice.amount) || 0;
        if (invoice.status === 'paid') {
          totalEarned += amount;
          paidInvoices++;
        } else if (invoice.status === 'sent' || invoice.status === 'pending') {
          totalPending += amount;
        }
      });

      // Process payment links
      paymentLinks.forEach(link => {
        const amount = parseFloat(link.amount) || 0;
        if (link.status === 'paid') {
          totalEarned += amount;
          paidPaymentLinks++;
        } else if (link.status === 'active') {
          totalPending += amount;
        }
      });

      // Process proposals
      proposals.forEach(proposal => {
        const amount = parseFloat(proposal.amount) || 0;
        if (proposal.status === 'accepted') {
          acceptedProposals++;
        }
        totalProposed += amount;
      });

      // Create creative earnings message
      let message = '💰 *Your Earnings Dashboard* 🚀\n\n';
      
      // Earnings overview with emojis
      message += '┌─────────────────────────┐\n';
      message += '│  💎 *EARNINGS OVERVIEW*  │\n';
      message += '└─────────────────────────┘\n\n';

      if (totalEarned > 0) {
        message += `🎉 *Total Earned:* $${totalEarned.toFixed(2)} USDC\n`;
        message += `📈 *Success Rate:* ${Math.round(((paidInvoices + paidPaymentLinks) / Math.max(invoices.length + paymentLinks.length, 1)) * 100)}%\n\n`;
      } else {
        message += `🌱 *Getting Started:* $0.00 USDC\n`;
        message += `💡 *Ready to earn your first payment!*\n\n`;
      }

      // Breakdown section
      message += '📊 *BREAKDOWN*\n';
      message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      message += `💳 Paid Invoices: ${paidInvoices} ($${invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0).toFixed(2)})\n`;
      message += `🔗 Paid Links: ${paidPaymentLinks} ($${paymentLinks.filter(l => l.status === 'paid').reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0).toFixed(2)})\n`;
      message += `📋 Accepted Proposals: ${acceptedProposals}\n\n`;

      // Pending section
      if (totalPending > 0) {
        message += '⏳ *PENDING PAYMENTS*\n';
        message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += `💰 Awaiting: $${totalPending.toFixed(2)} USDC\n`;
        message += `📝 Items: ${invoices.filter(i => i.status === 'sent' || i.status === 'pending').length + paymentLinks.filter(l => l.status === 'active').length}\n\n`;
      }

      // Motivational section
      if (totalEarned === 0) {
        message += '🎯 *GET STARTED*\n';
        message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += '• Create your first invoice 📄\n';
        message += '• Generate a payment link 🔗\n';
        message += '• Send a proposal 📋\n';
        message += '• Start earning crypto! 💎\n';
      } else {
        message += '🔥 *KEEP GROWING*\n';
        message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        message += `• You're earning an average of $${(totalEarned / Math.max(paidInvoices + paidPaymentLinks, 1)).toFixed(2)} per payment\n`;
        message += '• Create more payment links for passive income\n';
        message += '• Follow up on pending payments\n';
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📄 My Invoices', callback_data: 'business_invoices' },
              { text: '🔗 Payment Links', callback_data: 'view_payment_links' }
            ],
            [
              { text: '📋 My Proposals', callback_data: 'business_proposals' },
              { text: '💰 Create Payment Link', callback_data: 'create_payment_link' }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('Error fetching earnings summary:', error);
      await this.bot.sendMessage(chatId, '❌ Error fetching earnings data. Please try again.');
    }
  }

  // Handle help
  async handleHelp(chatId: number) {
    await this.bot.sendMessage(chatId, 
      `❓ *Help & Support*\n\n` +
      `Here's what I can help you with:\n\n` +
      `💰 **Wallet Management**\n` +
      `• Check your balance\n` +
      `• View wallet addresses\n` +
      `• Create new wallets\n\n` +
      `💸 **Transactions**\n` +
      `• Send crypto to anyone\n` +
      `• Create payment links\n` +
      `• Generate invoices\n\n` +
      `📊 **Business Tools**\n` +
      `• Create proposals\n` +
      `• Track payments\n` +
      `• View transaction history\n\n` +
      `Just type naturally what you want to do, and I'll help you!`,
      {
        parse_mode: 'Markdown'
      }
    );
  }

  // Show welcome message with conditional wallet creation for new users
  async showWelcomeMessage(chatId: number) {
    try {
      // Check if user exists in database
      const { data: user } = await supabase
        .from('users')
        .select('id, evm_wallet_address, solana_wallet_address')
        .eq('telegram_chat_id', chatId)
        .single();

      const isNewUser = !user || (!user.evm_wallet_address && !user.solana_wallet_address);
      
      if (isNewUser) {
        // Show welcome message with Create Wallet button for new users
        await this.bot.sendMessage(chatId, 
          `🦉 Welcome to Hedwig!\n\n` +
          `I'm your freelance assistant that can help you create proposals, invoices, payment links, and send/receive payments in stablecoins.\n\n` +
          `Let's start by creating your crypto wallets:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔐 Create Wallet', callback_data: 'create_wallet' }]
              ]
            }
          }
        );
      } else {
        // Show main menu for existing users with persistent keyboard
        await this.bot.sendMessage(chatId, 
          `🦉 *Welcome back to Hedwig!*\n\n` +
          `I'm your AI assistant for crypto payments and wallet management.\n\n` +
          `Choose an option below or chat with me naturally!`,
          {
            parse_mode: 'Markdown',
            reply_markup: this.getPersistentKeyboard()
          }
        );
      }
    } catch (error) {
      console.error('Error in showWelcomeMessage:', error);
      // Fallback to main menu if there's an error
      await this.showMainMenu(chatId);
    }
  }

  // Show main menu
  async showMainMenu(chatId: number) {
    await this.bot.sendMessage(chatId, 
      `🦉 *Welcome to Hedwig!*\n\n` +
      `I'm your AI assistant for crypto payments and wallet management.\n\n` +
      `Choose an option below or chat with me naturally!`,
      {
        parse_mode: 'Markdown',
        reply_markup: this.getPersistentKeyboard()
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
      // Menu callbacks
      if (data === 'main_menu') {
        await this.handleMenu(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'back_to_main') {
        // Send main menu message
        await this.bot.sendMessage(chatId, 
          '🏠 *Welcome back to the main menu!*\n\nChoose an option below:', 
          { 
            parse_mode: 'Markdown',
            reply_markup: this.getPersistentKeyboard()
          }
        );
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'transaction_history') {
        await this.handleEarningsSummary(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'settings') {
        await this.handleBusinessSettings(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Business dashboard callbacks
      else if (data === 'business_dashboard') {
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
      } else if (data === 'ongoing_creations') {
        await this.handleOngoingCreations(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_settings') {
        await this.handleBusinessSettings(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;

      } else if (data === 'create_wallet') {
        await this.handleCreateWallet(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'check_balance') {
        await this.handleCheckBalance(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'send_crypto') {
        await this.handleSendCrypto(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'payment_link') {
        await this.handlePaymentLink(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'view_history') {
        await this.handleEarningsSummary(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'help') {
        await this.handleHelp(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Invoice module callbacks
      else if (data.startsWith('invoice_') || data.startsWith('view_invoice_') || data.startsWith('cancel_invoice_') || 
               data.startsWith('send_invoice_') || data.startsWith('pdf_invoice_') || 
               data.startsWith('edit_invoice_') || data.startsWith('delete_invoice_') ||
               data.startsWith('edit_client_') || data.startsWith('edit_project_') ||
               data.startsWith('edit_amount_') || data.startsWith('edit_due_date_') ||
               data.startsWith('confirm_delete_') || data.startsWith('continue_invoice_')) {
        // Get proper userId for cancel and continue operations
        if (data.startsWith('cancel_invoice_') || data.startsWith('continue_invoice_')) {
          const properUserId = await this.getUserIdByChatId(chatId);
          await this.invoiceModule.handleInvoiceCallback(callbackQuery, properUserId);
        } else {
          await this.invoiceModule.handleInvoiceCallback(callbackQuery);
        }
        return true;
      }
      // Ongoing creation specific callbacks
      else if (data.startsWith('continue_ongoing_') || data.startsWith('cancel_ongoing_')) {
        const properUserId = await this.getUserIdByChatId(chatId);
        
        if (data.startsWith('continue_ongoing_invoice_')) {
          const invoiceId = data.replace('continue_ongoing_invoice_', '');
          await this.handleContinueInvoice(chatId, properUserId, invoiceId);
        } else if (data.startsWith('cancel_ongoing_invoice_')) {
          const invoiceId = data.replace('cancel_ongoing_invoice_', '');
          await this.handleCancelOngoingInvoice(chatId, properUserId, invoiceId);
        } else if (data.startsWith('continue_ongoing_proposal_')) {
          const proposalId = data.replace('continue_ongoing_proposal_', '');
          await this.handleContinueProposal(chatId, properUserId, proposalId);
        } else if (data.startsWith('cancel_ongoing_proposal_')) {
          const proposalId = data.replace('cancel_ongoing_proposal_', '');
          await this.handleCancelOngoingProposal(chatId, properUserId, proposalId);
        }
        
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Proposal module callbacks
      else if (data.startsWith('proposal_') || data.startsWith('view_proposal_') || 
               data.startsWith('send_proposal_') || data.startsWith('pdf_proposal_') ||
               data.startsWith('edit_proposal_') || data.startsWith('delete_proposal_') ||
               data.startsWith('cancel_proposal_') || data.startsWith('continue_proposal_')) {
        // Get proper userId for cancel operations
        if (data.startsWith('cancel_proposal_') || data.startsWith('continue_proposal_')) {
          const properUserId = await this.getUserIdByChatId(chatId);
          await this.proposalModule.handleProposalCallback(callbackQuery, properUserId);
        } else {
          await this.proposalModule.handleProposalCallback(callbackQuery);
        }
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
      userId = await this.getUserIdByChatId(message.chat.id);
    }
    return this.handleBusinessMessage(message, userId);
  }

  // Helper function to get user UUID by chat ID
  private async getUserIdByChatId(chatId: number): Promise<string> {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .single();
    
    return data?.id || chatId.toString(); // Fallback to chatId if not found
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

        case '📊 Menu':
          await this.handleMenu(chatId);
          return true;

        case '💰 Balance':
          await this.handleCheckBalance(chatId, userId);
          return true;

        case '👛 Wallet':
          await this.handleCreateWallet(chatId, userId);
          return true;

        case '💸 Send Crypto':
          await this.handleSendCrypto(chatId, userId);
          return true;

        case '🔗 Payment Link':
          await this.handlePaymentLink(chatId, userId);
          return true;

        case '💰 Earnings Summary':
          await this.handleEarningsSummary(chatId, userId);
          return true;

        case '❓ Help':
          await this.handleHelp(chatId);
          return true;

        default:
          // Only check for ongoing flows if the message is not a natural language query
          // This prevents interference with AI processing
          const isNaturalLanguage = this.isNaturalLanguageQuery(text);
          
          if (!isNaturalLanguage) {
            // Check if user is in invoice creation flow
            console.log(`[BotIntegration] Checking for ongoing invoice for user ${userId}`);
            const ongoingInvoice = await this.getOngoingInvoice(userId);
            console.log(`[BotIntegration] Ongoing invoice found:`, ongoingInvoice);
            if (ongoingInvoice && message.text) {
              console.log(`[BotIntegration] Continuing invoice creation with input: ${message.text}`);
              await this.invoiceModule.continueInvoiceCreation(message.chat.id, userId, message.text);
              return true;
            }
            
            // Check if user is in proposal creation flow
            const ongoingProposal = await this.getOngoingProposal(userId);
            if (ongoingProposal) {
              await this.proposalModule.continueProposalCreation(message.chat.id, userId, ongoingProposal, message.text);
              return true;
            }
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
    console.log(`[BotIntegration] Querying user_states for userId: ${userId}`);
    const { data, error } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_invoice')
      .maybeSingle();
    
    console.log(`[BotIntegration] Query result - data:`, data);
    console.log(`[BotIntegration] Query result - error:`, error);
    
    if (error) {
      console.error(`[BotIntegration] Error querying user_states:`, error);
      return null;
    }
    
    return data?.state_data || null;
  }

  private async getOngoingProposal(userId: string) {
    const { data, error } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'creating_proposal')
      .maybeSingle();
    
    if (error) {
      console.error(`[BotIntegration] Error querying user_states for proposal:`, error);
      return null;
    }
    
    return data?.state_data || null;
  }

  // Helper method to detect natural language queries
  private isNaturalLanguageQuery(text: string): boolean {
    const lowerText = text.toLowerCase().trim();
    
    // Simple patterns that indicate natural language
    const naturalLanguagePatterns = [
      // Questions
      /^(what|how|when|where|why|who|can|could|would|should|is|are|do|does|did)/,
      // Requests with natural language structure
      /^(i want|i need|i would like|please|help me|show me|tell me|explain)/,
      // Commands with natural language
      /^(create|send|make|generate|get|check|view|show).*(for|to|with|my|the)/,
      // Conversational phrases
      /^(hello|hi|hey|thanks|thank you|ok|okay|yes|no|sure)/,
      // Multi-word natural sentences (more than 3 words with common sentence structure)
      /\b(and|or|but|because|since|although|however|therefore|moreover)\b/,
    ];

    // Check if it's a simple command or button text (not natural language)
    const simpleCommands = [
      '📄 invoice', '📋 proposal', '💰 balance', '👛 wallet',
      '💸 send crypto', '🔗 payment link', '💰 earnings summary', '❓ help',
      'invoice', 'proposal', 'balance', 'wallet', 'send', 'help',
      'create wallet', 'check balance', 'send crypto', 'payment link'
    ];

    // If it's a simple command, it's not natural language
    if (simpleCommands.some(cmd => lowerText === cmd)) {
      return false;
    }

    // If it matches natural language patterns, it's natural language
    if (naturalLanguagePatterns.some(pattern => pattern.test(lowerText))) {
      return true;
    }

    // If it's longer than 4 words and contains common words, likely natural language
    const words = lowerText.split(/\s+/);
    if (words.length > 4) {
      const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
      const hasCommonWords = words.some(word => commonWords.includes(word));
      if (hasCommonWords) {
        return true;
      }
    }

    // Default to false for short, simple inputs
    return false;
  }

  // Handler methods for ongoing creation operations
  private async handleContinueInvoice(chatId: number, userId: string, invoiceId: string) {
    try {
      // Get the ongoing invoice state
      const ongoingInvoice = await this.getOngoingInvoice(userId);
      if (ongoingInvoice && ongoingInvoice.invoiceId === invoiceId) {
        // Continue the invoice creation process
        await this.invoiceModule.continueInvoiceCreation(chatId, userId, '');
      } else {
        await this.bot.sendMessage(chatId, '❌ No ongoing invoice found with that ID.');
      }
    } catch (error) {
      console.error('Error continuing invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to continue invoice creation.');
    }
  }

  private async handleCancelOngoingInvoice(chatId: number, userId: string, invoiceId: string) {
    try {
      // Cancel the ongoing invoice creation
      await this.invoiceModule.cancelInvoice(chatId, invoiceId, userId);
      await this.bot.sendMessage(chatId, '❌ Invoice creation cancelled.');
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to cancel invoice creation.');
    }
  }

  private async handleContinueProposal(chatId: number, userId: string, proposalId: string) {
    try {
      // Get the ongoing proposal state
      const ongoingProposal = await this.getOngoingProposal(userId);
      if (ongoingProposal && ongoingProposal.proposalId === proposalId) {
        // Continue the proposal creation process
        await this.proposalModule.continueProposalCreation(chatId, userId, ongoingProposal, '');
      } else {
        await this.bot.sendMessage(chatId, '❌ No ongoing proposal found with that ID.');
      }
    } catch (error) {
      console.error('Error continuing proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to continue proposal creation.');
    }
  }

  private async handleCancelOngoingProposal(chatId: number, userId: string, proposalId: string) {
    try {
      // Cancel the ongoing proposal creation by calling the cancel method
      const callbackQuery = {
        id: 'ongoing_cancel',
        data: `cancel_proposal_${proposalId}`,
        message: { chat: { id: chatId } }
      } as TelegramBot.CallbackQuery;
      
      await this.proposalModule.handleProposalCallback(callbackQuery, userId);
      await this.bot.sendMessage(chatId, '❌ Proposal creation cancelled.');
    } catch (error) {
      console.error('Error cancelling proposal:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to cancel proposal creation.');
    }
  }
}