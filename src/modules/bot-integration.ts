import * as TelegramBot from 'node-telegram-bot-api';
import { trackEvent } from '../lib/posthog';
import { handleAction } from '../api/actions';
import { createClient } from '@supabase/supabase-js';
import { handleCurrencyConversion } from '../lib/currencyConversionService';
import { PaycrestRateService } from '../lib/paycrestRateService';
import { InvoiceModule } from './invoices';
import { ProposalModule } from './proposals';
import { USDCPaymentModule } from './usdc-payments';
import { OfframpModule } from './offramp';
import { ContractModule } from './contracts';
import { generateEarningsPDF } from './pdf-generator-earnings';
import { FonbnkService } from '../services/fonbnkService';

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
  private contractModule: ContractModule;
  private fonbnkService: FonbnkService;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.invoiceModule = new InvoiceModule(bot);
    this.proposalModule = new ProposalModule(bot);
    this.usdcPaymentModule = new USDCPaymentModule(bot);
    this.offrampModule = new OfframpModule(bot);
    this.contractModule = new ContractModule(bot);
    this.fonbnkService = new FonbnkService();
  }

  // Public getter for contractModule to allow access from TelegramBotService
  public getContractModule(): ContractModule {
    return this.contractModule;
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

      // Get all user's wallets to create filter
      const { data: wallets } = await supabase
        .from('wallets')
        .select('address, chain')
        .eq('user_id', actualUserId);

      if (!wallets || wallets.length === 0) {
        await this.bot.sendMessage(chatId,
          `I don't see any wallets associated with your account yet. To view your earnings, you'll need to create a wallet first. Would you like me to set one up for you?`,
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

      // Create filter object with all wallet addresses (supports both EVM and Solana)
      const filter = {
        walletAddresses: wallets.map(w => w.address),
        timeframe: timeframe as 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime',
        includeInsights: true
      };

      const summary = await getEarningsSummary(filter, true);
      const formattedSummary = formatEarningsForAgent(summary, 'earnings');

      await this.bot.sendMessage(chatId, formattedSummary, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: "📄 Generate PDF Report", callback_data: "generate_earnings_pdf" }
          ]]
        }
      });

    } catch (error) {
      console.error('[BotIntegration] Error fetching earnings summary:', error);
      await this.bot.sendMessage(chatId,
        `I'm having trouble retrieving your earnings information right now. This might be a temporary issue with our system. Please try again in a few moments, and if the problem persists, let me know!`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleCheckBalance(chatId: number, userId: string, requestedToken?: string, requestedNetwork?: string) {
    try {
      // Use the same logic as actions.ts for consistency
      const result = await handleAction('get_wallet_balance', {
        parameters: {
          token: requestedToken,
          network: requestedNetwork
        }
      }, userId);

      // Check if this is a token-specific request (natural language response)
      // Use the same logic as actions.ts for consistency
      const isTokenSpecificRequest = requestedToken && ['USDC', 'USDT', 'CNGN', 'CUSD', 'SOL', 'ETH', 'CELO'].includes(requestedToken);
      const isNetworkSpecific = requestedNetwork && ['solana', 'base', 'ethereum', 'optimism', 'celo', 'lisk', 'evm'].includes(requestedNetwork.toLowerCase());

      if (isTokenSpecificRequest || isNetworkSpecific) {
        // Send natural language response without inline keyboard
        await this.bot.sendMessage(chatId, result.text, {
          parse_mode: 'Markdown'
        });
      } else {
        // Send general balance with inline keyboard
        await this.bot.sendMessage(chatId, result.text, {
          parse_mode: 'Markdown',
          reply_markup: result.reply_markup
        });
      }

    } catch (error) {
      console.error('[BotIntegration] Error checking balance:', error);
      await this.bot.sendMessage(chatId,
        `I encountered an error while checking your balance. Please try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Handle viewing wallet addresses
  async handleViewWallet(chatId: number, userId: string) {
    try {
      // Send "fetching wallet info" message
      await this.bot.sendMessage(chatId,
        `Let me check your wallet information for you. This will just take a moment...`,
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
            `I don't see any wallets set up for your account yet. Don't worry - I'm working on creating them automatically for you. Please try checking again in just a moment!`,
            {
              parse_mode: 'Markdown'
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
          `I'm having trouble accessing your wallet information right now. This might be a temporary issue with our database. Please try again in a few moments.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (!wallets || wallets.length === 0) {
        await this.bot.sendMessage(chatId,
          `I don't see any wallets set up for your account yet. Don't worry - I'm working on creating them automatically for you. Please try checking again in just a moment!`,
          {
            parse_mode: 'Markdown'
          }
        );
        return;
      }

      // Display wallet addresses
      let walletMessage = `Here are your wallet addresses:\n\n`;

      for (const wallet of wallets) {
        walletMessage += `${wallet.chain === 'evm' ? '🔷' : '🟣'} **${wallet.chain.toUpperCase()} Wallet:**\n`;
        walletMessage += `\`${wallet.address}\`\n\n`;
      }

      walletMessage += `You can use these addresses to receive crypto payments from clients or other users. Each address is specific to its blockchain network, so make sure to use the right one for the type of crypto you're expecting to receive.`;

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
        `I'm having trouble accessing your wallet information right now. This might be a temporary issue with our system. Please try again in a few moments.`,
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

      // Import earnings service dynamically
      const { getEarningsSummary, formatEarningsForAgent } = await import('../lib/earningsService');

      // Build filter with all wallet addresses (supports both EVM and Solana) and fetch summary with insights
      const filter = { walletAddresses: wallets.map(w => w.address), timeframe } as const;
      const summary = await getEarningsSummary(filter, true);

      // Format message
      const message = formatEarningsForAgent(summary, 'earnings');

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📄 Generate PDF Report", callback_data: `generate_earnings_pdf_${timeframe}` }
            ],
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
        `❌ **Error fetching earnings**\n\nPlease try again later.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Handle create wallet flow
  async handleCreateWallet(chatId: number, userId: string) {
    try {
      // Send "wallet being created" message
      await this.bot.sendMessage(chatId,
        `🏦 **Creating your wallet...**\n\n` +
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
          `❌ **Wallet creation failed**\n\n${result?.text || 'Unknown error'}`,
          { parse_mode: 'Markdown' }
        );
      }

    } catch (error) {
      console.error('[BotIntegration] Error creating wallet:', error);
      await this.bot.sendMessage(chatId,
        `❌ **Error creating wallet**\n\nPlease try again later.`,
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
        `❌ **Error processing your request**\n\nPlease try again later.`,
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
        // Try multiple networks to get comprehensive balance info - disabled Arbitrum and BSC networks
        const networks = ['base', 'ethereum-sepolia'];
        let allBalances: any[] = [];

        for (const network of networks) {
          try {
            const balances = await getBalances(address, network);
            if (balances && Array.isArray(balances) && balances.length > 0) {
              // Filter out zero balances for cleaner display
              const nonZeroBalances = balances.filter((b: any) => {
                const amount = parseFloat(b.amount || b.balance || '0');
                return amount > 0;
              });

              if (nonZeroBalances.length > 0) {
                allBalances.push({
                  network: network,
                  balances: nonZeroBalances
                });
              }
            }
          } catch (networkError) {
            console.warn(`[BotIntegration] Error fetching ${network} balances:`, networkError);
            // Continue to next network
          }
        }

        if (allBalances.length > 0) {
          let balanceText = '';
          for (const networkData of allBalances) {
            const network = networkData.network;
            const isTestnet = network.includes('sepolia') || network.includes('testnet');
            const networkEmoji = this.getNetworkEmoji(network);
            const testnetIndicator = isTestnet ? ' 🧪' : '';
            const networkName = this.formatNetworkName(network);

            balanceText += `\n${networkEmoji} ${networkName}${testnetIndicator}:\n`;
            for (const balance of networkData.balances) {
              const amount = parseFloat(balance.amount || balance.balance || '0');
              const symbol = balance.asset?.symbol || balance.symbol || 'TOKEN';
              if (amount > 0) {
                balanceText += `  • ${amount.toFixed(6)} ${symbol}\n`;
              }
            }
          }
          return balanceText || '0 ETH';
        }

        return '0 ETH (No balances found across networks)';
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
          { text: '📝 My Contracts', callback_data: 'business_contracts' }
        ],
        [
          { text: '🔗 Payment Links', callback_data: 'business_payment_links' }
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
      `📊 **Business Dashboard**\n\n` +
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
        .eq('created_by', actualUserId)
        .order('date_created', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!invoices || invoices.length === 0) {
        await this.bot.sendMessage(chatId,
          '📄 **No invoices found**\n\nYou haven\'t created any invoices yet. Use the "Invoice" button to create your first invoice!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📄 **Your Recent Invoices**\n\n';
      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

      for (const invoice of invoices) {
        const status = this.getStatusEmoji(invoice.status);
        const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.amount);

        let invoiceMessage = `${status} **${invoice.invoice_number}** - ${amount}\n`;
        invoiceMessage += `   📧 Client: ${invoice.client_name}`;
        if (invoice.client_email) {
          invoiceMessage += ` (${invoice.client_email})`;
        }
        invoiceMessage += `\n`;
        invoiceMessage += `   📅 Created: ${new Date(invoice.date_created).toLocaleDateString()}`;

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
          '📋 **No proposals found**\n\nYou haven\'t created any proposals yet. Use the "Proposal" button to create your first proposal!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 **Your Recent Proposals**\n\n';
      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

      for (const proposal of proposals) {
        const status = this.getStatusEmoji(proposal.status);
        const createdDate = new Date(proposal.created_at).toLocaleDateString();

        message += `${status} **${proposal.proposal_number}**\n`;
        message += `   📧 Client: ${proposal.client_name}`;
        if (proposal.client_email) {
          message += ` (${proposal.client_email})`;
        }
        message += `\n`;
        message += `   💰 Amount: ${proposal.amount} ${proposal.currency}\n`;
        message += `   📅 Created: ${createdDate}\n`;
        message += `   📊 Status: ${proposal.status}\n\n`;

        keyboard.push([{
          text: `📋 ${proposal.proposal_number}`,
          callback_data: `view_proposal_${proposal.id}`
        }, {
          text: '❌ Delete',
          callback_data: `delete_proposal_${proposal.id}`
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

  // Handle contract list
  async handleContractList(chatId: number, userId: string) {
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

      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          token_address,
          chain,
          deadline,
          status,
          created_at,
          client_id,
          freelancer_id
        `)
        .or(`client_id.eq.${actualUserId},freelancer_id.eq.${actualUserId}`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[BotIntegration] Error fetching contracts:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to fetch contracts. Please try again.');
        return;
      }

      if (!contracts || contracts.length === 0) {
        await this.bot.sendMessage(chatId, '📝 No contracts found.\n\nUse /contract to create your first contract!', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📝 Create Contract', callback_data: 'create_contract_flow' }]
            ]
          }
        });
        return;
      }

      let message = '📝 *Your Contracts*\n\n';

      for (const contract of contracts) {
        const statusEmoji = this.getStatusEmoji(contract.status);
        const deadline = new Date(contract.deadline).toLocaleDateString();

        // Determine token type from address
        const tokenType = this.getTokenTypeFromAddress(contract.token_address, contract.chain);

        message += `${statusEmoji} *${contract.project_title}*\n`;
        message += `💰 ${contract.total_amount} ${tokenType}\n`;
        message += `📅 Deadline: ${deadline}\n`;
        message += `🔗 ${contract.chain.toUpperCase()}\n`;
        message += `📄 ID: ${contract.id}\n\n`;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Create New Contract', callback_data: 'create_contract_flow' }]
          ]
        }
      });

    } catch (error) {
      console.error('[BotIntegration] Error in handleContractList:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to fetch contracts. Please try again.');
    }
  }

  // Handle payment links list
  async handlePaymentLinksList(chatId: number, userId: string) {
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

      const { data: paymentLinks, error } = await supabase
        .from('payment_links')
        .select('*')
        .eq('created_by', actualUserId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!paymentLinks || paymentLinks.length === 0) {
        await this.bot.sendMessage(chatId,
          '🔗 **No payment links found**\n\nYou haven\'t created any payment links yet. Use the "Payment Link" button to create your first payment link!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '🔗 **Your Recent Payment Links**\n\n';
      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

      for (const link of paymentLinks) {
        const status = this.getStatusEmoji(link.status || 'pending');
        const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: link.currency || 'USD' }).format(link.amount);

        let linkMessage = `${status} **${link.title || 'Payment Link'}** - ${amount}\n`;
        linkMessage += `   Description: ${link.description || 'No description'}\n`;
        linkMessage += `   Created: ${new Date(link.created_at).toLocaleDateString()}`;

        // Add buttons for each payment link
        keyboard.push([
          {
            text: `View Details`,
            callback_data: `view_payment_link_${link.id}`
          },
          {
            text: `❌ Delete`,
            callback_data: `delete_payment_link_${link.id}`
          }
        ]);

        message += linkMessage + '\n\n';
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
      console.error('Error handling payment links list:', error);
      await this.bot.sendMessage(chatId, '❌ An error occurred while fetching your payment links. Please try again later.');
    }
  }

  // Handle payment link deletion
  async handleDeletePaymentLink(chatId: number, userId: string, linkId: string) {
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

      // First, get the payment link to verify ownership
      const { data: paymentLink, error: fetchError } = await supabase
        .from('payment_links')
        .select('*')
        .eq('id', linkId)
        .eq('user_id', actualUserId)
        .single();

      if (fetchError || !paymentLink) {
        await this.bot.sendMessage(chatId, '❌ Payment link not found or you don\'t have permission to delete it.');
        return;
      }

      // Delete the payment link
      const { error: deleteError } = await supabase
        .from('payment_links')
        .delete()
        .eq('id', linkId)
        .eq('user_id', actualUserId);

      if (deleteError) {
        console.error('Error deleting payment link:', deleteError);
        await this.bot.sendMessage(chatId, '❌ Error deleting payment link. Please try again.');
        return;
      }

      await this.bot.sendMessage(chatId,
        `✅ **Payment link deleted successfully**\n\nThe payment link "${paymentLink.description || 'Untitled'}" has been removed.`,
        { parse_mode: 'Markdown' }
      );

      // Refresh the payment links list
      await this.handlePaymentLinksList(chatId, userId);

    } catch (error) {
      console.error('Error handling payment link deletion:', error);
      await this.bot.sendMessage(chatId, '❌ Error deleting payment link. Please try again.');
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
        `💰 **Payment Statistics**\n\n` +
        `📄 **Invoices:**\n` +
        `   Total: ${stats.invoices.total}\n` +
        `   Paid: ${stats.invoices.paid}\n` +
        `   Pending: ${stats.invoices.pending}\n` +
        `   Draft: ${stats.invoices.draft}\n` +
        `   Overdue: ${stats.invoices.overdue}\n` +
        `   Revenue: $${stats.invoices.revenue.toFixed(2)}\n\n` +
        `📋 **Proposals:**\n` +
        `   Total: ${stats.proposals.total}\n` +
        `   Accepted: ${stats.proposals.accepted}\n` +
        `   Pending: ${stats.proposals.pending}\n` +
        `   Draft: ${stats.proposals.draft}\n` +
        `   Rejected: ${stats.proposals.rejected}\n` +
        `   Total Value: $${stats.proposals.value.toFixed(2)}\n` +
        `   Revenue: $${stats.proposals.revenue.toFixed(2)}\n\n` +
        `🔗 **Payment Links:**\n` +
        `   Total: ${stats.paymentLinks.total}\n` +
        `   Paid: ${stats.paymentLinks.paid}\n` +
        `   Pending: ${stats.paymentLinks.pending}\n` +
        `   Draft: ${stats.paymentLinks.draft}\n` +
        `   Expired: ${stats.paymentLinks.expired}\n` +
        `   Revenue: $${stats.paymentLinks.revenue.toFixed(2)}\n\n` +
        `💵 **Total Revenue: $${stats.totalRevenue.toFixed(2)}**`
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

  // Handle natural language business queries
  async handleBusinessQuery(chatId: number, userId: string, query: string) {
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

      // Use the enhanced business stats service
      const { getBusinessStats } = await import('../lib/earningsService');
      const stats = await getBusinessStats(actualUserId);

      const lowerQuery = query.toLowerCase();
      let response = '';

      // Handle invoice queries
      if (lowerQuery.includes('invoice')) {
        if (lowerQuery.includes('paid')) {
          response = `📄 You have **${stats.invoices.paid}** paid invoices out of **${stats.invoices.total}** total invoices.`;
          if (stats.invoices.revenue > 0) {
            response += ` Your invoice revenue is **$${stats.invoices.revenue.toFixed(2)}**.`;
          }
        } else if (lowerQuery.includes('unpaid') || lowerQuery.includes('pending')) {
          const unpaid = stats.invoices.pending + stats.invoices.overdue;
          response = `📄 You have **${unpaid}** unpaid invoices (${stats.invoices.pending} pending, ${stats.invoices.overdue} overdue) out of **${stats.invoices.total}** total invoices.`;
        } else {
          response = `📄 **Invoice Summary:**\n` +
            `• Total: **${stats.invoices.total}**\n` +
            `• Paid: **${stats.invoices.paid}**\n` +
            `• Pending: **${stats.invoices.pending}**\n` +
            `• Overdue: **${stats.invoices.overdue}**\n` +
            `• Draft: **${stats.invoices.draft}**\n` +
            `• Revenue: **$${stats.invoices.revenue.toFixed(2)}**`;
        }
      }
      // Handle payment link queries
      else if (lowerQuery.includes('payment link')) {
        if (lowerQuery.includes('paid')) {
          response = `🔗 You have **${stats.paymentLinks.paid}** paid payment links out of **${stats.paymentLinks.total}** total payment links.`;
          if (stats.paymentLinks.revenue > 0) {
            response += ` Your payment link revenue is **$${stats.paymentLinks.revenue.toFixed(2)}**.`;
          }
        } else if (lowerQuery.includes('unpaid') || lowerQuery.includes('pending')) {
          response = `🔗 You have **${stats.paymentLinks.pending}** pending payment links out of **${stats.paymentLinks.total}** total payment links.`;
        } else {
          response = `🔗 **Payment Links Summary:**\n` +
            `• Total: **${stats.paymentLinks.total}**\n` +
            `• Paid: **${stats.paymentLinks.paid}**\n` +
            `• Pending: **${stats.paymentLinks.pending}**\n` +
            `• Draft: **${stats.paymentLinks.draft}**\n` +
            `• Expired: **${stats.paymentLinks.expired}**\n` +
            `• Revenue: **$${stats.paymentLinks.revenue.toFixed(2)}**`;
        }
      }
      // Handle proposal queries
      else if (lowerQuery.includes('proposal')) {
        if (lowerQuery.includes('accepted')) {
          response = `📋 You have **${stats.proposals.accepted}** accepted proposals out of **${stats.proposals.total}** total proposals.`;
          if (stats.proposals.revenue > 0) {
            response += ` Your proposal revenue is **$${stats.proposals.revenue.toFixed(2)}**.`;
          }
        } else if (lowerQuery.includes('pending')) {
          response = `📋 You have **${stats.proposals.pending}** pending proposals out of **${stats.proposals.total}** total proposals.`;
        } else if (lowerQuery.includes('rejected')) {
          response = `📋 You have **${stats.proposals.rejected}** rejected proposals out of **${stats.proposals.total}** total proposals.`;
        } else {
          response = `📋 **Proposals Summary:**\n` +
            `• Total: **${stats.proposals.total}**\n` +
            `• Accepted: **${stats.proposals.accepted}**\n` +
            `• Pending: **${stats.proposals.pending}**\n` +
            `• Draft: **${stats.proposals.draft}**\n` +
            `• Rejected: **${stats.proposals.rejected}**\n` +
            `• Total Value: **$${stats.proposals.value.toFixed(2)}**\n` +
            `• Revenue: **$${stats.proposals.revenue.toFixed(2)}**`;
        }
      }
      // Handle general business queries
      else if (lowerQuery.includes('business') || lowerQuery.includes('revenue') || lowerQuery.includes('total')) {
        response = `💰 **Business Overview:**\n\n` +
          `📄 **Invoices:** ${stats.invoices.total} total (${stats.invoices.paid} paid)\n` +
          `📋 **Proposals:** ${stats.proposals.total} total (${stats.proposals.accepted} accepted)\n` +
          `🔗 **Payment Links:** ${stats.paymentLinks.total} total (${stats.paymentLinks.paid} paid)\n\n` +
          `💵 **Total Revenue: $${stats.totalRevenue.toFixed(2)}**`;
      }
      else {
        response = `I can help you with information about your invoices, payment links, and proposals. Try asking:\n\n` +
          `• "How many invoices do I have?"\n` +
          `• "How many paid payment links?"\n` +
          `• "Show me my proposal status"\n` +
          `• "What's my total revenue?"`;
      }

      await this.bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📊 Business Dashboard', callback_data: 'business_dashboard' }
          ]]
        }
      });

    } catch (error) {
      console.error('Error handling business query:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I encountered an error while fetching your business information.');
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

  // Get token type from address
  private getTokenTypeFromAddress(tokenAddress: string | null, chain: string): string {
    if (!tokenAddress) return 'USDC';
    
    const address = tokenAddress.toLowerCase();
    
    // Base network tokens
    if (chain === 'base') {
      if (address === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') return 'USDC';
      if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    }
    
    // Celo network tokens
    if (chain === 'celo') {
      if (address === '0x765de816845861e75a25fca122bb6898b8b1282a') return 'cUSD';
      if (address === '0x0000000000000000000000000000000000000000') return 'CELO';
    }
    
    // Ethereum network tokens
    if (chain === 'ethereum') {
      if (address === '0xa0b86a33e6441b8c4505e2c4b8b5b8e8e8e8e8e8') return 'USDC';
      if (address === '0x0000000000000000000000000000000000000000') return 'ETH';
    }
    
    // Fallback
    return 'USDC';
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

  // Handle offramp status check using the template system
  async handleOfframpStatusCheck(chatId: number, userId: string, orderId: string) {
    try {
      console.log(`[BotIntegration] Checking offramp status for order: ${orderId}`);
      
      // Get order status from database first
      const { data: transaction, error } = await supabase
        .from('offramp_transactions')
        .select('*')
        .eq('paycrest_order_id', orderId)
        .single();

      if (error || !transaction) {
        await this.bot.sendMessage(chatId, 
          `❌ **Order Not Found**\n\n` +
          `Could not find order \`${orderId}\` in our records.\n\n` +
          `Please check the order ID and try again.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Try to get fresh status from Paycrest API
      let currentStatus = transaction.status;
      let orderData = {
        orderId: orderId,
        amount: transaction.amount,
        currency: transaction.currency,
        token: transaction.token || 'USDC',
        network: transaction.network || 'base',
        recipient: {
          institution: transaction.bank_name || 'Bank',
          accountName: transaction.account_name || 'Account',
          accountIdentifier: transaction.account_number || 'N/A',
          currency: transaction.currency
        },
        expectedAmount: transaction.amount,
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at
      };

      try {
        // Try to get fresh status from Paycrest API
        const response = await fetch(`${process.env.PAYCREST_API_BASE_URL}/orders/${orderId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.PAYCREST_API_SECRET}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const freshData = await response.json();
          if (freshData && freshData.status) {
            currentStatus = freshData.status;
            orderData = {
              ...orderData,
              ...freshData,
              orderId: orderId
            };
            
            // Update database with fresh status if different
            if (freshData.status !== transaction.status) {
              await supabase
                .from('offramp_transactions')
                .update({ 
                  status: freshData.status,
                  updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);
            }
          }
        }
      } catch (apiError) {
        console.warn(`[BotIntegration] Could not fetch fresh status from Paycrest API:`, apiError);
        // Continue with database status
      }

      // Use the status template system
      const { OfframpStatusTemplates } = await import('../lib/offrampStatusTemplates');
      const template = OfframpStatusTemplates.getStatusTemplate(currentStatus, orderData);
      
      await this.bot.sendMessage(chatId, template.text, {
        parse_mode: template.parse_mode || 'Markdown',
        reply_markup: template.reply_markup
      });
      
    } catch (error) {
      console.error('[BotIntegration] Error checking offramp status:', error);
      await this.bot.sendMessage(chatId, 
        '❌ **Error**\n\nThere was an error checking your withdrawal status. Please try again later.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Handle business settings
  async handleBusinessSettings(chatId: number) {
    const message = (
      `⚙️ **Business Settings**\n\n` +
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
        `📧 **Email Setup Required**\n\n` +
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
        `✅ **Email Saved Successfully!**\n\n` +
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
   * Handle reminder email collection
   */
  async handleReminderEmailCollection(chatId: number, userId: string, messageText: string): Promise<boolean> {
    try {
      // Check if user is in reminder email collection state
      const { data: userState } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_reminder_email')
        .single();

      if (!userState) {
        return false; // Not in reminder email collection state
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(messageText.trim())) {
        await this.bot.sendMessage(chatId, '❌ Please enter a valid email address (e.g., john@example.com):');
        return true; // Handled, but invalid
      }

      const email = messageText.trim().toLowerCase();

      // Send reminder using SmartNudgeService
      try {
        const { SmartNudgeService } = await import('../lib/smartNudgeService');

        // Send a manual reminder using the email
        const result = await SmartNudgeService.sendManualReminder(
          'invoice',
          'manual-reminder',
          `This is a payment reminder sent via Telegram bot to ${email}.`
        );

        if (result.success) {
          await this.bot.sendMessage(chatId,
            `✅ **Reminder Sent Successfully!**\n\n` +
            `A payment reminder has been sent to \`${email}\`.\n\n` +
            `The recipient will receive an email notification.`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await this.bot.sendMessage(chatId, `❌ Failed to send reminder: ${result.message}`);
        }
      } catch (reminderError) {
        console.error('[BotIntegration] Error sending reminder:', reminderError);
        await this.bot.sendMessage(chatId, '❌ Failed to send reminder. Please try again.');
      }

      // Clear user state
      await supabase
        .from('user_states')
        .delete()
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_reminder_email');

      return true;
    } catch (error) {
      console.error('[BotIntegration] Error handling reminder email collection:', error);
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
        `✅ **Name Saved Successfully!**\n\n` +
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
      const basicCommands = ['/start', '/help', '❓ Help', '👛 Wallet', '💰 Balance', '/referral', '/leaderboard'];
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
        `**Please enter your full name:**`,
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
      const basicCommands = ['/start', '/help', '❓ Help', '👛 Wallet', '💰 Balance', '/referral', '/leaderboard'];
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
          `📧 **Email Required**\n\n` +
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
      `💸 **Send Crypto**\n\n` +
      `To send cryptocurrency, you can:\n\n` +
      `• Type naturally: "Send 10 USDC to alice@example.com"\n` +
      `• Use the format: "Send [amount] [token] to [recipient]"\n\n` +
      `**Supported tokens:**\n` +
      `• ETH (Base, Lisk)\n` +
      `• USDC (Base, Celo)\n` +
      `• USDT (Lisk)\n` +
      `• SOL (Solana)\n` +
      `• CELO (Celo native)\n` +
      `• cUSD (Celo Dollar)\n` +
      `• LISK (Lisk token)\n\n` +
      `**Supported networks:** Base, Celo, Lisk, Solana\n\n` +
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
      `🔗 **Create Payment Link**\n\n` +
      `To create a payment link, you can:\n\n` +
      `• Type: "Create payment link for $50"\n` +
      `• Or: "Payment link for 25 USDC for web design"\n\n` +
      `I'll help you create a shareable payment link that others can use to pay you directly.\n\n` +
      `💰 **Platform Fee Notice:**\n` +
      `A 1% platform fee will be automatically deducted from all payments to support our services and maintain the platform.`,
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
      `❓ **Help & Support**\n\n` +
      `Here's what I can help you with:\n\n` +
      `💰 **Wallet Management**\n` +
      `• Check your balance\n` +
      `• View wallet addresses\n` +
      `• Create new wallets\n\n` +
      `💸 **Transactions**\n` +
      `• Send crypto to anyone\n` +
      `• Create payment links\n` +
      `• Generate invoices\n` +
      `• Offramp (cash out crypto)\n\n` +
      `📊 **Business Tools**\n` +
      `• Create proposals\n` +
      `• Track payments\n` +
      `• View transaction history\n\n` +
      `💱 **Currency Tools**\n` +
      `• Check USD/NGN/GHS rates\n` +
      `• Convert between currencies\n` +
      `• Example: \"What's 100 USD in NGN?\"\n\n` +
      `Just type naturally what you want to do, or use the menu below!`,
      {
        parse_mode: 'Markdown',
        reply_markup: this.getPersistentKeyboard()
      }
    );
  }

  async handleCurrencyRate(chatId: number, query?: string) {
    try {
      const paycrestService = new PaycrestRateService();

      if (!query) {
        // Show available rates
        const rates = await paycrestService.getAllRates();
        const message = paycrestService.formatRatesDisplay(rates);
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        return;
      }

      // Parse and handle specific rate query
      const parsedQuery = paycrestService.parseRateQuery(query);
      if (!parsedQuery) {
        await this.bot.sendMessage(chatId,
          '❓ **Invalid Query**\n\n' +
          'Please use format like:\n' +
          '• "USDC to NGN"\n' +
          '• "1 USDC → GHS"\n' +
          '• "rates" for all rates',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const rate = await paycrestService.getExchangeRate(parsedQuery.fromToken, parsedQuery.toCurrency);
      const message = paycrestService.formatSingleRateDisplay(
        parsedQuery.fromToken,
        parsedQuery.toCurrency,
        rate,
        parsedQuery.amount
      );

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error handling currency rate:', error);
      await this.bot.sendMessage(chatId,
        '❌ **Rate Fetch Error**\n\n' +
        'Unable to fetch exchange rates at the moment. Please try again later.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  async handleReferralCommand(chatId: number, userId: string) {
    try {
      const { getUserReferralStats, getUserBadges, awardMilestoneBadges } = await import('../lib/referralService');

      // Award milestone badges first
      await awardMilestoneBadges(userId);

      const stats = await getUserReferralStats(userId);
      const badges = await getUserBadges(userId);

      const referralLink = `https://t.me/HedwigAssistBot?start=ref_${userId}`;

      let message =
        `🔗 **Your Referral Link:**\n` +
        `\`${referralLink}\`\n\n` +
        `📊 **Your Stats:**\n` +
        `👥 Referrals: ${stats?.referral_count || 0}\n` +
        `🎯 Points: ${stats?.points || 0}\n\n`;

      // Add badges section if user has any
      if (badges && badges.length > 0) {
        message += `🏅 **Your Badges:**\n`;
        badges.forEach(userBadge => {
          const badge = userBadge.badge;
          message += `${badge.emoji} ${badge.name}\n`;
        });
        message += `\n`;
      }

      message +=
        `💡 **How to earn points:**\n` +
        `• Refer friends: +10 points\n` +
        `• First invoice: +10 points\n` +
        `• First proposal: +5 points\n` +
        `• First payment link: +5 points\n` +
        `• First offramp: +15 points\n\n` +
        `🎯 **Monthly Contest:**\n` +
        `Compete for badges and recognition!`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏆 View Leaderboard', callback_data: 'leaderboard' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error handling referral command:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t fetch your referral information right now. Please try again later.');
    }
  }

  async handleLeaderboardCommand(chatId: number) {
    try {
      const { getMonthlyLeaderboard, getCurrentPeriod } = await import('../lib/referralService');

      // Get current period info
      const currentPeriod = await getCurrentPeriod();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const periodText = currentPeriod ? `${monthNames[currentPeriod.month - 1]} ${currentPeriod.year}` : 'Current';

      const leaderboard = await getMonthlyLeaderboard();

      let message = `🏆 **Hedwig Referral Leaderboard** 🏆\n📅 **${periodText} Contest**\n\n`;

      if (leaderboard.length === 0) {
        message += `No referral data yet. Be the first to start referring! 🚀\n\n`;
        message += `💡 **How to earn points:**\n`;
        message += `• Refer friends: 10 pts per referral\n`;
        message += `• First invoice: 10 pts\n`;
        message += `• First proposal: 5 pts\n`;
        message += `• First payment link: 5 pts\n`;
        message += `• First offramp: 15 pts`;
      } else {
        leaderboard.forEach((entry, index) => {
          const position = index + 1;
          const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🏅';
          const username = entry.username ? `@${entry.username}` : 'Anonymous';

          // Add badges to display
          let badgeText = '';
          if (entry.badges && entry.badges.length > 0) {
            const badgeEmojis = entry.badges.map(badge => badge.badge.emoji).join('');
            badgeText = ` ${badgeEmojis}`;
          }

          message += `${emoji} ${username}${badgeText} – ${entry.points} pts (${entry.referral_count} refs)\n`;
        });

        message += `\n🎯 **Monthly Prizes:**\n`;
        message += `🥇 Top Referrer of the Month\n`;
        message += `🥈 Silver Referrer\n`;
        message += `🥉 Bronze Referrer\n`;
        message += `⭐ Rising Star (Top 10)\n\n`;
        message += `💎 **Milestone Badges:**\n`;
        message += `🎯 First Referral\n`;
        message += `👑 Referral Master (10 refs)\n`;
        message += `💎 Point Collector (100 pts)\n`;
        message += `🏆 Referral Legend (50 refs)`;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Get My Referral Link', callback_data: 'referral_link' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error handling leaderboard command:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t fetch the leaderboard right now. Please try again later.');
    }
  }

  // Show welcome message with conditional wallet creation for new users
  async showWelcomeMessage(chatId: number, startPayload?: string | null) {
    try {
      // Import referral service functions
      const { extractReferrerIdFromPayload, processReferral } = await import('../lib/referralService');

      // Check if user exists in database with more comprehensive data
      const { data: user } = await supabase
        .from('users')
        .select('id, telegram_first_name, telegram_username, evm_wallet_address, solana_wallet_address')
        .eq('telegram_chat_id', chatId)
        .single();

      // Also check wallets table for more accurate wallet detection
      let hasWallets = false;
      if (user) {
        const { data: wallets } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        hasWallets = !!(wallets && wallets.length > 0);
      }

      const isNewUser = !user || (!hasWallets && !user.evm_wallet_address && !user.solana_wallet_address);

      // Handle referral if this is a new user with referral payload
      if (isNewUser && startPayload) {
        const referrerId = extractReferrerIdFromPayload(startPayload);
        if (referrerId && user?.id) {
          console.log(`[BotIntegration] Processing referral: ${referrerId} -> ${user.id}`);
          const referralSuccess = await processReferral(referrerId, user.id);
          if (referralSuccess) {
            console.log(`[BotIntegration] Referral processed successfully`);
          } else {
            console.warn(`[BotIntegration] Failed to process referral`);
          }
        }
      }

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
        // Get user's name for personalized greeting
        const userName = user.telegram_first_name || user.telegram_username || 'there';

        // Show personalized welcome message for returning users
        await this.bot.sendMessage(chatId,
          `🦉 **Welcome back, ${userName}!**\n\n` +
          `Great to see you again! I'm here to help with all your crypto and freelance needs.\n\n` +
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
      `🦉 **Welcome to Hedwig!**\n\n` +
      `I'm your freelance assistant for crypto payments.\n\n` +
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
        chatId: callbackQuery.message.chat.id
      }, (userId || callbackQuery.message.chat.id).toString());
    }
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat.id;
    if (!data || !chatId) return false;

    // Get userId if not provided
    if (!userId) {
      userId = await this.getUserIdByChatId(chatId);
    }

    try {
      // Business dashboard callbacks
      if (data === 'business_dashboard') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business dashboard message:', editError);
          }
        }
        await this.handleBusinessDashboard(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'check_balance') {
        await this.handleCheckBalance(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_invoices') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business invoices message:', editError);
          }
        }
        await this.handleInvoiceList(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_proposals') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business proposals message:', editError);
          }
        }
        await this.handleProposalList(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_contracts') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business contracts message:', editError);
          }
        }
        await this.handleContractList(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_payment_links') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business payment links message:', editError);
          }
        }
        await this.handlePaymentLinksList(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_stats') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business stats message:', editError);
          }
        }
        await this.handlePaymentStats(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'business_settings') {
        // Make buttons disappear
        if (callbackQuery.message?.message_id) {
          try {
            await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            });
          } catch (editError) {
            console.warn('[BotIntegration] Could not remove buttons from business settings message:', editError);
          }
        }
        await this.handleBusinessSettings(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'create_proposal_flow') {
        await this.proposalModule.handleProposalCreation(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'create_invoice_flow') {
        await this.invoiceModule.handleInvoiceCreation(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'create_payment_link_flow') {
        await this.handlePaymentLink(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'create_contract_flow') {
        await this.contractModule.startContractCreation(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data === 'view_earnings') {
        await this.handleEarningsWithWallet(chatId, userId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data.startsWith('check_offramp_status_')) {
        // Handle status check callbacks using the template system
        const orderId = data.replace('check_offramp_status_', '');
        await this.handleOfframpStatusCheck(chatId, userId, orderId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data.startsWith('offramp_') || data.startsWith('payout_') || data.startsWith('select_bank_') || data.startsWith('retry_tx_') || data.startsWith('tx_status_') || data.startsWith('check_status_') || data === 'back_to_payout' || data === 'back_to_banks' || data === 'check_kyc_status' || data === 'start_kyc' || data === 'kyc_info' || data === 'contact_support' || data === 'action_offramp' || data === 'start_offramp' || data === 'offramp_history') {
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
      } else if (data === 'generate_earnings_pdf' || data.startsWith('generate_earnings_pdf_')) {
        // Handle PDF generation callbacks - use the webhook logic that actually sends PDF files
        try {
          // Extract timeframe from callback data if present
          let timeframe: 'last7days' | 'lastMonth' | 'last3months' | 'allTime' = 'allTime';
          if (data?.startsWith('generate_earnings_pdf_')) {
            const extractedTimeframe = data.replace('generate_earnings_pdf_', '') as typeof timeframe;
            if (['last7days', 'lastMonth', 'last3months', 'allTime'].includes(extractedTimeframe)) {
              timeframe = extractedTimeframe;
            }
          }

          // Send processing message
          await this.bot.sendMessage(chatId, `📄 Generating your ${timeframe} earnings PDF report... Please wait.`);

          // Import required functions
          const { getEarningsSummary } = await import('../lib/earningsService');
          const { generateEarningsPDF } = await import('../modules/pdf-generator-earnings');
          const { createClient } = await import('@supabase/supabase-js');

          // Get user's wallet addresses (both EVM and Solana)
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          const { data: wallets } = await supabase
            .from('wallets')
            .select('address, chain')
            .eq('user_id', userId)
            .limit(1);

          // Get user data for dynamic PDF content
          const { data: userData } = await supabase
            .from('users')
            .select('name, telegram_first_name, telegram_last_name, telegram_username')
            .eq('id', userId)
            .single();

          if (!wallets || wallets.length === 0) {
            await this.bot.sendMessage(chatId, '💡 **Setting up your wallets**\n\nYour wallets are being created automatically. Please try again in a moment!', {
              parse_mode: 'Markdown'
            });
            await this.bot.answerCallbackQuery(callbackQuery.id);
            return true;
          }

          // Use the first wallet for earnings summary
          const walletAddress = wallets[0].address;

          // Create filter object
          const filter = {
            walletAddress,
            timeframe: timeframe as 'last7days' | 'lastMonth' | 'last3months' | 'lastYear' | 'allTime'
          };

          const summary = await getEarningsSummary(filter, true);

          if (summary && summary.totalPayments > 0) {
            // Transform summary data for PDF generation
            const earningsData = {
              walletAddress: summary.walletAddress || walletAddress || 'N/A',
              timeframe: summary.timeframe,
              totalEarnings: summary.totalEarnings,
              totalFiatValue: summary.totalFiatValue,
              totalPayments: summary.totalPayments,
              earnings: summary.earnings,
              period: summary.period,
              insights: summary.insights ? {
                largestPayment: summary.insights.largestPayment,
                topToken: summary.insights.topToken,
                motivationalMessage: summary.insights.motivationalMessage
              } : undefined,
              userData: userData ? {
                name: userData.name,
                telegramFirstName: userData.telegram_first_name,
                telegramLastName: userData.telegram_last_name,
                telegramUsername: userData.telegram_username
              } : undefined
            };

            // Generate PDF
            const pdfBuffer = await generateEarningsPDF(earningsData);

            // Send PDF as document
            await this.bot.sendDocument(chatId, pdfBuffer, {
              caption: '📄 **Your Earnings Report is Ready!**\n\n🎨 This creative PDF includes:\n• Visual insights and charts\n• Motivational content\n• Professional formatting\n• Complete transaction breakdown\n• Multi-wallet earnings (EVM + Solana)\n\n💡 Keep building your financial future!',
              parse_mode: 'Markdown'
            }, {
              filename: `earnings-report-${timeframe}-${new Date().toISOString().split('T')[0]}.pdf`
            });
          } else {
            await this.bot.sendMessage(chatId, '📄 **No Data for PDF Generation**\n\nYou need some earnings data to generate a PDF report. Start receiving payments first!\n\n💡 Create payment links or invoices to begin tracking your earnings.', {
              parse_mode: 'Markdown'
            });
          }
        } catch (error) {
          console.error('[BotIntegration] Error handling PDF generation:', error);
          await this.bot.sendMessage(chatId, '❌ Error generating PDF report. Please try again later.');
        }
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      } else if (data.startsWith('earnings_shortcut_')) {
        const shortcut = data.replace('earnings_shortcut_', '');
        await this.handleEarningsShortcuts(chatId, userId, shortcut);
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
        data.startsWith('generate_invoice_') || data.startsWith('cancel_proposal_') ||
        data === 'continue_proposal' || data === 'edit_user_info' ||
        data === 'edit_user_field_name' || data === 'edit_user_field_email' ||
        data === 'back_to_proposal' || data === 'cancel_user_edit' ||
        data === 'cancel_proposal_creation') {
        await this.proposalModule.handleProposalCallback(callbackQuery, userId);
        return true;
      }
      // Contract module callbacks
      else if (data.startsWith('contract_') || data.startsWith('view_contract_') ||
        data.startsWith('edit_contract_') || data.startsWith('cancel_contract_') ||
        data.startsWith('approve_contract_') || data.startsWith('generate_contract_') ||
        data.startsWith('continue_contract_') || data === 'cancel_contract_creation') {
        // Answer callback query immediately to prevent timeout
        await this.bot.answerCallbackQuery(callbackQuery.id);
        // Then handle the callback
        await this.contractModule.handleContractCallback(chatId, userId, data, callbackQuery.message?.message_id);
        return true;
      }
      // Payment link deletion callbacks
      else if (data.startsWith('delete_payment_link_')) {
        const linkId = data.replace('delete_payment_link_', '');
        await this.handleDeletePaymentLink(chatId, userId, linkId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // USDC payment callbacks
      else if (data.startsWith('usdc_') || data.startsWith('confirm_payment_')) {
        await this.usdcPaymentModule.handleCallback(callbackQuery);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Leaderboard callback
      else if (data === 'leaderboard') {
        await this.handleLeaderboardCommand(chatId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Calendar suggestion callbacks - disabled
      else if (data.startsWith('calendar_connect_then_invoice_')) {
        const targetUserId = data.replace('calendar_connect_then_invoice_', '');
        await this.bot.sendMessage(chatId, '📅 **Calendar Sync Unavailable**\n\nCalendar sync is currently disabled. Creating your invoice directly.', { parse_mode: 'Markdown' });
        await this.invoiceModule.handleInvoiceCreation(chatId, targetUserId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data.startsWith('create_invoice_skip_calendar_')) {
        const targetUserId = data.replace('create_invoice_skip_calendar_', '');
        await this.invoiceModule.handleInvoiceCreation(chatId, targetUserId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Referral link callback
      else if (data === 'referral_link') {
        await this.handleReferralCommand(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      // Milestone callbacks
      else if (data === 'milestone_list') {
        await this.showMilestoneList(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data === 'milestone_submit') {
        await this.showMilestoneSubmissionForm(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data === 'milestone_menu') {
        await this.showMilestoneMenu(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data === 'milestone_status') {
        await this.showMilestoneList(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data === 'milestone_due_soon') {
        await this.showMilestonesApproachingDeadline(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data.startsWith('milestone_submit_')) {
        const milestoneId = data.replace('milestone_submit_', '');
        await this.handleMilestoneSubmission(chatId, userId!, milestoneId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data.startsWith('milestone_quick_submit_')) {
        const milestoneId = data.replace('milestone_quick_submit_', '');
        await this.handleQuickMilestoneSubmit(chatId, userId!, milestoneId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data === 'cancel_contract_completion') {
        await this.cancelContractCompletion(chatId, userId!);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data.startsWith('mark_contract_complete_')) {
        const contractId = data.replace('mark_contract_complete_', '');
        await this.handleMarkContractComplete(chatId, userId!, contractId);
        await this.bot.answerCallbackQuery(callbackQuery.id);
        return true;
      }
      else if (data.startsWith('milestone_start_')) {
        const milestoneId = data.replace('milestone_start_', '');
        await this.handleMilestoneStart(chatId, userId!, milestoneId);
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

    if (data?.id) {
      return data.id;
    }

    // User doesn't exist, create one using the RPC function
    try {
      const { data: newUserData, error } = await supabase
        .rpc('get_or_create_telegram_user', {
          p_telegram_chat_id: chatId,
          p_telegram_username: null,
          p_telegram_first_name: null,
          p_telegram_last_name: null,
          p_telegram_language_code: null
        });

      if (error) {
        console.error('[BotIntegration] Error creating user:', error);
        throw error;
      }

      return newUserData;
    } catch (error) {
      console.error('[BotIntegration] Failed to create user for chatId:', chatId, error);
      throw error;
    }
  }

  async handleBusinessMessage(message: TelegramBot.Message, userId: string) {
    // PostHog: Track every message command
    if (message.text) {
      trackEvent('bot_command', { command: message.text, chatId: message.chat.id }, userId);
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

      // Check if user is in reminder email collection state
      const reminderEmailHandled = await this.handleReminderEmailCollection(chatId, userId, text);
      if (reminderEmailHandled) {
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

      // Check if user is in contract creation flow
      const contractHandled = await this.contractModule.handleContractInput(chatId, userId, text);
      if (contractHandled) {
        return true;
      }

      // Check if user is providing milestone completion notes
      const milestoneCompletionHandled = await this.handleMilestoneCompletionNotes(chatId, userId, text);
      if (milestoneCompletionHandled) {
        return true;
      }

      // Check if user is providing contract completion notes
      const contractCompletionHandled = await this.handleContractCompletionNotes(chatId, userId, text);
      if (contractCompletionHandled) {
        return true;
      }

      switch (text) {
        case '📄 Invoice':
          await this.invoiceModule.handleInvoiceCreation(chatId, userId);
          return true;

        case '📋 Proposal':
          await this.proposalModule.handleProposalCreation(chatId, userId);
          return true;

        case '📝 Contract':
          await this.contractModule.startContractCreation(chatId, userId);
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
        case '/earnings':
        case '/earnings_summary':
          // Use enhanced earnings handling
          await this.handleEnhancedEarningsCommand(chatId, userId, text);
          return true;

        case '/earnings_pdf':
        case '/generate_pdf':
          // Generate PDF directly
          await this.handleEarningsShortcuts(chatId, userId, 'generate_pdf');
          return true;

        case '❓ Help':
          await this.handleHelp(chatId);
          return true;

        case '/rate':
          await this.handleCurrencyRate(chatId, message.text?.split(' ').slice(1).join(' '));
          return true;

        case '/referral':
          await this.handleReferralCommand(chatId, userId);
          return true;

        case '/leaderboard':
          await this.handleLeaderboardCommand(chatId);
          return true;

        case '/milestone':
        case '/milestones':
        case '🎯 Milestones':
          await this.handleMilestoneCommand(chatId, userId, text);
          return true;

        case '/buy_crypto':
        case '/buy':
        case '/onramp':
        case 'buy crypto':
        case 'buy cryptocurrency':
        case 'onramp':
        case 'purchase crypto': {
          // Handle onramp via actions
          try {
            const result = await handleAction('onramp', {}, userId);
            await this.bot.sendMessage(chatId, result.text, {
              parse_mode: 'Markdown',
              reply_markup: result.reply_markup
            });
          } catch (error) {
            console.error('[BotIntegration] Error handling onramp:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to process buy crypto request. Please try again.');
          }
          return true;
        }

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
              const lowerText = message.text.toLowerCase();

              // Check for earnings queries first (more specific)
              const earningsPatterns = [
                /(show|view|check|get|see).*(my )?earnings/i,
                /(how much|what).*(did i|have i).*(earn|made|receive)/i,
                /earnings.*(this|last|past).*(month|week|year)/i,
                /(this|last|past).*(month|week|year).*(earnings|earned|made)/i,
                /earnings.*(january|february|march|april|may|june|july|august|september|october|november|december)/i,
                /(usdc|usdt|eth|sol|celo).*(earnings|earned)/i,
                /earnings.*(on|in).*(base|ethereum|solana|celo|lisk)/i,
                /(generate|create|make).*(earnings|pdf|report)/i,
                /earnings.*(pdf|report)/i
              ];

              if (earningsPatterns.some(pattern => pattern.test(lowerText))) {
                await this.handleNaturalLanguageEarnings(message.chat.id, userId, message.text);
                return true;
              }

              // Check for business queries
              const businessPatterns = [
                /(how many|how much|what['']?s my|show me my|tell me about my).*(invoice|proposal|payment link|revenue)/i,
                /(invoice|proposal|payment link).*(paid|unpaid|pending|draft|expired|count|total)/i,
                /my (business|revenue|income|invoice|proposal|payment)/i,
                /(total|sum|amount).*(invoice|proposal|payment)/i
              ];

              if (businessPatterns.some(pattern => pattern.test(lowerText))) {
                await this.handleBusinessQuery(message.chat.id, userId, message.text);
                return true;
              }

              const { runLLM } = await import('../lib/llmAgent');
              const { parseIntentAndParams } = await import('../lib/intentParser');
              const llmResponse = await runLLM({ userId, message: message.text });
              const { intent, params } = parseIntentAndParams(typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse));
              if (intent === 'offramp' || intent === 'withdraw') {
                // Delegate to the centralized offramp handler
                await this.handleOfframp(message);
              } else if (intent === 'get_earnings' || intent === 'earnings_summary') {
                // Handle earnings queries with natural language support
                await this.handleNaturalLanguageEarnings(message.chat.id, userId, message.text);
                return true;
              } else if (intent === 'generate_earnings_pdf') {
                // Handle PDF generation requests
                await this.handleNaturalLanguagePdfGeneration(message.chat.id, userId, message.text, [], undefined);
                return true;
              } else if (intent === 'create_payment_link') {
                // Let this be handled by the main actions.ts handler
                return false;
              } else if (intent === 'create_contract') {
                // Handle contract creation requests
                await this.contractModule.startContractCreation(message.chat.id, userId, undefined, params);
                return true;
              } else if (intent === 'create_content' || intent === 'create_design' || 
                         intent === 'create_development' || intent === 'create_marketing' || 
                         intent === 'create_consulting') {
                // Handle content creation service requests - redirect to contract creation
                const serviceTypeMap = {
                  'create_content': 'Content Writing',
                  'create_design': 'Design Services', 
                  'create_development': 'Development Services',
                  'create_marketing': 'Marketing Services',
                  'create_consulting': 'Consulting Services'
                };
                
                const serviceType = serviceTypeMap[intent as keyof typeof serviceTypeMap];
                const enhancedParams = {
                  ...params,
                  service_category: intent.replace('create_', ''),
                  suggested_title: serviceType,
                  suggested_description: `${serviceType} project`
                };
                
                await this.contractModule.startContractCreation(message.chat.id, userId, undefined, enhancedParams);
                return true;
              }
              else if (intent === 'referral') {
                await this.handleReferralCommand(message.chat.id, userId);
                return true;
              } else if (intent === 'leaderboard') {
                await this.handleLeaderboardCommand(message.chat.id);
                return true;
              } else if (intent === 'conversation') {
                // Handle conversational responses naturally
                const conversationalMessage = params.message || "Thanks for chatting with me! How can I help you today? 😊";
                await this.bot.sendMessage(message.chat.id, conversationalMessage);
                return true;
              }
              if (intent === 'get_price') {
                // Only allow USD/NGN/GHS (and synonyms)
                const validCurrencies = ['USD', 'USDC', 'NGN', 'CNGN', 'GHS'];
                const input = params.original_message || message.text;
                const lowerInput = input.toLowerCase();
                const containsValidPair = (lowerInput.includes('usd') || lowerInput.includes('dollar')) && (lowerInput.includes('ngn') || lowerInput.includes('naira') || lowerInput.includes('ghs') || lowerInput.includes('cedi'));
                if (containsValidPair) {
                  const result = await handleCurrencyConversion(input);
                  await this.bot.sendMessage(message.chat.id, result.text);
                  return true;
                } else {
                  await this.bot.sendMessage(message.chat.id, '❌ Only USD to NGN or GHS (and vice versa) conversions are supported.');
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

  /**
   * Handle invoice creation with optional calendar suggestion
   */
  async handleInvoiceCreationWithCalendarSuggestion(chatId: number, userId: string) {
    try {
      // Calendar sync is disabled, proceed directly to invoice creation
      await this.invoiceModule.handleInvoiceCreation(chatId, userId);
      return;

    } catch (error) {
      console.error('[BotIntegration] Error in handleInvoiceCreationWithCalendarSuggestion:', error);
      // Fallback to direct invoice creation
      await this.invoiceModule.handleInvoiceCreation(chatId, userId);
    }
  }

  /**
   * Handle calendar connection followed by invoice creation
   */
  async handleCalendarConnectThenInvoice(chatId: number, userId: string) {
    try {
      // Import Telegram bot service to handle calendar connection
      const { TelegramBotService } = await import('../lib/telegramBot');
      
      // Send message about starting calendar connection
      await this.bot.sendMessage(chatId,
        '📅 **Connecting Your Calendar**\n\n' +
        'Great choice! Let\'s connect your Google Calendar first, then we\'ll create your invoice.\n\n' +
        '⏳ Starting calendar connection...',
        { parse_mode: 'Markdown' }
      );

      // Store the intent to create invoice after calendar connection
      await this.storePostCalendarIntent(userId, 'create_invoice');

      // Trigger calendar connection flow
      // We'll use the existing calendar connection command handler
      const { googleCalendarService } = await import('../lib/googleCalendarService');
      
      // Check if user is already connected (double-check)
      const isConnected = await googleCalendarService.isConnected(userId);
      if (isConnected) {
        await this.bot.sendMessage(chatId,
          '✅ **Calendar Already Connected!**\n\n' +
          'Your Google Calendar is already connected. Let\'s proceed with creating your invoice.',
          { parse_mode: 'Markdown' }
        );
        
        // Proceed directly to invoice creation
        await this.invoiceModule.handleInvoiceCreation(chatId, userId);
        return;
      }

      // Generate authorization URL
      const authUrl = googleCalendarService.generateAuthUrl(userId);

      await this.bot.sendMessage(chatId,
        '🔗 **Connect Your Google Calendar**\n\n' +
        '👆 Click the button below to connect your Google Calendar.\n\n' +
        '📝 **After connecting, I\'ll automatically start your invoice creation.**',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Connect Google Calendar', url: authUrl }],
              [{ text: '📄 Skip & Create Invoice', callback_data: `create_invoice_skip_calendar_${userId}` }],
              [{ text: '❌ Cancel', callback_data: 'cancel_invoice_creation' }]
            ]
          }
        }
      );

      // Track calendar connection attempt
      try {
        const { trackEvent } = await import('../lib/posthog');
        await trackEvent(
          'calendar_connect_initiated_from_invoice',
          {
            feature: 'calendar_sync',
            source: 'invoice_creation_flow',
            timestamp: new Date().toISOString(),
          },
          userId,
        );
      } catch (trackingError) {
        console.error('[BotIntegration] Error tracking calendar_connect_initiated_from_invoice event:', trackingError);
      }

    } catch (error) {
      console.error('[BotIntegration] Error in handleCalendarConnectThenInvoice:', error);
      
      // Fallback to direct invoice creation
      await this.bot.sendMessage(chatId,
        '⚠️ **Calendar Connection Issue**\n\n' +
        'There was an issue setting up calendar connection. Let\'s proceed with creating your invoice.',
        { parse_mode: 'Markdown' }
      );
      
      await this.invoiceModule.handleInvoiceCreation(chatId, userId);
    }
  }

  /**
   * Store intent to execute after calendar connection
   */
  private async storePostCalendarIntent(userId: string, intent: string) {
    try {
      await supabase
        .from('user_states')
        .upsert({
          user_id: userId,
          state_type: 'post_calendar_intent',
          state_data: { intent },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,state_type'
        });
    } catch (error) {
      console.error('[BotIntegration] Error storing post-calendar intent:', error);
    }
  }

  /**
   * Execute stored intent after calendar connection
   */
  async executePostCalendarIntent(userId: string, chatId: number) {
    try {
      const { data } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'post_calendar_intent')
        .single();

      if (data?.state_data?.intent === 'create_invoice') {
        // Clear the intent
        await supabase
          .from('user_states')
          .delete()
          .eq('user_id', userId)
          .eq('state_type', 'post_calendar_intent');

        // Send success message
        await this.bot.sendMessage(chatId,
          '✅ **Calendar Connected Successfully!**\n\n' +
          '🎉 Your Google Calendar is now connected. Invoice due dates will be automatically tracked.\n\n' +
          '📄 **Now let\'s create your invoice...**',
          { parse_mode: 'Markdown' }
        );

        // Start invoice creation
        await this.invoiceModule.handleInvoiceCreation(chatId, userId);
      }
    } catch (error) {
      console.error('[BotIntegration] Error executing post-calendar intent:', error);
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
      /(convert|what['']?s|what is|exchange rate|rate of|how much is).*(usd|dollar|ngn|naira|ghs|cedi)/i,
      /(usd|dollar|ngn|naira|ghs|cedi).*(to|in|\?).*/i,
      /\d+\s*(usd|dollar|ngn|naira|ghs|cedi).*(to|in|\?|is)/i,
      /^\/rate\b/i
    ];

    if (currencyPatterns.some(pattern => pattern.test(lowerText))) {
      return true;
    }

    // Check for business query patterns
    const businessPatterns = [
      /(how many|how much|what['']?s my|show me my|tell me about my).*(invoice|proposal|payment link|earning|revenue)/i,
      /(invoice|proposal|payment link).*(paid|unpaid|pending|draft|expired|count|total)/i,
      /my (business|earning|revenue|income|invoice|proposal|payment)/i,
      /(total|sum|amount).*(earned|made|received|invoice|proposal|payment)/i
    ];

    if (businessPatterns.some(pattern => pattern.test(lowerText))) {
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

  // Helper method to get network-specific emojis
  private getNetworkEmoji(network: string): string {
    switch (network.toLowerCase()) {
      case 'base':
        return '🔵';
      case 'ethereum':
      case 'ethereum-sepolia':
        return '💎';
      case 'polygon':
        return '🟣';
      case 'celo':
        return '🟡';
      case 'lisk':
        return '🟢';
      case 'solana':
        return '🟣';
      default:
        return '🌐';
    }
  }

  // Helper method to format network names
  private formatNetworkName(network: string): string {
    switch (network.toLowerCase()) {
      case 'base':
        return 'Base';
      case 'ethereum':
        return 'Ethereum';
      case 'ethereum-sepolia':
        return 'Ethereum Sepolia';
      case 'polygon':
        return 'Polygon';
      case 'celo':
        return 'Celo';
      case 'lisk':
        return 'Lisk';
      case 'solana':
        return 'Solana';
      default:
        return network.toUpperCase().replace('-', ' ');
    }
  }

  // Onramp (Buy Crypto) Methods

  /**
   * Handle main onramp/buy crypto command
   */
  async handleOnramp(chatId: number, userId: string, params: any = {}) {
    try {
      console.log('[BotIntegration] handleOnramp called with chatId:', chatId, 'userId:', userId, 'params:', params);

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
        } else {
          await this.bot.sendMessage(chatId,
            'I don\'t see you in our system yet. Please run /start first to get set up!',
            { parse_mode: 'Markdown' }
          );
          return;
        }
      }

      // Track onramp started event
      try {
        await trackEvent('onramp_started', {
          user_id: actualUserId,
          source: 'bot_integration',
          has_params: Object.keys(params).length > 0,
          timestamp: new Date().toISOString()
        }, actualUserId);
      } catch (trackingError) {
        console.error('[BotIntegration] Error tracking onramp_started:', trackingError);
      }

      // If user provided specific parameters, show them in the response
      let responseText = '🪙 **Buy Crypto with Fiat Currency**\n\n';

      // Check if user mentioned specific tokens, amounts, or currencies
      const mentionedToken = params.token ||
        (params.text && (params.text.includes('USDC') ? 'USDC' :
          params.text.includes('USDT') ? 'USDT' :
            params.text.includes('CUSD') ? 'CUSD' : null));

      const mentionedAmount = params.amount ||
        (params.text && params.text.match(/\$?(\d+(?:\.\d+)?)/)?.[1]);

      const mentionedCurrency = params.currency ||
        (params.text && (params.text.includes('NGN') || params.text.includes('naira') ? 'NGN' :
          params.text.includes('KES') ? 'KES' :
            params.text.includes('GHS') ? 'GHS' :
              params.text.includes('UGX') ? 'UGX' :
                params.text.includes('TZS') ? 'TZS' : null));

      if (mentionedToken || mentionedAmount || mentionedCurrency) {
        responseText += '✨ **I noticed you mentioned:**\n';
        if (mentionedToken) responseText += `• Token: ${mentionedToken}\n`;
        if (mentionedAmount) responseText += `• Amount: $${mentionedAmount}\n`;
        if (mentionedCurrency) responseText += `• Currency: ${mentionedCurrency}\n`;
        responseText += '\n';
      }

      responseText += '💡 **How to buy:**\n';
      responseText += '1. Use `/buy_crypto` command\n';
      responseText += '2. Select your token and network\n';
      responseText += '3. Choose your currency\n';
      responseText += '4. Enter amount and confirm\n\n';

      responseText += '**Supported:**\n';
      responseText += '• **Tokens:** USDC, USDT, cUSD\n';
      responseText += '• **Networks:** Solana, Base, Celo, Lisk\n';
      responseText += '• **Currencies:** NGN, KES, GHS, UGX, TZS\n';
      responseText += '• **Limits:** $5 - $10,000 USD equivalent';

      const keyboard = {
        inline_keyboard: [
          [{ text: '🪙 Start Purchase', callback_data: 'start_onramp' }],
          [
            { text: '📋 View History', callback_data: 'onramp_history' },
            { text: '❓ Help', callback_data: 'help' }
          ]
        ]
      };

      console.log('[BotIntegration] Sending onramp message to chatId:', chatId);
      console.log('[BotIntegration] Message content:', responseText);
      console.log('[BotIntegration] Keyboard:', JSON.stringify(keyboard));

      try {
        const result = await this.bot.sendMessage(chatId, responseText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        console.log('[BotIntegration] Onramp message sent successfully, result:', result);
      } catch (sendError) {
        console.error('[BotIntegration] Error sending onramp message:', sendError);
        throw sendError;
      }

    } catch (error) {
      console.error('[BotIntegration] Error in handleOnramp:', error);
      await this.bot.sendMessage(chatId,
        '❌ Error processing onramp request. Please try again or contact support.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Handle buy crypto command (alias for handleOnramp)
   */
  async handleBuyCrypto(chatId: number, userId: string, params: any = {}) {
    return this.handleOnramp(chatId, userId, params);
  }

  /**
   * Handle onramp message (for message-based routing)
   */
  async handleOnrampMessage(message: TelegramBot.Message, userId: string) {
    const chatId = message.chat.id;
    const params = {
      text: message.text,
      messageId: message.message_id
    };

    return this.handleOnramp(chatId, userId, params);
  }

  /**
   * Handle onramp transaction history
   */
  async handleOnrampHistory(chatId: number, userId: string) {
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

      const transactions = await this.fonbnkService.getUserTransactionHistory(actualUserId, 10);

      if (transactions.length === 0) {
        await this.bot.sendMessage(chatId,
          '📝 **No onramp transactions found**\n\nYou haven\'t made any crypto purchases yet. Use /buy_crypto to start your first purchase!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = '📋 **Your Recent Crypto Purchases**\n\n';

      transactions.forEach((tx, index) => {
        const statusEmoji = tx.status === 'completed' ? '✅' :
          tx.status === 'failed' ? '❌' :
            tx.status === 'processing' ? '⏳' : '🕐';

        message += `${index + 1}. ${statusEmoji} **${tx.token}** on ${this.formatNetworkName(tx.chain)}\n`;
        message += `   💰 ${tx.amount} ${tx.token} (${tx.fiatAmount} ${tx.fiatCurrency})\n`;
        message += `   📅 ${tx.createdAt.toLocaleDateString()}\n`;
        if (tx.fonbnkTransactionId) {
          message += `   🆔 \`${tx.fonbnkTransactionId}\`\n`;
        }
        message += '\n';
      });

      message += '💡 Use `/onramp_status <transaction_id>` to check specific transaction status';

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error getting onramp history:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading transaction history. Please try again.');
    }
  }

  /**
   * Handle onramp transaction status check
   */
  async handleOnrampStatus(chatId: number, userId: string, transactionId: string) {
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

      const transaction = await this.fonbnkService.checkTransactionStatus(transactionId);

      if (!transaction) {
        await this.bot.sendMessage(chatId, '❌ Transaction not found. Please check the transaction ID.');
        return;
      }

      if (transaction.userId !== actualUserId) {
        await this.bot.sendMessage(chatId, '❌ You can only check your own transactions.');
        return;
      }

      const statusEmoji = transaction.status === 'completed' ? '✅' :
        transaction.status === 'failed' ? '❌' :
          transaction.status === 'processing' ? '⏳' : '🕐';

      let message = `${statusEmoji} **Transaction Status**\n\n`;
      message += `🆔 **ID:** \`${transaction.fonbnkTransactionId}\`\n`;
      message += `🪙 **Token:** ${transaction.token} on ${this.formatNetworkName(transaction.chain)}\n`;
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

      // Add action buttons based on status
      const keyboard: any = { inline_keyboard: [] };

      if (transaction.status === 'pending' && transaction.fonbnkPaymentUrl) {
        keyboard.inline_keyboard.push([
          { text: '💳 Complete Payment', url: transaction.fonbnkPaymentUrl }
        ]);
      }

      keyboard.inline_keyboard.push([
        { text: '📋 View History', callback_data: 'onramp_history' },
        { text: '🪙 Buy More', callback_data: 'start_onramp' }
      ]);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('Error checking onramp status:', error);
      await this.bot.sendMessage(chatId, '❌ Error checking transaction status. Please try again.');
    }
  }

  /**
   * Handle onramp welcome/info message
   */
  async handleOnrampInfo(chatId: number) {
    try {
      const supportedTokens = await this.fonbnkService.getSupportedTokens();
      const supportedCurrencies = await this.fonbnkService.getSupportedCurrencies();

      let message = '🪙 **Buy Crypto with Fiat Currency**\n\n';
      message += '**Supported Tokens:**\n';
      supportedTokens.forEach(token => {
        message += `• **${token.symbol}** - ${token.name}\n`;
        message += `  Networks: ${token.chains.map(chain => this.formatNetworkName(chain)).join(', ')}\n`;
      });

      message += '\n**Supported Currencies:**\n';
      supportedCurrencies.forEach(currency => {
        message += `• **${currency.symbol} ${currency.name}** (${currency.code})\n`;
        message += `  Regions: ${currency.regions.join(', ')}\n`;
      });

      message += '\n💡 **How it works:**\n';
      message += '1. Choose your token and network\n';
      message += '2. Select your local currency\n';
      message += '3. Enter the amount to spend\n';
      message += '4. Complete payment via secure link\n';
      message += '5. Receive tokens in your wallet\n\n';
      message += '⏱️ **Processing time:** 1-5 minutes after payment\n';
      message += '💰 **Limits:** $5 - $10,000 USD equivalent\n';
      message += '🔒 **Secure:** Powered by Fonbnk';

      const keyboard = {
        inline_keyboard: [
          [{ text: '🪙 Start Purchase', callback_data: 'start_onramp' }],
          [
            { text: '📋 View History', callback_data: 'onramp_history' },
            { text: '❓ Help', callback_data: 'help' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      console.error('Error showing onramp info:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading onramp information. Please try again.');
    }
  }

  // Enhanced Natural Language Earnings Processing
  async handleNaturalLanguageEarnings(chatId: number, userId: string, query: string) {
    try {
      console.log('[BotIntegration] Processing natural language earnings query:', query);
      
      // Get user's wallet addresses
      const actualUserId = await this.getUserIdByChatId(chatId);
      const { data: wallets } = await supabase
        .from('wallets')
        .select('address')
        .eq('user_id', actualUserId);

      if (!wallets || wallets.length === 0) {
        await this.bot.sendMessage(chatId,
          '💡 You don\'t have a wallet yet. Create one to start tracking your earnings.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '🔗 Create Wallet', callback_data: 'create_wallets' }
              ]]
            }
          }
        );
        return;
      }

      // Get user data for PDF generation
      const { data: userData } = await supabase
        .from('users')
        .select('name, telegram_first_name, telegram_last_name, telegram_username')
        .eq('id', actualUserId)
        .single();

      const userDataFormatted = userData ? {
        name: userData.name,
        telegramFirstName: userData.telegram_first_name,
        telegramLastName: userData.telegram_last_name,
        telegramUsername: userData.telegram_username
      } : undefined;

      // Process natural language query
      const { getEarningsForNaturalQuery, formatEarningsForNaturalLanguage } = await import('../lib/earningsService');
      
      const walletAddresses = wallets.map(w => w.address);
      const earningsData = await getEarningsForNaturalQuery(query, walletAddresses, userDataFormatted);
      
      // Format response for Telegram with safe text formatting
      const response = formatEarningsForNaturalLanguage(earningsData, query, 'telegram');
      
      // Clean response to avoid Telegram parsing errors
      const safeResponse = response
        .replace(/\*\*(.*?)\*\*/g, '*$1*') // Convert ** to * for Telegram
        .replace(/([_~`])/g, '\\$1') // Escape special characters
        .replace(/\n{3,}/g, '\n\n'); // Limit consecutive newlines
      
      // Check if this is a PDF generation request
      const isPdfRequest = query.toLowerCase().includes('pdf') || 
                          query.toLowerCase().includes('report') || 
                          query.toLowerCase().includes('generate') ||
                          query.toLowerCase().includes('download');

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "📄 Generate PDF Report", callback_data: "generate_earnings_pdf_natural" },
            { text: "📊 Business Dashboard", callback_data: "business_dashboard" }
          ]
        ]
      };

      await this.bot.sendMessage(chatId, safeResponse, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });

      // Auto-generate PDF if requested
      if (isPdfRequest) {
        await this.handleNaturalLanguagePdfGeneration(chatId, actualUserId, query, walletAddresses, userDataFormatted);
      }

    } catch (error) {
      console.error('[BotIntegration] Error processing natural language earnings:', error);
      
      // Import error handler for better error messages
      const { EarningsErrorHandler } = await import('../lib/earningsErrorHandler');
      const errorMessage = EarningsErrorHandler.formatErrorForUser(
        error instanceof Error ? error : new Error(String(error)),
        query,
        'telegram'
      );
      
      await this.bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
    }
  }

  // Enhanced PDF Generation with Natural Language Support
  async handleNaturalLanguagePdfGeneration(
    chatId: number, 
    userId: string, 
    query: string, 
    walletAddresses: string[], 
    userData?: any
  ) {
    try {
      await this.bot.sendMessage(chatId, '📄 Generating your personalized earnings PDF report... Please wait.');

      const { generateEarningsPdfForQuery } = await import('../lib/earningsService');
      const pdfBuffer = await generateEarningsPdfForQuery(query, walletAddresses, userData);

      // Extract time context for filename
      const { TimePeriodExtractor } = await import('../lib/timePeriodExtractor');
      const timePeriod = TimePeriodExtractor.extractFromQuery(query);
      const timeContext = timePeriod ? timePeriod.displayName.replace(/\s+/g, '-').toLowerCase() : 'custom';
      
      const filename = `earnings-report-${timeContext}-${new Date().toISOString().split('T')[0]}.pdf`;

      await this.bot.sendDocument(chatId, pdfBuffer, {
        caption: '📄 **Your Personalized Earnings Report is Ready!**\n\n✨ This report includes:\n• Period-specific insights\n• Visual earnings breakdown\n• Professional formatting\n• Motivational content\n• Complete transaction history\n\n💡 Keep building your financial future!',
        parse_mode: 'Markdown'
      }, {
        filename
      });

    } catch (error) {
      console.error('[BotIntegration] Error generating natural language PDF:', error);
      await this.bot.sendMessage(chatId, '❌ Error generating PDF report. Please try again later.');
    }
  }

  // Enhanced earnings command with natural language support
  async handleEnhancedEarningsCommand(chatId: number, userId: string, message?: string) {
    // If message contains natural language, process it
    if (message && message.length > 10) {
      await this.handleNaturalLanguageEarnings(chatId, userId, message);
      return;
    }

    // Otherwise, show the traditional earnings interface
    await this.handleEarningsWithWallet(chatId, userId);
  }

  // Quick earnings shortcuts
  async handleEarningsShortcuts(chatId: number, userId: string, shortcut: string) {
    const shortcuts: { [key: string]: string } = {
      'this_month': 'show my earnings this month',
      'last_month': 'show my earnings last month',
      'this_week': 'show my earnings this week',
      'this_year': 'show my earnings this year',
      'generate_pdf': 'generate earnings PDF this month'
    };

    const query = shortcuts[shortcut];
    if (query) {
      await this.handleNaturalLanguageEarnings(chatId, userId, query);
    } else {
      await this.handleEarningsWithWallet(chatId, userId);
    }
  }

  // Milestone Management Methods

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
      } else if (baseCommand === '🎯 milestones') {
        await this.showMilestoneMenu(chatId, userId);
      }
    } catch (error) {
      console.error('[BotIntegration] Error handling milestone command:', error);
      await this.bot.sendMessage(chatId, '❌ Error processing milestone command. Please try again.');
    }
  }

  /**
   * Show milestone menu with options
   */
  private async showMilestoneMenu(chatId: number, userId: string): Promise<void> {
    try {
      const keyboard = {
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

      await this.bot.sendMessage(chatId, menuText, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });
    } catch (error) {
      console.error('[BotIntegration] Error showing milestone menu:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading milestone menu. Please try again.');
    }
  }

  /**
   * Show list of user's milestones
   */
  public async showMilestoneList(chatId: number, userId: string): Promise<void> {
    try {
      // Get user's milestones from database
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
        console.error('[BotIntegration] Error fetching milestones:', error);
        await this.bot.sendMessage(chatId, '❌ Error loading your milestones. Please try again.');
        return;
      }

      if (!milestones || milestones.length === 0) {
        await this.bot.sendMessage(chatId, '📋 **No Milestones Found**\n\nYou don\'t have any active milestones at the moment.\n\nMilestones will appear here when you have active contracts with milestone-based payments.');
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
        const keyboard = {
          inline_keyboard: [
            [{ text: '✅ Submit Milestone', callback_data: 'milestone_submit' }],
            [{ text: '🔄 Refresh List', callback_data: 'milestone_list' }]
          ]
        };
        
        message += '\n💡 **Tip:** Click "Submit Milestone" when you\'ve completed work on any in-progress milestone.';
        
        await this.bot.sendMessage(chatId, message, { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        });
      } else {
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      }

    } catch (error) {
      console.error('[BotIntegration] Error showing milestone list:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading milestone list. Please try again.');
    }
  }

  /**
   * Show milestone submission form
   */
  public async showMilestoneSubmissionForm(chatId: number, userId: string): Promise<void> {
    try {
      // Get user's in-progress milestones
      const { data: milestones, error } = await supabase
        .from('contract_milestones')
        .select(`
          id,
          title,
          description,
          amount,
          deadline,
          status,
          contract_id,
          project_contracts (
            project_title,
            client_email,
            freelancer_id
          )
        `)
        .eq('project_contracts.freelancer_id', userId)
        .in('status', ['pending', 'in_progress'])
        .order('deadline', { ascending: true });

      if (error) {
        console.error('[BotIntegration] Error fetching in-progress milestones:', error);
        await this.bot.sendMessage(chatId, '❌ Error loading your milestones. Please try again.');
        return;
      }

      if (!milestones || milestones.length === 0) {
        await this.bot.sendMessage(chatId, '📋 **No Available Milestones**\n\nYou don\'t have any milestones available for submission.\n\nAll your milestones are either completed or awaiting approval.');
        return;
      }

      let message = '✅ **Submit Milestone Completion**\n\nSelect a milestone to submit (you can submit any pending or in-progress milestone):\n\n';
      
      const keyboard = {
        inline_keyboard: milestones.map((milestone, index) => {
          const contract = Array.isArray(milestone.project_contracts) 
            ? milestone.project_contracts[0] 
            : milestone.project_contracts;
          
          return [{
            text: `${index + 1}. ${milestone.title} ($${milestone.amount}) - ${milestone.status}`,
            callback_data: `milestone_submit_${milestone.id}`
          }];
        })
      };

      // Add cancel button
      keyboard.inline_keyboard.push([{ text: '❌ Cancel', callback_data: 'milestone_menu' }]);

      await this.bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });

    } catch (error) {
      console.error('[BotIntegration] Error showing milestone submission form:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading submission form. Please try again.');
    }
  }

  /**
   * Show milestones approaching deadline
   */
  private async showMilestonesApproachingDeadline(chatId: number, userId: string): Promise<void> {
    try {
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
        console.error('[BotIntegration] Error fetching approaching milestones:', error);
        await this.bot.sendMessage(chatId, '❌ Error loading milestones. Please try again.');
        return;
      }

      if (!milestones || milestones.length === 0) {
        await this.bot.sendMessage(chatId, '✅ **No Urgent Milestones**\n\nYou don\'t have any milestones due in the next 7 days.\n\nKeep up the great work! 🎉');
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

      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ Submit Milestone', callback_data: 'milestone_submit' }],
          [{ text: '📋 View All Milestones', callback_data: 'milestone_list' }]
        ]
      };

      await this.bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });

    } catch (error) {
      console.error('[BotIntegration] Error showing approaching milestones:', error);
      await this.bot.sendMessage(chatId, '❌ Error loading approaching milestones. Please try again.');
    }
  }

  /**
   * Handle milestone submission
   */
  async handleMilestoneSubmission(chatId: number, userId: string, milestoneId: string): Promise<void> {
    try {
      // Get milestone details
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
        await this.bot.sendMessage(chatId, '❌ Milestone not found. Please try again.');
        return;
      }

      if (!['pending', 'in_progress'].includes(milestone.status)) {
        await this.bot.sendMessage(chatId, `❌ This milestone is currently "${milestone.status}" and cannot be submitted.`);
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

      const keyboard = {
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

      await this.bot.sendMessage(chatId, confirmationMessage, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });

    } catch (error) {
      console.error('[BotIntegration] Error handling milestone submission:', error);
      await this.bot.sendMessage(chatId, '❌ Error processing milestone submission. Please try again.');
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
   * Process milestone completion
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

        await this.bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

        // Clear user state
        await supabase
          .from('user_states')
          .delete()
          .eq('user_id', userId)
          .eq('state_type', 'awaiting_milestone_completion');

      } else {
        await this.bot.sendMessage(chatId, `❌ **Submission Failed**\n\n${result.error || 'Unknown error occurred'}\n\nPlease try again.`);
      }

    } catch (error) {
      console.error('[BotIntegration] Error processing milestone completion:', error);
      await this.bot.sendMessage(chatId, '❌ Error submitting milestone. Please try again.');
    }
  }

  /**
   * Handle milestone completion notes input
   */
  async handleMilestoneCompletionNotes(chatId: number, userId: string, text: string): Promise<boolean> {
    try {
      // Check if user is in milestone completion state
      const { data: userState } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_milestone_completion')
        .single();

      if (!userState) {
        return false; // User is not in milestone completion state
      }

      const milestoneId = userState.state_data?.milestone_id;
      if (!milestoneId) {
        return false;
      }

      // Process the completion notes
      await this.processMilestoneCompletion(chatId, userId, milestoneId, text);
      return true;

    } catch (error) {
      console.error('[BotIntegration] Error handling milestone completion notes:', error);
      return false;
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

        await this.bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
      } else {
        await this.bot.sendMessage(chatId, `❌ **Failed to Start Milestone**\n\n${result.error || 'Unknown error occurred'}\n\nPlease try again.`);
      }

    } catch (error) {
      console.error('[BotIntegration] Error starting milestone:', error);
      await this.bot.sendMessage(chatId, '❌ Error starting milestone. Please try again.');
    }
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
   * Show contract completion form for active contracts
   */
  public async showContractCompletionForm(chatId: number, userId: string): Promise<void> {
    try {
      // Get user's active contracts only
      const { data: contracts, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          token_address,
          chain,
          status,
          client_email,
          created_at,
          deadline
        `)
        .eq('freelancer_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[BotIntegration] Error fetching active contracts:', error);
        await this.bot.sendMessage(chatId, '❌ Error fetching contracts. Please try again later.');
        return;
      }

      if (!contracts || contracts.length === 0) {
        await this.bot.sendMessage(chatId,
          '📋 **No Active Contracts Found**\n\n' +
          'You don\'t have any active contracts to complete.\n\n' +
          'Active contracts are those that are currently in progress.\n' +
          'Use /contract to create your first contract!',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Show active contracts with Mark as Complete buttons
      let selectionMessage = '🎯 **Mark Contract as Complete**\n\n';
      selectionMessage += 'Here are your active contracts. Select the one you want to mark as complete and send to the client:\n\n';

      const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

      for (const contract of contracts) {
        const tokenType = this.getTokenTypeFromAddress(contract.token_address, contract.chain);
        const deadline = new Date(contract.deadline).toLocaleDateString();

        selectionMessage += `✅ **${contract.project_title}**\n`;
        selectionMessage += `💰 ${contract.total_amount} ${tokenType}\n`;
        selectionMessage += `📅 Deadline: ${deadline}\n`;
        selectionMessage += `📧 Client: ${contract.client_email}\n\n`;

        keyboard.push([
          {
            text: `✅ Mark as Complete - ${contract.project_title}`,
            callback_data: `mark_contract_complete_${contract.id}`
          }
        ]);
      }

      keyboard.push([
        { text: '❌ Cancel', callback_data: 'cancel_contract_completion' }
      ]);

      await this.bot.sendMessage(chatId, selectionMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

    } catch (error) {
      console.error('[BotIntegration] Error showing contract completion form:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to load contract completion form. Please try again later.');
    }
  }

  /**
   * Handle contract completion submission
   */
  async handleContractCompletion(chatId: number, userId: string, completionNotes: string): Promise<void> {
    try {
      // Get user state for contract completion
      const { data: userState } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_contract_completion')
        .single();

      if (!userState?.state_data) {
        await this.bot.sendMessage(chatId, '❌ Contract completion session expired. Please start again with /complete.');
        return;
      }

      const contractData = userState.state_data;

      // Update contract status to completed
      const { error: updateError } = await supabase
        .from('project_contracts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completion_notes: completionNotes
        })
        .eq('id', contractData.contract_id);

      if (updateError) {
        console.error('[BotIntegration] Error updating contract status:', updateError);
        await this.bot.sendMessage(chatId, '❌ Failed to update contract status. Please try again.');
        return;
      }

      // Project completed successfully - invoice will be generated through existing system
      const successMessage = `✅ **Project Completed Successfully!**

Your project completion has been submitted.

📋 **Contract:** ${contractData.contract_title}
💰 **Amount:** ${contractData.total_amount} ${contractData.currency || 'USD'}
📧 **Client:** ${contractData.client_name}

**Completed Work:**
${completionNotes}

The contract has been marked as completed. You can generate an invoice through the regular invoice system, and the client will be able to view and pay for your completed work.`;

      await this.bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

      // Clear user state
      await supabase
        .from('user_states')
        .delete()
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_contract_completion');

    } catch (error) {
      console.error('[BotIntegration] Error processing contract completion:', error);
      await this.bot.sendMessage(chatId, '❌ Error submitting project completion. Please try again.');
    }
  }

  /**
   * Handle contract completion notes input
   */
  async handleContractCompletionNotes(chatId: number, userId: string, text: string): Promise<boolean> {
    try {
      // Check if user is in contract completion state (old or new)
      const { data: userState } = await supabase
        .from('user_states')
        .select('state_data, state_type')
        .eq('user_id', userId)
        .or('state_type.eq.awaiting_contract_completion,state_type.eq.awaiting_completion_details')
        .single();

      if (!userState) {
        return false; // Not in contract completion state
      }

      // Process the completion notes based on state type
      if (userState.state_type === 'awaiting_completion_details') {
        await this.handleContractCompletionSubmission(chatId, userId, text);
      } else {
        await this.handleContractCompletion(chatId, userId, text);
      }
      return true;

    } catch (error) {
      console.error('[BotIntegration] Error handling contract completion notes:', error);
      return false;
    }
  }

  /**
   * Handle marking contract as complete and sending to client for approval
   */
  async handleMarkContractComplete(chatId: number, userId: string, contractId: string): Promise<void> {
    try {
      // Get the selected contract details
      const { data: contract, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          token_address,
          chain,
          status,
          client_email,
          created_at,
          freelancer_id
        `)
        .eq('freelancer_id', userId)
        .eq('id', contractId)
        .eq('status', 'active')
        .single();

      if (error || !contract) {
        await this.bot.sendMessage(chatId, '❌ Active contract not found. Please try again.');
        return;
      }

      // Store contract ID in user state for completion processing
      await supabase
        .from('user_states')
        .upsert({
          user_id: userId,
          state_type: 'awaiting_completion_details',
          state_data: {
            contract_id: contract.id,
            contract_title: contract.project_title,
            client_email: contract.client_email,
            total_amount: contract.total_amount,
            token_address: contract.token_address,
            chain: contract.chain
          },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,state_type'
        });

      const completionMessage = `🎯 **Mark Contract as Complete**

**Project:** ${contract.project_title}
**Client:** ${contract.client_email}
**Amount:** ${this.getTokenTypeFromAddress(contract.token_address, contract.chain)} ${contract.total_amount}

Please provide details about your completed work:

1. **What was delivered:** Describe the work completed
2. **Key achievements:** Main accomplishments
3. **Any notes:** Additional information for the client

Please type your completion details now:`;

      const keyboard = [
        [
          { text: '❌ Cancel', callback_data: 'cancel_contract_completion' }
        ]
      ];

      await this.bot.sendMessage(chatId, completionMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('[BotIntegration] Error handling mark contract complete:', error);
      await this.bot.sendMessage(chatId, '❌ Error marking contract as complete. Please try again.');
    }
  }

  /**
   * Handle contract completion submission and send to client
   */
  async handleContractCompletionSubmission(chatId: number, userId: string, completionDetails: string): Promise<void> {
    try {
      // Get user state for contract completion
      const { data: userState } = await supabase
        .from('user_states')
        .select('state_data')
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_completion_details')
        .single();

      if (!userState?.state_data) {
        await this.bot.sendMessage(chatId, '❌ Contract completion session expired. Please start again with /complete.');
        return;
      }

      const contractData = userState.state_data;

      // Update contract status to pending_client_approval
      const { error: updateError } = await supabase
        .from('project_contracts')
        .update({
          status: 'pending_client_approval',
          completion_details: completionDetails,
          submitted_for_approval_at: new Date().toISOString()
        })
        .eq('id', contractData.contract_id);

      if (updateError) {
        console.error('[BotIntegration] Error updating contract status:', updateError);
        await this.bot.sendMessage(chatId, '❌ Failed to update contract status. Please try again.');
        return;
      }

      // Send email to client with approval link
      try {
        const { sendContractCompletionEmail } = await import('../services/emailService');
        await sendContractCompletionEmail({
          contractId: contractData.contract_id,
          projectTitle: contractData.contract_title,
          clientEmail: contractData.client_email,
          totalAmount: contractData.total_amount,
          tokenType: this.getTokenTypeFromAddress(contractData.token_address, contractData.chain),
          completionDetails: completionDetails
        });

        await this.bot.sendMessage(chatId,
          `✅ **Contract Submitted for Client Approval**

📋 **Project:** ${contractData.contract_title}
💰 **Amount:** ${this.getTokenTypeFromAddress(contractData.token_address, contractData.chain)} ${contractData.total_amount}
📧 **Client:** ${contractData.client_email}

Your completion details have been sent to the client for review and approval.
The client will receive an email with options to:
• ✅ Approve the completed work
• 🔄 Request changes if needed

You'll receive a Telegram notification when the client responds.`,
          { parse_mode: 'Markdown' }
        );

      } catch (emailError) {
        console.error('[BotIntegration] Error sending completion email:', emailError);
        await this.bot.sendMessage(chatId,
          `✅ **Contract Marked as Complete**

📋 **Project:** ${contractData.contract_title}
💰 **Amount:** ${this.getTokenTypeFromAddress(contractData.token_address, contractData.chain)} ${contractData.total_amount}

⚠️ Note: There was an issue sending the email to the client.
Please manually contact your client to review and approve the completed work.`,
          { parse_mode: 'Markdown' }
        );
      }

      // Clear user state
      await supabase
        .from('user_states')
        .delete()
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_completion_details');

    } catch (error) {
      console.error('[BotIntegration] Error handling contract completion submission:', error);
      await this.bot.sendMessage(chatId, '❌ Failed to submit contract completion. Please try again.');
    }
  }

  /**
   * Handle contract selection from multiple contracts list
   */
  async handleContractSelection(chatId: number, userId: string, contractId: string): Promise<void> {
    try {
      // Get the selected contract details
      const { data: contract, error } = await supabase
        .from('project_contracts')
        .select(`
          id,
          project_title,
          total_amount,
          token_address,
          chain,
          status,
          client_email,
          created_at
        `)
        .eq('freelancer_id', userId)
        .eq('id', contractId)
        .single();

      if (error || !contract) {
        await this.bot.sendMessage(chatId, '❌ Contract not found. Please try again.');
        return;
      }

      // Get token type from address
      const tokenType = this.getTokenTypeFromAddress(contract.token_address, contract.chain);
      const statusEmoji = this.getStatusEmoji(contract.status);

      // Show contract details with options to send to client
      const contractMessage = `📄 **Contract Details**

${statusEmoji} **Status:** ${contract.status.toUpperCase()}
**Project:** ${contract.project_title}
**Client:** ${contract.client_email}
**Amount:** ${contract.total_amount} ${tokenType}
**Network:** ${contract.chain.toUpperCase()}
**Created:** ${new Date(contract.created_at).toLocaleDateString()}

What would you like to do with this contract?`;

      const keyboard = [
        [
          { text: '📧 Send to Client', callback_data: `contract_send_email_${contract.id}` },
          { text: '📄 View PDF', callback_data: `contract_view_${contract.id}` }
        ],
        [
          { text: '❌ Cancel', callback_data: 'cancel_contract_completion' }
        ]
      ];

      await this.bot.sendMessage(chatId, contractMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('[BotIntegration] Error handling contract selection:', error);
      await this.bot.sendMessage(chatId, '❌ Error selecting contract. Please try again.');
    }
  }

  /**
   * Cancel contract completion
   */
  async cancelContractCompletion(chatId: number, userId: string): Promise<void> {
    try {
      // Clear user state
      await supabase
        .from('user_states')
        .delete()
        .eq('user_id', userId)
        .eq('state_type', 'awaiting_contract_completion');

      await this.bot.sendMessage(chatId, '❌ Contract completion cancelled. You can start again anytime with /complete.');
    } catch (error) {
      console.error('[BotIntegration] Error cancelling contract completion:', error);
      await this.bot.sendMessage(chatId, '❌ Error cancelling contract completion.');
    }
  }
}
