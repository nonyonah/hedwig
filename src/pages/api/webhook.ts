// src/pages/api/webhook.ts - Telegram Bot Webhook Handler
import type { NextApiRequest, NextApiResponse } from 'next';
import TelegramBot from 'node-telegram-bot-api';
import { handleAction } from '../../api/actions';
import { processInvoiceInput } from '../../lib/invoiceService';
import { processProposalInput } from '../../lib/proposalservice';

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
        `🦉 Welcome to Hedwig Bot!\n\n` +
        `I'm your AI assistant for crypto payments and wallet management.\n\n` +
        `Use the menu below or chat with me naturally!`,
        {
          reply_markup: {
            keyboard: [
              [{ text: '💰 Balance' }, { text: '👛 Wallet' }],
              [{ text: '🔗 Payment Link' }, { text: '📝 Proposal' }],
              [{ text: '🧾 Invoice' }, { text: '📊 View History' }],
              [{ text: '❓ Help' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        }
      );
      break;

    case '/help':
      await bot.sendMessage(chatId,
        `🆘 *Hedwig Bot Help*\n\n` +
        `*Quick Actions:*\n` +
        `💰 Balance - Check wallet balances\n` +
        `👛 Wallet - View wallet addresses\n` +
        `🔗 Payment Link - Create payment requests\n` +
        `📝 Proposal - Create service proposals\n` +
        `🧾 Invoice - Create invoices\n` +
        `📊 View History - See transactions\n\n` +
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
      const walletResponse = await processWithAI('get wallet address', chatId);
      await bot.sendMessage(chatId, walletResponse);
      break;

    case '/balance':
      const balanceResponse = await processWithAI('check balance', chatId);
      await bot.sendMessage(chatId, balanceResponse);
      break;

    default:
      // Handle menu button presses
      const text = msg.text;
      if (text === '💰 Balance') {
        const response = await processWithAI('check balance', chatId);
        await bot.sendMessage(chatId, response);
      } else if (text === '👛 Wallet') {
        const response = await processWithAI('get wallet address', chatId);
        await bot.sendMessage(chatId, response);
      } else if (text === '🔗 Payment Link') {
        await bot.sendMessage(chatId, 
          '🔗 *Create Payment Link*\n\n' +
          'Please provide the details for your payment link:\n' +
          '• Amount (e.g., "10 USDC")\n' +
          '• Description (e.g., "Payment for services")\n\n' +
          'Example: "Create payment link for 50 USDC for web development"',
          { parse_mode: 'Markdown' }
        );
      } else if (text === '📝 Proposal') {
        await bot.sendMessage(chatId,
          '📝 *Create Proposal*\n\n' +
          'Please provide details for your proposal:\n' +
          '• Service type (e.g., "web development")\n' +
          '• Client name\n' +
          '• Project description\n' +
          '• Budget\n\n' +
          'Example: "Create proposal for web development project for John Doe, budget $2000"',
          { parse_mode: 'Markdown' }
        );
      } else if (text === '🧾 Invoice') {
        await bot.sendMessage(chatId,
          '🧾 *Create Invoice*\n\n' +
          'Please provide details for your invoice:\n' +
          '• Client name\n' +
          '• Amount\n' +
          '• Description of work\n\n' +
          'Example: "Create invoice for Jane Smith, $500 for logo design"',
          { parse_mode: 'Markdown' }
        );
      } else if (text === '📊 View History') {
        const response = await processWithAI('view proposals and invoices', chatId);
        await bot.sendMessage(chatId, response);
      } else if (text === '❓ Help') {
        await bot.sendMessage(chatId,
          `🆘 *Hedwig Bot Help*\n\n` +
          `*Quick Actions:*\n` +
          `💰 Balance - Check wallet balances\n` +
          `👛 Wallet - View wallet addresses\n` +
          `🔗 Payment Link - Create payment requests\n` +
          `📝 Proposal - Create service proposals\n` +
          `🧾 Invoice - Create invoices\n` +
          `📊 View History - See transactions\n\n` +
          `*Natural Language:*\n` +
          `You can also chat with me naturally!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(chatId, 
          `Unknown command: ${command}\n\nUse the menu buttons or /help to see available options.`
        );
      }
  }
}

// Process message with AI
async function processWithAI(message: string, chatId: number): Promise<string> {
  try {
    // Get the actual user UUID and Telegram username from the database
    const { supabase } = await import('../../lib/supabase');
    const { data: user } = await supabase
      .from('users')
      .select('id, telegram_username')
      .eq('telegram_chat_id', chatId)
      .single();

    if (!user) {
      return "❌ User not found. Please try /start to initialize your account.";
    }

    const { runLLM } = await import('../../lib/llmAgent');
    // Use Telegram username as identifier, fallback to user UUID if no username
    const userId = user.telegram_username || user.id;
    
    const llmResponse = await runLLM({
      userId,
      message
    });
    
    if (!llmResponse) {
      return "I'm sorry, I couldn't process your request at the moment.";
    }

    // Parse JSON response from LLM agent
    try {
      let jsonContent = llmResponse;
      
      // Check if response is wrapped in markdown code blocks
      if (llmResponse.includes('```json')) {
        const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonContent = jsonMatch[1].trim();
        }
      } else if (llmResponse.includes('```')) {
        // Handle generic code blocks that might contain JSON
        const codeMatch = llmResponse.match(/```\s*([\s\S]*?)\s*```/);
        if (codeMatch && codeMatch[1]) {
          jsonContent = codeMatch[1].trim();
        }
      }
      
      const parsedResponse = JSON.parse(jsonContent);
      
      if (parsedResponse.intent && parsedResponse.params !== undefined) {
        return await formatResponseForUser(parsedResponse, userId, message);
      }
    } catch (parseError) {
      // If it's not JSON, return as is (fallback for plain text responses)
      console.log('[Webhook] Non-JSON response from LLM:', llmResponse);
    }
    
    return llmResponse;
  } catch (error) {
    console.error('[Webhook] Error processing with AI:', error);
    return "I'm experiencing some technical difficulties. Please try again later.";
  }
}

// Function to format LLM response for user and execute actual functions
async function formatResponseForUser(parsedResponse: any, userId: string, userMessage: string): Promise<string> {
  const { intent, params } = parsedResponse;
  
  try {
    switch (intent) {
      case 'welcome':
        return "🦉 Welcome to Hedwig! I'm your crypto assistant. I can help you with:\n\n" +
               "• Creating wallets\n" +
               "• Checking balances\n" +
               "• Sending crypto\n" +
               "• Creating payment links\n" +
               "• Managing invoices and proposals\n\n" +
               "What would you like to do?";
      
      case 'balance':
      case 'wallet_balance':
      case 'get_wallet_balance':
      case 'get_wallet_address':
      case 'send':
      case 'create_payment_link':
      case 'earnings':
      case 'create_wallets':
        // Use the existing actions.ts handler for these intents
        const actionResult = await handleAction(intent, params, userId);
        return actionResult.text;
      
      case 'create_proposal':
        try {
          // Get user info from database
          const { supabase } = await import('../../lib/supabase');
          
          // Determine if userId is a UUID or username and get the actual user UUID
          let actualUserId: string;
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
          
          if (isUUID) {
            actualUserId = userId;
          } else {
            // userId is a username, fetch the actual UUID
            const { data: user, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('telegram_username', userId)
              .single();
            
            if (userError || !user) {
              return "❌ User not found. Please make sure you're registered with the bot.";
            }
            
            actualUserId = user.id;
          }

          // Check if user has wallets
          const { data: wallets } = await supabase
            .from("wallets")
            .select("*")
            .eq("user_id", actualUserId);

          if (!wallets || wallets.length === 0) {
            return "You need a wallet before creating proposals. Please type 'create wallet' to create your wallet first.";
          }
          
          const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', actualUserId)
            .single();
          
          if (!user) {
            return "❌ User not found. Please try again.";
          }
          
          const proposalResult = await processProposalInput(userMessage, user);
          return proposalResult.message;
        } catch (error) {
          console.error('[formatResponseForUser] Proposal error:', error);
          return "❌ Failed to create proposal. Please try again with more details about your service.";
        }
      
      case 'create_invoice':
        try {
          // Get user info from database
          const { supabase } = await import('../../lib/supabase');
          
          // Determine if userId is a UUID or username and get the actual user UUID
          let actualUserId: string;
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
          
          if (isUUID) {
            actualUserId = userId;
          } else {
            // userId is a username, fetch the actual UUID
            const { data: user, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('telegram_username', userId)
              .single();
            
            if (userError || !user) {
              return "❌ User not found. Please make sure you're registered with the bot.";
            }
            
            actualUserId = user.id;
          }

          // Check if user has wallets
          const { data: wallets } = await supabase
            .from("wallets")
            .select("*")
            .eq("user_id", actualUserId);

          if (!wallets || wallets.length === 0) {
            return "You need a wallet before creating invoices. Please type 'create wallet' to create your wallet first.";
          }
          
          const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', actualUserId)
            .single();
          
          if (!user) {
            return "❌ User not found. Please try again.";
          }
          
          const invoiceResult = await processInvoiceInput(userMessage, user);
          return invoiceResult.message;
        } catch (error) {
          console.error('[formatResponseForUser] Invoice error:', error);
          return "❌ Failed to create invoice. Please try again with more details about your project.";
        }
      
      case 'view_proposals':
        try {
          const { supabase } = await import('../../lib/supabase');
          const { data: proposals } = await supabase
            .from('proposals')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);
          
          if (!proposals || proposals.length === 0) {
            return "📋 You don't have any proposals yet. Type 'create proposal' to get started!";
          }
          
          let response = "📋 **Your Recent Proposals**\n\n";
          proposals.forEach((proposal, index) => {
            response += `${index + 1}. **${proposal.project_title || proposal.service_type}**\n`;
            response += `   Client: ${proposal.client_name || 'Not specified'}\n`;
            response += `   Status: ${proposal.status}\n`;
            response += `   Budget: ${proposal.budget ? `$${proposal.budget}` : 'Not specified'}\n\n`;
          });
          
          return response;
        } catch (error) {
          console.error('[formatResponseForUser] View proposals error:', error);
          return "❌ Failed to fetch proposals. Please try again later.";
        }
      
      case 'view_invoices':
        try {
          const { supabase } = await import('../../lib/supabase');
          const { data: invoices } = await supabase
            .from('invoices')
            .select('*')
            .eq('freelancer_email', userId) // Assuming userId is used as email identifier
            .order('date_created', { ascending: false })
            .limit(5);
          
          if (!invoices || invoices.length === 0) {
            return "📋 You don't have any invoices yet. Type 'create invoice' to get started!";
          }
          
          let response = "📋 **Your Recent Invoices**\n\n";
          invoices.forEach((invoice, index) => {
            response += `${index + 1}. **${invoice.invoice_number}**\n`;
            response += `   Client: ${invoice.client_name}\n`;
            response += `   Amount: $${invoice.amount}\n`;
            response += `   Status: ${invoice.status}\n\n`;
          });
          
          return response;
        } catch (error) {
          console.error('[formatResponseForUser] View invoices error:', error);
          return "❌ Failed to fetch invoices. Please try again later.";
        }
      
      case 'get_price':
        return "💱 Price checking feature is currently being updated. Please use external tools for price information.";
        
      case 'clarification':
        return "🤔 I need a bit more information. Could you please clarify what you'd like me to help you with?";
      
      default:
        return "I understand you want help with something. Could you please be more specific about what you'd like me to do?";
    }
  } catch (error) {
    console.error('[formatResponseForUser] Error:', error);
    return "❌ Something went wrong. Please try again later.";
  }
}

// Ensure user exists in database and create CDP wallets
async function ensureUserExists(from: TelegramBot.User, chatId: number): Promise<void> {
  try {
    const { supabase } = await import('../../lib/supabase');
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .single();

    const { data: userId, error } = await supabase.rpc('get_or_create_telegram_user', {
      p_telegram_chat_id: chatId,
      p_telegram_username: from?.username || null,
      p_telegram_first_name: from?.first_name || null,
      p_telegram_last_name: from?.last_name || null,
      p_telegram_language_code: from?.language_code || null,
    });

    if (error) {
      console.error('[Webhook] Error ensuring user exists:', error);
      return;
    }

    // If this is a new user (didn't exist before), create CDP wallets
    if (!existingUser && userId) {
      try {
        const { getOrCreateCdpWallet } = await import('../../lib/cdp');
        
        // Use Telegram username as wallet identifier, fallback to user UUID if no username
        const walletIdentifier = from?.username || userId;
        
        // Create EVM wallet (use evm to match the new chain naming)
        await getOrCreateCdpWallet(walletIdentifier, 'evm');
        console.log('[Webhook] Created EVM wallet for new Telegram user:', walletIdentifier);
        
        // Create Solana wallet (use solana to match the new chain naming)
        await getOrCreateCdpWallet(walletIdentifier, 'solana');
        console.log('[Webhook] Created Solana wallet for new Telegram user:', walletIdentifier);
      } catch (walletError) {
        console.error('[Webhook] Error creating CDP wallets for new user:', walletError);
      }
    }
  } catch (error) {
    console.error('[Webhook] Error in ensureUserExists:', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const update: TelegramBot.Update = req.body;
      console.log('[Webhook] Received update:', {
        updateId: update.update_id,
        type: update.message ? 'message' : update.callback_query ? 'callback_query' : 'other'
      });
      
      // Initialize bot if not already done
      const botInstance = initializeBot();
      
      // Process the webhook update using the bot's built-in method
      botInstance.processUpdate(update);

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[Webhook] Error processing update:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'GET') {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const webhookUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
      
      if (!botToken) {
        return res.status(500).json({ 
          status: 'error',
          error: 'TELEGRAM_BOT_TOKEN not configured'
        });
      }

      if (!webhookUrl) {
        return res.status(500).json({ 
          status: 'error',
          error: 'Webhook URL not configured (NEXT_PUBLIC_APP_URL missing)'
        });
      }

      // Initialize bot to check status
      const botInstance = initializeBot();
      const webhookInfo = await botInstance.getWebHookInfo();
      const expectedUrl = `${webhookUrl}/api/webhook`;
      
      res.status(200).json({ 
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
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to check webhook status'
      });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}