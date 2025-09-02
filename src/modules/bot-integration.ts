import TelegramBot from 'node-telegram-bot-api';
import { trackEvent } from '../lib/posthog';
import { handleAction } from '../api/actions';
import { createClient } from '@supabase/supabase-js';
import { handleCurrencyConversion } from '../lib/currencyConversionService';
import { InvoiceModule } from './invoices';
import { ProposalModule } from './proposals';
import { USDCPaymentModule } from './usdc-payments';
import { OfframpModule } from './offramp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class BotIntegration {
  private bot: TelegramBot;
  private invoiceModule: InvoiceModule;
  private proposalModule: ProposalModule;
  private usdcPaymentModule: USDCPaymentModule;
  private offrampModule: OfframpModule;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.invoiceModule = new InvoiceModule(bot);
    this.proposalModule = new ProposalModule(bot);
    this.usdcPaymentModule = new USDCPaymentModule(bot);
    this.offrampModule = new OfframpModule(bot);
  }

  // Handle earnings summary (deterministic path via earningsService)
  async handleEarningsSummary(chatId: number, userId: string, timeframe: 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime' = 'lastMonth') {
    try {
      // Resolve to actual user UUID if we received a numeric chatId
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

      // Get user's wallets to create filter
      const { data: wallets } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('user_id', actualUserId)
        .limit(1);
      
      if (!wallets || wallets.length === 0) {
        await this.bot.sendMessage(chatId, 
          `💡 *No wallets found*\n\nYou need a wallet to view earnings. Create one first!`,
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
      
      // Import earnings service
      const { getEarningsSummary, formatEarningsForAgent } = await import('../lib/earningsService');
      
      // Create filter object
      const filter = {
        walletAddress: wallets[0].address,
        timeframe: timeframe as 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime'
      };
      
      const summary = await getEarningsSummary(filter, true);
      const formattedSummary = formatEarningsForAgent(summary);
      
      await this.bot.sendMessage(chatId, formattedSummary, {
        parse_mode: 'Markdown'
      });
      
    } catch (error) {
      console.error('[BotIntegration] Error fetching earnings summary:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Error fetching earnings summary*\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

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
        } else {
          // User doesn't exist yet, show wallet creation prompt
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

      // Display wallet balances
      let balanceMessage = `💰 *Your Wallet Balances*\n\n`;
      
      for (const wallet of wallets) {
        try {
          const balance = await this.getWalletBalance(wallet.address, wallet.chain);
          balanceMessage += `${wallet.chain === 'evm' ? '🔷' : '🟣'} *${wallet.chain.toUpperCase()} Wallet:*\n`;
          balanceMessage += `Address: \`${wallet.address}\`\n`;
          balanceMessage += `Balance: ${balance}\n\n`;
        } catch (error) {
          console.error(`[BotIntegration] Error fetching balance for ${wallet.chain} wallet:`, error);
          balanceMessage += `${wallet.chain === 'evm' ? '🔷' : '🟣'} *${wallet.chain.toUpperCase()} Wallet:*\n`;
          balanceMessage += `Address: \`${wallet.address}\`\n`;
          balanceMessage += `Balance: Error fetching balance\n\n`;
        }
      }
      
      await this.bot.sendMessage(chatId, balanceMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'refresh_balance' }],
            [{ text: '💸 Send Crypto', callback_data: 'send_crypto' }]
          ]
        }
      });
      
    } catch (error) {
      console.error('[BotIntegration] Error checking balance:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Error checking balance*\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Handle viewing wallet addresses
  async handleViewWallet(chatId: number, userId: string) {
    try {
      // Send "fetching wallet info" message
      await this.bot.sendMessage(chatId, 
        `👛 *Fetching your wallet information...*\n\n` +
        `Please wait while I retrieve your wallet addresses.`,
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
        } else {
          // User doesn't exist yet, show wallet creation prompt
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

      // Display wallet addresses
      let walletMessage = `👛 *Your Wallet Addresses*\n\n`;
      
      for (const wallet of wallets) {
        walletMessage += `${wallet.chain === 'evm' ? '🔷' : '🟣'} *${wallet.chain.toUpperCase()} Wallet:*\n`;
        walletMessage += `\`${wallet.address}\`\n\n`;
      }
      
      walletMessage += `💡 *Tip:* You can use these addresses to receive crypto payments!`;
      
      await this.bot.sendMessage(chatId, walletMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Check Balance', callback_data: 'check_balance' }],
            [{ text: '💸 Send Crypto', callback_data: 'send_crypto' }]
          ]
        }
      });
      
    } catch (error) {
      console.error('[BotIntegration] Error viewing wallet:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Error fetching wallet information*\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Handle earnings summary with wallet-based filtering
  async handleEarningsWithWallet(chatId: number, userId: string, timeframe: 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime' = 'lastMonth') {
    try {
      // First, get the actual user ID if this is a chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (user) {
          actualUserId = user.id;
        } else {
          await this.bot.sendMessage(chatId,
            '💡 You don\'t have a wallet yet. Create one to start tracking your earnings.',
            {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: '🔐 Create Wallet', callback_data: 'create_wallet' }]] }
            }
          );
          return;
        }
      }

      // Find user's wallets
      const { data: wallets, error: walletsError } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('user_id', actualUserId);

      if (walletsError) {
        console.error('[BotIntegration] Error fetching wallets for earnings:', walletsError);
        await this.bot.sendMessage(chatId, '❌ Failed to fetch your wallets. Please try again later.');
        return;
      }

      if (!wallets || wallets.length === 0) {
        await this.bot.sendMessage(chatId,
          '💡 You don\'t have a wallet yet. Create one to start tracking your earnings.',
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '🔐 Create Wallet', callback_data: 'create_wallet' }]] }
          }
        );
        return;
      }

      // Prefer EVM wallet if present, else use the first wallet
      const evm = wallets.find(w => w.chain === 'evm');
      const walletAddress = (evm || wallets[0]).address;

      // Import earnings service dynamically
      const { getEarningsSummary, formatEarningsForAgent } = await import('../lib/earningsService');

      // Build filter and fetch summary with insights
      const filter = { walletAddress, timeframe } as const;
      const summary = await getEarningsSummary(filter, true);

      // Format message
      const message = formatEarningsForAgent(summary, 'earnings');

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🗓️ 7d', callback_data: 'earnings_tf_last7days' },
              { text: '📅 30d', callback_data: 'earnings_tf_lastMonth' },
              { text: '🗂️ 3m', callback_data: 'earnings_tf_last3months' },
              { text: '🕰️ All', callback_data: 'earnings_tf_allTime' }
            ],
            [{ text: '🔙 Back', callback_data: 'business_dashboard' }]
          ]
        }
      });
      
    } catch (error) {
      console.error('[BotIntegration] Error fetching earnings with wallet:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Error fetching earnings*\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
   }

  // Handle create wallet flow
  async handleCreateWallet(chatId: number, userId: string) {
    try {
      // Send "wallet being created" message
      await this.bot.sendMessage(chatId, 
        `🏦 *Creating your wallet...*\n\n` +
        `Please wait while I set up your new crypto wallet.`,
        { parse_mode: 'Markdown' }
      );

      // Resolve to actual user UUID if we received a numeric chatId
      let actualUserId = userId;
      if (/^\d+$/.test(userId)) {
        // This looks like a chatId, check if user exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_chat_id', parseInt(userId))
          .single();
        
        if (existingUser) {
          actualUserId = existingUser.id;
        } else {
          // Create new user
          const { data: newUser } = await supabase.rpc('get_or_create_telegram_user', {
            telegram_user_id: parseInt(userId),
            telegram_chat_id: parseInt(userId)
          });
          
          if (newUser) {
            actualUserId = newUser.id;
            
            // Track user creation in PostHog
            await trackEvent('user_created', {
              user_id: actualUserId,
              telegram_user_id: parseInt(userId),
              context: 'wallet_creation',
              user_type: 'telegram',
              created_via: 'bot_integration'
            });
          }
        }
      }

      // Create wallets using the actual user UUID
      const result = await handleAction('create_wallet', {}, actualUserId);
      
      if (result && result.text) {
        await this.bot.sendMessage(chatId, result.text, {
          parse_mode: 'Markdown',
          reply_markup: result.reply_markup || {
            inline_keyboard: [
              [{ text: '💰 Check Balance', callback_data: 'check_balance' }],
              [{ text: '👛 View Wallet', callback_data: 'view_wallet' }]
            ]
          }
        });
      } else {
        await this.bot.sendMessage(chatId, 
          `❌ *Wallet creation failed*\n\n${result?.text || 'Unknown error'}`,
          { parse_mode: 'Markdown' }
        );
      }
      
    } catch (error) {
      console.error('[BotIntegration] Error creating wallet:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Error creating wallet*\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async processWithAI(message: any, intent?: string) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text;

    try {
      // Fallback to 'unknown' when no explicit intent is provided.
      // handleAction includes text-based matching for common intents.
      const intentStr = intent ?? 'unknown';
      const result = await handleAction(intentStr, { text }, userId);

      if (result) {
        await this.bot.sendMessage(chatId, result.text, {
          reply_markup: result.reply_markup as any,
          parse_mode: 'Markdown',
        });
      }
       
    } catch (error) {
      console.error('[BotIntegration] Error processing with AI:', error);
      await this.bot.sendMessage(chatId, 
        `❌ *Error processing your request*\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Helper method to get wallet balance
  private async getWalletBalance(address: string, chain: string): Promise<string> {
    try {
      // Import the balance checking functions
      const { getBalances } = await import('../lib/cdp');
      
      if (chain === 'evm') {
        const balances = await getBalances(address, 'evm');
        if (balances && Array.isArray(balances) && balances.length > 0) {
          return balances.map((b: any) => `${b.amount || b.balance || '0'} ${b.asset?.symbol || b.symbol || 'ETH'}`).join(', ');
        }
        return '0 ETH';
      } else if (chain === 'solana') {
        // For now, return a placeholder for Solana
        return 'Solana balance check coming soon';
      }
      
      return 'Unknown chain';
    } catch (error) {
      console.error(`[BotIntegration] Error fetching balance for ${chain}:`, error);
      return 'Error fetching balance';
    }
  }



  // Get persistent keyboard for all messages
  getPersistentKeyboard() {
    return {
      keyboard: [
        [{ text: '💰 Balance' }, { text: '👛 Wallet' }],
        [{ text: '💸 Send Crypto' }, { text: '🔗 Payment Link' }],
        [{ text: '📝 Proposal' }, { text: '🧾 Invoice' }],
        [{ text: '💱 Offramp' }, { text: '📊 View History' }],
        [{ text: '❓ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true
    };
  }

  // Enhanced main menu with business features
  getMainMenuKeyboard(): TelegramBot.ReplyKeyboardMarkup {
    return {
      keyboard: [
        [{ text: '💰 Balance' }, { text: '👛 Wallet' }],
        [{ text: '💸 Send Crypto' }, { text: '🔗 Payment Link' }],
        [{ text: '📄 Invoice' }, { text: '📋 Proposal' }],
        [{ text: '💱 Offramp' }, { text: '📊 Business Dashboard' }],
        [{ text: '💰 Earnings Summary' }, { text: '❓ Help' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true

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
          { text: '💰 Payment Stats', callback_data: 'business_stats' }
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
        const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency || 'USD' }).format(invoice.total_amount);
        
        let invoiceMessage = `${status} *${invoice.invoice_number}* - ${amount}\n`;
        invoiceMessage += `   Client: ${invoice.client_name}\n`;
        invoiceMessage += `   Created: ${new Date(invoice.created_at).toLocaleDateString()}`;

        // Add buttons for each invoice
        keyboard.push([
          {
            text: `View Details`,
            callback_data: `view_invoice_${invoice.id}`
          },
          {
            text: `❌ Delete`,
            callback_data: `delete_invoice_${invoice.id}`
          }
        ]);

        message += invoiceMessage + '\n\n';
      }

      // Add a back button
      keyboard.push([{
        text: '🔙 Back to Dashboard',
        callback_data: 'business_dashboard'
      }]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

    } catch (error) {
      console.error('Error handling invoice list:', error);
      await this.bot.sendMessage(chatId, '❌ An error occurred while fetching your invoices. Please try again later.');
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

  // Handle Offramp command
  async handleOfframp(msg: TelegramBot.Message) {
    if (!msg.from) {
      console.error('[BotIntegration] Received /offramp command without a user context.');
      await this.bot.sendMessage(msg.chat.id, '❌ Something went wrong, user not identified.');
      return;
    }
    // Use the new actions-based offramp flow
    try {
      const result = await handleAction('offramp', {
        chatId: msg.chat.id,
        chain: 'base' // Default to base chain
      }, msg.from.id.toString());
      
      // Send the result back to Telegram
      await this.bot.sendMessage(msg.chat.id, result.text, {
        parse_mode: 'Markdown',
        reply_markup: result.reply_markup
      });
    } catch (error) {
      console.error('[BotIntegration] Error starting offramp flow:', error);
      await this.bot.sendMessage(msg.chat.id, '❌ Failed to start offramp flow. Please try again.');
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


  /**
   * Check if user has email and request it if missing (for new users after wallet creation)
   */
  async checkAndRequestEmailForNewUser(chatId: number, userId: string) {
    try {
      // Get user data to check if email exists
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name, telegram_first_name')
        .eq('id', userId)
        .single();

      if (error || !user) {
        console.error('[BotIntegration] Error fetching user for email check:', error);
        return;
      }

      // If email is missing, request it
      if (!user.email) {
        const userName = user.name || user.telegram_first_name || 'there';
        await this.requestUserEmail(chatId, userName);
      }
    } catch (error) {
      console.error('[BotIntegration] Error checking user email:', error);
    }
  }

  /**
   * Request email from user
   */
  async requestUserEmail(chatId: number, userName: string) {
    try {
      // Set user state to awaiting email
      await supabase
        .from('sessions')
        .upsert({
          user_id: chatId.toString(),
          context: { awaiting_email: true },
          updated_at: new Date().toISOString()
        });

      // Send email request message
      await this.bot.sendMessage(chatId,
        `📧 *Email Setup Required*\n\n` +
        `Hi ${userName}! To get the most out of Hedwig, please provide your email address.\n\n` +
        `This will allow you to:\n` +
        `• Receive invoice notifications\n` +
        `• Get payment confirmations\n` +
        `• Access your payment history\n\n` +
        `Please enter your email address:`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('[BotIntegration] Error requesting user email:', error);
    }
   }

   /**
    * Handle email collection from user input
    */
   async handleEmailCollection(chatId: number, messageText: string): Promise<boolean> {
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
         await this.bot.sendMessage(chatId, '❌ Please enter a valid email address (e.g., john@example.com):');
         return true; // Handled, but invalid
       }

       const email = messageText.trim().toLowerCase();

       // Update user with email
       const { error: updateError } = await supabase
         .from('users')
         .update({ email })
         .eq('telegram_chat_id', chatId);

       if (updateError) {
         console.error('[BotIntegration] Error updating user email:', updateError);
         await this.bot.sendMessage(chatId, '❌ Failed to save your email. Please try again.');
         return true;
       }

       // Clear session state
       await supabase
         .from('sessions')
         .update({ context: {} })
         .eq('user_id', chatId.toString());

       // Send confirmation message
       await this.bot.sendMessage(chatId,
         `✅ *Email Saved Successfully!*\n\n` +
         `Your email address \`${email}\` has been saved.\n\n` +
         `You'll now receive:\n` +
         `• Invoice notifications\n` +
         `• Payment confirmations\n` +
         `• Important updates\n\n` +
         `You can now use all of Hedwig's features! 🎉`,
         { parse_mode: 'Markdown' }
       );

       return true;
     } catch (error) {
       console.error('[BotIntegration] Error handling email collection:', error);
       return false;
     }
   }

   /**
    * Handle user info editing input
    */
   async handleUserInfoEditInput(chatId: number, userId: string, text: string): Promise<boolean> {
     try {
       // Check if user is in user info editing state for invoices
       const { data: invoiceState } = await supabase
         .from('user_states')
         .select('state_data')
         .eq('user_id', userId)
         .eq('state_type', 'creating_invoice')
         .single();

       if (invoiceState?.state_data?.editing_user_info && invoiceState.state_data.step?.startsWith('edit_user_')) {
         const field = invoiceState.state_data.step.replace('edit_user_', '');
         const result = await this.invoiceModule.handleUserInfoEditInput(chatId, userId, field, text);
         
         // If result is a string, it means there was an error or validation issue
         if (typeof result === 'string') {
           await this.bot.sendMessage(chatId, result);
         }
         
         return true;
       }

       // Check if user is in user info editing state for proposals
       const { data: proposalState } = await supabase
         .from('user_states')
         .select('state_data')
         .eq('user_id', userId)
         .eq('state_type', 'editing_user_info')
         .single();

       if (proposalState?.state_data?.context === 'proposal' && proposalState.state_data.field) {
         const field = proposalState.state_data.field;
         const result = await this.proposalModule.handleUserInfoEditInput(chatId, userId, field, text);
         
         // If result is a string, it means there was an error or validation issue
         if (typeof result === 'string') {
           await this.bot.sendMessage(chatId, result);
         }
         
         return true;
       }

       return false;
     } catch (error) {
       console.error('[BotIntegration] Error handling user info edit input:', error);
       return false;
     }
   }

    /**
     * Handle name collection from user input
     */
    async handleNameCollection(chatId: number, messageText: string): Promise<boolean> {
      try {
        // Check if user is in name collection state
        const { data: session, error: sessionError } = await supabase
          .from('sessions')
          .select('context')
          .eq('user_id', chatId.toString())
          .single();

        if (sessionError || !session?.context?.awaiting_name) {
          return false; // Not in name collection state
        }

        // Validate name (basic validation - not empty and reasonable length)
        const name = messageText.trim();
        if (name.length < 2 || name.length > 50) {
          await this.bot.sendMessage(chatId, '❌ Please enter a valid name (2-50 characters):');
          return true; // Handled, but invalid
        }

        // Update user with name
        const { error: updateError } = await supabase
          .from('users')
          .update({ name })
          .eq('telegram_chat_id', chatId);

        if (updateError) {
          console.error('[BotIntegration] Error updating user name:', updateError);
          await this.bot.sendMessage(chatId, '❌ Failed to save your name. Please try again.');
          return true;
        }

        // Clear session state
        await supabase
          .from('sessions')
          .update({ context: {} })
          .eq('user_id', chatId.toString());

        // Send confirmation message
        await this.bot.sendMessage(chatId,
          `✅ *Name Saved Successfully!*\n\n` +
          `Hello ${name}! Your name has been saved.\n\n` +
          `This will be used for:\n` +
          `• Invoice creation\n` +
          `• Professional communications\n` +
          `• Personalized experience\n\n` +
          `You can now continue using Hedwig! 🎉`,
          { parse_mode: 'Markdown' }
        );

        return true;
      } catch (error) {
        console.error('[BotIntegration] Error handling name collection:', error);
        return false;
      }
    }

    /**
     * Check if user needs to provide name before using features
     */
    async checkNameRequiredForUser(chatId: number, userId: string, messageText: string): Promise<boolean> {
      try {
        // Skip name check for basic commands that don't require name
        const basicCommands = ['/start', '/help', '❓ Help', '👛 Wallet', '💰 Balance'];
        if (basicCommands.includes(messageText)) {
          return false;
        }

        // Get user data to check if name exists
        const { data: user, error } = await supabase
          .from('users')
          .select('id, name, email, telegram_first_name, created_at')
          .eq('telegram_chat_id', chatId)
          .single();

        if (error || !user) {
          console.error('[BotIntegration] Error fetching user for name check:', error);
          return false;
        }

        // If user has name, no need to request it
        if (user.name && user.name.trim() !== '') {
          return false;
        }

        // Check if user has been using the bot for a while (has wallets or invoices)
        const { data: wallets } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        // If user has wallets but no name, request name for advanced features
        if (wallets && wallets.length > 0) {
          await this.requestUserName(chatId, user.telegram_first_name);
          return true;
        }

        // For advanced features like invoices and proposals, require name
        const advancedFeatures = ['📄 Invoice', '📋 Proposal', '📊 Business Dashboard', '🔗 Payment Link'];
        if (advancedFeatures.includes(messageText)) {
          await this.requestUserName(chatId, user.telegram_first_name);
          return true;
        }

        return false;
      } catch (error) {
        console.error('[BotIntegration] Error checking name requirement:', error);
        return false;
      }
    }

    /**
     * Request user name
     */
    async requestUserName(chatId: number, telegramFirstName?: string): Promise<void> {
      try {
        // Set session state to awaiting name
        await supabase
          .from('sessions')
          .upsert({
            user_id: chatId.toString(),
            context: { awaiting_name: true }
          });

        const greeting = telegramFirstName ? `Hi ${telegramFirstName}!` : 'Hello!';
        
        await this.bot.sendMessage(chatId,
          `${greeting} 👋\n\n` +
          `To use advanced features like invoices and proposals, I need to know your full name.\n\n` +
          `This will be used for professional communications and invoice creation.\n\n` +
          `*Please enter your full name:*`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[BotIntegration] Error requesting user name:', error);
      }
    }

    /**
     * Check and request name for new users
     */
    async checkAndRequestNameForNewUser(chatId: number, userId: string): Promise<void> {
      try {
        // Get user data to check if name exists
        const { data: user, error } = await supabase
          .from('users')
          .select('name, telegram_first_name')
          .eq('id', userId)
          .single();

        if (error || !user) {
          console.error('[BotIntegration] Error fetching user for name check:', error);
          return;
        }

        // If user already has a name, no need to request it
        if (user.name && user.name.trim() !== '') {
          return;
        }

        // Request name for new user
        await this.requestUserName(chatId, user.telegram_first_name);
      } catch (error) {
        console.error('[BotIntegration] Error checking name for new user:', error);
      }
    }

    /**
     * Check if existing user needs to provide email before using features
     */
    async checkEmailRequiredForExistingUser(chatId: number, messageText: string): Promise<boolean> {
      try {
        // Skip email check for basic commands that don't require email
        const basicCommands = ['/start', '/help', '❓ Help', '👛 Wallet', '💰 Balance'];
        if (basicCommands.includes(messageText)) {
          return false;
        }

        // Get user data to check if email exists
        const { data: user, error } = await supabase
          .from('users')
          .select('id, email, name, telegram_first_name, created_at')
          .eq('telegram_chat_id', chatId)
          .single();

        if (error || !user) {
          console.error('[BotIntegration] Error fetching user for email check:', error);
          return false;
        }

        // If user has email, no need to request it
        if (user.email) {
          return false;
        }

        // Check if user has been using the bot for a while (has wallets or invoices)
        const { data: wallets } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        // If user has wallets but no email, request email for advanced features
        if (wallets && wallets.length > 0) {
          const userName = user.name || user.telegram_first_name || 'there';
          await this.bot.sendMessage(chatId,
            `📧 *Email Required*\n\n` +
            `Hi ${userName}! To use this feature, please provide your email address first.\n\n` +
            `This helps us:\n` +
            `• Send you important notifications\n` +
            `• Keep your account secure\n` +
            `• Provide better support\n\n` +
            `Please enter your email address:`,
            { parse_mode: 'Markdown' }
          );

          // Set user state to awaiting email
          await supabase
            .from('sessions')
            .upsert({
              user_id: chatId.toString(),
              context: { awaiting_email: true },
              updated_at: new Date().toISOString()
            });

          return true;
        }

        return false;
      } catch (error) {
        console.error('[BotIntegration] Error checking email requirement:', error);
        return false;
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

  private async getLastPaymentLink(userId: string) {
    const { data } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'last_payment_link')
      .maybeSingle();
    return data?.state_data || null;
  }

  private async setLastPaymentLink(userId: string, paymentLinkData: any) {
    // Upsert the last payment link context for the user
    await supabase
      .from('user_states')
      .upsert([
        {
          user_id: userId,
          state_type: 'last_payment_link',
          state_data: paymentLinkData
        }
      ], { onConflict: 'user_id,state_type' });
  }

  // --- Payment Link Creation Handler ---
  async handlePaymentLink(chatId: number, userId: string) {
    await this.bot.sendMessage(chatId, 
      `🔗 *Create Payment Link*\n\n` +
      `To create a payment link, you can:\n\n` +
      `• Type: "Create payment link for $50"\n` +
      `• Or: "Payment link for 25 USDC for web design"\n\n` +
      `I'll help you create a shareable payment link that others can use to pay you directly.\n\n` +
      `ℹ️ *Note:* A 1% platform fee will be deducted from payments to support our services.`,
      {
        parse_mode: 'Markdown'
      }
    );
    // (In the full flow, after payment link is created, call this.proactiveOfferPaymentLinkEmail)
  }

  // Call this after payment link is created (with paymentLinkData)
  async proactiveOfferPaymentLinkEmail(chatId: number, userId: string, paymentLinkData: any) {
    // Track last payment link
    await this.setLastPaymentLink(userId, paymentLinkData);
    // If recipient email is not present, proactively offer to send by email
    if (!paymentLinkData.recipientEmail) {
      await this.bot.sendMessage(chatId,
        `Would you like me to send this payment link by email to your client?\n\n` +
        `Reply with their email address or type 'no'.\n\n` +
        `🔗 ${paymentLinkData.paymentLink}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      // If already has recipient email, optionally confirm sent
      await this.bot.sendMessage(chatId,
        `✅ Payment link created and sent to ${paymentLinkData.recipientEmail} by email.\n\n` +
        `🔗 ${paymentLinkData.paymentLink}`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // ...rest of BotIntegration class remains unchanged for now


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
      `💱 **Currency Tools**\n` +
      `• Check USD/NGN/KES rates\n` +
      `• Convert between currencies\n` +
      `• Example: \"What's 100 USD in NGN?\"\n\n` +
      `Just type naturally what you want to do, or use the menu below!`,
      {
        parse_mode: 'Markdown',
        reply_markup: this.getPersistentKeyboard()
      }
    );
  }
  
  // Currency conversion temporarily disabled
  async handleCurrencyRate(chatId: number, query?: string) {
    await this.bot.sendMessage(chatId, 
      '⚠️ *Currency Conversion Disabled*\n\n' +
      'The currency conversion feature is currently unavailable.\n\n' +
      'Please check back later or contact support if you need assistance.',
      { parse_mode: 'Markdown' }
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
          `🦉 Hi, I'm Hedwig!\n\n` +
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
          `🦉 *Welcome back buddy!*\n\n` +
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
  // PostHog: Track callback actions
  if (callbackQuery.data && callbackQuery.message) {
    trackEvent('bot_callback', {
      callback_data: callbackQuery.data,
      userId: userId || callbackQuery.message.chat.id,
      chatId: callbackQuery.message.chat.id
    });
  }
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
      } else if (data === 'check_balance') {
        await this.handleCheckBalance(chatId, userId);
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
      } else if (data.startsWith('offramp_')) {
        // Use the new actions-based offramp callback handling
        try {
          const result = await handleAction('offramp_callback', {
           chatId: chatId,
           callbackData: data,
           messageId: callbackQuery.message?.message_id
         }, userId || callbackQuery.from.id.toString());
         
         // Send the result back to Telegram
         await this.bot.sendMessage(chatId, result.text, {
           parse_mode: 'Markdown',
           reply_markup: result.reply_markup
         });
        } catch (error) {
          console.error('[BotIntegration] Error handling offramp callback:', error);
          await this.bot.sendMessage(chatId, '❌ Failed to process offramp action. Please try again.');
        }
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;

      } else if (data === 'create_wallet') {
        await this.handleCreateWallet(chatId, userId);
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
        // Simulate a message object to pass to the AI processor
        const fakeMessage = {
          chat: { id: chatId },
          from: { id: userId },
          text: '/earnings_summary',
        } as any;
        await this.processWithAI(fakeMessage, 'earnings_summary');
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'help') {
        await this.handleHelp(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'refresh_balance' || data === 'check_balance') {
        await this.handleCheckBalance(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Invoice module callbacks
      else if (data.startsWith('invoice_') || data.startsWith('view_invoice_') || data.startsWith('cancel_invoice_') || 
               data.startsWith('send_invoice_') || data.startsWith('pdf_invoice_') || 
               data.startsWith('edit_invoice_') || data.startsWith('delete_invoice_') ||
               data.startsWith('edit_client_') || data.startsWith('edit_project_') ||
               data.startsWith('edit_amount_') || data.startsWith('edit_due_date_') ||
               data.startsWith('confirm_delete_') || data.startsWith('edit_user_info_') ||
               data.startsWith('edit_user_name_') || data.startsWith('edit_user_email_') ||
               data.startsWith('continue_invoice_creation_') || data === 'cancel_invoice_creation') {
        // Get proper userId for cancel operations
        if (data.startsWith('cancel_invoice_')) {
          const properUserId = await this.getUserIdByChatId(chatId);
          await this.invoiceModule.handleInvoiceCallback(callbackQuery, properUserId);
        } else {
          await this.invoiceModule.handleInvoiceCallback(callbackQuery);
        }
        return true;
      }
      // Proposal module callbacks
      else if (data.startsWith('proposal_') || data.startsWith('view_proposal_') || 
               data.startsWith('send_proposal_') || data.startsWith('pdf_proposal_') ||
               data.startsWith('edit_proposal_') || data.startsWith('delete_proposal_') ||
               data.startsWith('cancel_proposal_') || data === 'continue_proposal' ||
               data === 'edit_user_info' || data === 'edit_user_field_name' ||
               data === 'edit_user_field_email' || data === 'back_to_proposal' ||
               data === 'cancel_user_edit' || data === 'cancel_proposal_creation') {
        await this.proposalModule.handleProposalCallback(callbackQuery, userId);
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
  async getUserIdByChatId(chatId: number): Promise<string> {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .single();
    
    return data?.id || chatId.toString(); // Fallback to chatId if not found
  }

  async handleBusinessMessage(message: TelegramBot.Message, userId: string) {
  // PostHog: Track every message command
  if (message.text) {
    trackEvent('bot_command', { command: message.text, userId, chatId: message.chat.id });
  }
    const chatId = message.chat.id;
    const text = message.text;

    if (!text) return false;

    try {
      // Check if user is in email collection state
      const emailHandled = await this.handleEmailCollection(chatId, text);
      if (emailHandled) {
        return true;
      }

      // Check if user is in name collection state
      const nameHandled = await this.handleNameCollection(chatId, text);
      if (nameHandled) {
        return true;
      }

      // Check if user is in user info editing state
      const userInfoEditHandled = await this.handleUserInfoEditInput(chatId, userId, text);
      if (userInfoEditHandled) {
        return true;
      }

      // Check if user needs to provide name before using features
      const nameRequired = await this.checkNameRequiredForUser(chatId, userId, text);
      if (nameRequired) {
        return true;
      }

      // Check if existing user needs to provide email before using features
      const emailRequired = await this.checkEmailRequiredForExistingUser(chatId, text);
      if (emailRequired) {
        return true;
      }

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

        case '💰 Balance':
          await this.handleCheckBalance(chatId, userId);
          return true;

        case '👛 Wallet':
          await this.handleViewWallet(chatId, userId);
          return true;

        case '💸 Send Crypto':
          await this.handleSendCrypto(chatId, userId);
          return true;

        case '🔗 Payment Link':
          await this.handlePaymentLink(chatId, userId);
          return true;
          
        case '💱 Offramp':
        case '💱 Withdraw':
        case '/offramp':
        case '/withdraw': {
          // Use the new actions-based offramp flow
          try {
            const result = await handleAction('offramp', {
             chatId: chatId,
             chain: 'base' // Default to base chain
           }, userId);
           
           // Send the result back to Telegram
           await this.bot.sendMessage(chatId, result.text, {
             parse_mode: 'Markdown',
             reply_markup: result.reply_markup
           });
          } catch (error) {
            console.error('[BotIntegration] Error starting offramp flow:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to start offramp flow. Please try again.');
          }
          return true;
        }

        case '💰 Earnings Summary':
          // Simulate a message object to pass to the AI processor
        const fakeMessage = {
          chat: { id: chatId },
          from: { id: userId },
          text: '/earnings_summary',
        } as any;
        await this.processWithAI(fakeMessage, 'earnings_summary');
          return true;

        case '❓ Help':
          await this.handleHelp(chatId);
          return true;

        case '/rate':
          await this.handleCurrencyRate(chatId, message.text?.split(' ').slice(1).join(' '));
          return true;

        case 'cancel proposal':
        // Handle cancellation of ongoing proposal creation
        const ongoingProposal = await this.getOngoingProposal(userId);
        if (ongoingProposal) {
          const { proposal_id } = ongoingProposal;
          await this.proposalModule.cancelProposalCreation(chatId, proposal_id, userId);
          return true;
        } else {
          await this.bot.sendMessage(chatId, 'No ongoing proposal creation found to cancel.');
          return true;
        }

        case 'cancel invoice': {
          // Handle cancellation of ongoing invoice creation
          const ongoingInvoice = await this.getOngoingInvoice(userId);
          if (ongoingInvoice) {
            const { invoice_id } = ongoingInvoice;
            await this.invoiceModule.cancelInvoiceCreation(chatId, invoice_id, userId);
            return true;
          } else {
            await this.bot.sendMessage(chatId, 'No ongoing invoice creation found to cancel.');
            return true;
          }
        }
        default: {
          // Always check for ongoing invoice/proposal/offramp flows first, regardless of message type
          const ongoingInvoice = await this.getOngoingInvoice(userId);
          if (ongoingInvoice && message.text) {
            console.log(`[BotIntegration] [FLOW] Continuing invoice creation for user ${userId} with input: ${message.text}`);
            await this.invoiceModule.continueInvoiceCreation(message.chat.id, userId, message.text);
            return true;
          }
          const ongoingProposal = await this.getOngoingProposal(userId);
          if (ongoingProposal && message.text) {
            console.log(`[BotIntegration] [FLOW] Continuing proposal creation for user ${userId} with input: ${message.text}`);
            await this.proposalModule.continueProposalCreation(message.chat.id, userId, ongoingProposal, message.text);
            return true;
          }
          // Check for active offramp session using the new session service
          const { offrampSessionService } = await import('../services/offrampSessionService');
          const activeOfframpSession = await offrampSessionService.getActiveSession(userId);
          if (activeOfframpSession) {
            console.log(`[BotIntegration] [FLOW] Continuing active offramp session for user ${userId}`);
            // Route to the actions-based offramp handler
            const { handleAction } = await import('../api/actions');
            const result = await handleAction('offramp', { text: message.text }, userId);
            if (result) {
              await this.bot.sendMessage(message.chat.id, result.text, {
                reply_markup: result.reply_markup as any,
                parse_mode: 'Markdown',
              });
            }
            return true;
          }
          
          // Also check for legacy offramp state and clean it up
          const ongoingOfframp = await this.getOngoingOfframp(userId);
          if (ongoingOfframp) {
            console.log(`[BotIntegration] [FLOW] Cleaning up legacy offramp state for user ${userId}`);
            try {
              // Clear any lingering legacy state
              await supabase
                .from('user_states')
                .delete()
                .eq('user_id', userId)
                .eq('state_type', 'offramp');
            } catch (e) {
              console.warn('[BotIntegration] Failed clearing legacy offramp state (non-fatal):', e);
            }
          }
          // --- LLM agent and currency conversion integration ---
          if (message.text && this.isNaturalLanguageQuery(message.text)) {
            try {
              const { runLLM } = await import('../lib/llmAgent');
              const { parseIntentAndParams } = await import('../lib/intentParser');
              const llmResponse = await runLLM({ userId, message: message.text });
              const { intent, params } = parseIntentAndParams(typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse));
              if (intent === 'offramp' || intent === 'withdraw') {
                // Delegate to the centralized offramp handler
                await this.handleOfframp(message);
              } else if (intent === 'create_payment_link') {             }
              if (intent === 'get_price') {
                // Only allow USD/NGN/KES (and synonyms)
                const validCurrencies = ['USD', 'USDC', 'NGN', 'CNGN', 'KES'];
                const input = params.original_message || message.text;
                const lowerInput = input.toLowerCase();
                const containsValidPair = (lowerInput.includes('usd') || lowerInput.includes('dollar')) && (lowerInput.includes('ngn') || lowerInput.includes('naira') || lowerInput.includes('kes'));
                if (containsValidPair) {
                  const result = await handleCurrencyConversion(input);
                  await this.bot.sendMessage(message.chat.id, result.text);
                  return true;
                } else {
                  await this.bot.sendMessage(message.chat.id, '❌ Only USD to NGN or KES (and vice versa) conversions are supported.');
                  return true;
                }
              }
            } catch (err) {
              console.error('LLM/currency conversion error:', err);
              await this.bot.sendMessage(message.chat.id, '❌ Sorry, I could not process your request.');
              return true;
            }
          }
          // If not in a flow, proceed with normal handling or fallback
          return false;
        }
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
  
  getOfframpModule() {
    return this.offrampModule;
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
  
  private async getOngoingOfframp(userId: string) {
    const { data, error } = await supabase
      .from('user_states')
      .select('state_data')
      .eq('user_id', userId)
      .eq('state_type', 'offramp')
      .maybeSingle();
    
    if (error) {
      console.error(`[BotIntegration] Error querying user_states for offramp:`, error);
      return null;
    }
    
    return data?.state_data || null;
  }

  // Helper method to detect natural language queries
  private isNaturalLanguageQuery(text: string): boolean {
    const lowerText = text.toLowerCase().trim();
    
    // Check for currency conversion patterns first
    const currencyPatterns = [
      /(convert|what['']?s|what is|exchange rate|rate of|how much is).*(usd|dollar|ngn|naira|kes|shilling)/i,
      /(usd|dollar|ngn|naira|kes|shilling).*(to|in|\?).*/i,
      /\d+\s*(usd|dollar|ngn|naira|kes|shilling).*(to|in|\?|is)/i,
      /^\/rate\b/i
    ];
    
    if (currencyPatterns.some(pattern => pattern.test(lowerText))) {
      return true;
    }
    
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
}