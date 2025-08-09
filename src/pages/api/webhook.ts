// src/pages/api/webhook.ts - Telegram Bot Webhook Handler
import type { NextApiRequest, NextApiResponse } from 'next';
import TelegramBot from 'node-telegram-bot-api';
import { handleAction } from '../../api/actions';
// Dynamic imports to prevent serverEnv loading during build
// import { processInvoiceInput } from '../../lib/invoiceService';
// import { processProposalInput } from '../../lib/proposalservice';
import { BotIntegration } from '../../modules/bot-integration';
import { processInvoiceInput } from '../../lib/invoiceService';
import { processProposalInput } from '../../lib/proposalservice';

// Vercel function configuration - extend timeout for webhook processing
export const config = {
  maxDuration: 60, // 30 seconds for Pro plan, 10 seconds for Hobby plan
};

// Global bot instance for webhook mode
let bot: TelegramBot | null = null;
let botInitialized = false;
let botIntegration: BotIntegration | null = null;

// Initialize bot for webhook mode
function initializeBot() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }

  // Prevent multiple initializations
  if (botInitialized && bot) {
    return bot;
  }

  if (!bot) {
    try {
      // Create bot instance without polling for webhook mode
      bot = new TelegramBot(botToken, { polling: false });
      
      // Initialize bot integration
      botIntegration = new BotIntegration(bot);
      
      // Setup Telegram menu button
      setupTelegramMenu();
      
      // Setup event handlers
      setupBotHandlers();
      botInitialized = true;
      console.log('[Webhook] Bot initialized for webhook mode');
    } catch (error) {
      console.error('[Webhook] Error initializing bot:', error);
      // Reset flags on error
      bot = null;
      botInitialized = false;
      throw error;
    }
  }
  
  return bot;
}

// Setup Telegram menu button
async function setupTelegramMenu() {
  if (!bot) return;
  
  try {
    // Set the menu button for all users
    await bot.setChatMenuButton({
      menu_button: {
        type: 'commands'
      }
    });

    // Set bot commands
    await bot.setMyCommands([
      { command: 'start', description: '🦉 Start Hedwig Bot' },
      { command: 'balance', description: '💰 Check wallet balance' },
      { command: 'wallet', description: '👛 View wallet address' },
      { command: 'send', description: '💸 Send crypto' },
      { command: 'payment', description: '🔗 Create payment link' },
      { command: 'invoice', description: '🧾 Create invoice' },
      { command: 'proposal', description: '📝 Create proposal' },
      { command: 'history', description: '📊 View transaction history' },
      { command: 'help', description: '❓ Get help' }
    ]);
    
    console.log('[Webhook] Telegram menu button configured');
  } catch (error) {
    console.error('[Webhook] Error setting up Telegram menu:', error);
  }
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
      
      // Send typing indicator immediately
      await bot?.sendChatAction(chatId, 'typing');
      
      // Ensure user exists in database (with timeout)
      if (msg.from) {
        try {
          await Promise.race([
            ensureUserExists(msg.from, chatId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('User creation timeout')), 8000))
          ]);
        } catch (userError) {
          console.error('[Webhook] Error ensuring user exists:', userError);
          // Continue processing even if user creation fails
        }
      }

      // Handle commands
      if (msg.text?.startsWith('/')) {
        await handleCommand(msg);
      } else if (msg.text) {
        // Check if BotIntegration can handle this message first
        try {
          if (botIntegration && await botIntegration.handleMessage(msg)) {
            return; // BotIntegration handled it
          }
        } catch (integrationError) {
          console.error('[Webhook] BotIntegration error:', integrationError);
          // Continue to AI processing if integration fails
        }
        
        // Process with AI (with timeout)
        try {
          const response = await Promise.race([
            processWithAI(msg.text, chatId),
            new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error('AI processing timeout')), 15000)
            )
          ]);
          
          // Only send message if response is not empty
          if (response && response.trim() !== '') {
            await bot?.sendMessage(chatId, response);
          }
        } catch (aiError) {
          console.error('[Webhook] AI processing error:', aiError);
          await bot?.sendMessage(chatId, 
            '🤖 I\'m processing your request. This might take a moment...\n\n' +
            'If you don\'t receive a response soon, please try again or use a simpler command like /help'
          );
        }
      } else {
        await bot?.sendMessage(chatId, 'Please send a text message or use a command like /start');
      }
    } catch (error) {
      console.error('[Webhook] Error handling message:', error);
      try {
        await bot?.sendMessage(msg.chat.id, 'Sorry, I encountered an error. Please try again.');
      } catch (sendError) {
        console.error('[Webhook] Error sending error message:', sendError);
      }
    }
  });

  // Handle callback queries
  bot.on('callback_query', async (callbackQuery) => {
    try {
      console.log('[Webhook] Received callback query:', callbackQuery.data);
      const chatId = callbackQuery.message?.chat.id;
      const data = callbackQuery.data;
      
      if (!chatId) {
        await bot?.answerCallbackQuery(callbackQuery.id, { text: 'Error: Chat not found' });
        return;
      }

      // Answer callback query immediately to prevent timeout
      await bot?.answerCallbackQuery(callbackQuery.id, { text: 'Processing...' });

      // Check if it's a business feature callback (with timeout)
      try {
        if (botIntegration && await Promise.race([
          botIntegration.handleCallback(callbackQuery),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Integration callback timeout')), 8000)
          )
        ])) {
          return; // BotIntegration handled it
        }
      } catch (integrationError) {
        console.error('[Webhook] BotIntegration callback error:', integrationError);
        // Continue to manual handling if integration fails
      }

      // Handle different callback actions
      switch (data) {
        case 'refresh_balances':
          const refreshBalanceResponse = await processWithAI('check balance', chatId);
          break;
          
        case 'start_send_token_flow':
        case 'send_crypto':
          const sendResponse = await processWithAI('send crypto template', chatId);
          if (sendResponse && sendResponse.trim() !== '') {
            await bot?.sendMessage(chatId, sendResponse);
          }
          break;

        case 'check_balance':
          const balanceResponse = await processWithAI('check balance', chatId);
          // The response will be sent by the processWithAI function
          break;

        case 'cancel_send':
          await bot?.sendMessage(chatId, '❌ Transfer cancelled.');
          break;
          
        default:
          // Handle confirm_send callback data
          if (data?.startsWith('confirm_')) {
            
            // Immediately disable the button by editing the message
            if (callbackQuery.message) {
              try {
                await bot?.editMessageReplyMarkup(
                  { inline_keyboard: [] }, // Remove all buttons
                  {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id
                  }
                );
              } catch (error) {
                console.error('[Webhook] Error disabling button:', error);
              }
            }
            
            // Parse transaction details from the original message text
            const messageText = callbackQuery.message?.text || '';
            console.log('[Webhook] Parsing message text:', messageText);
            
            // Extract transaction details from the message
            // Look for the "Transaction Details:" section which contains the full, untruncated values
            const transactionDetailsMatch = messageText.match(/\*\*Transaction Details:\*\*\n([\s\S]*?)$/);
            let amount, token, recipient, network;
            
            if (transactionDetailsMatch) {
              const detailsSection = transactionDetailsMatch[1];
              console.log('[Webhook] Transaction details section found:', detailsSection);
              
              // Extract from the details section which has full values
              const amountMatch = detailsSection.match(/Amount:\s*([^\n\r]+)/);
              const tokenMatch = detailsSection.match(/Token:\s*([^\n\r]+)/);
              const toMatch = detailsSection.match(/To:\s*([^\n\r]+)/);
              const networkMatch = detailsSection.match(/Network:\s*([^\n\r]+)/);
              
              amount = amountMatch?.[1]?.trim();
              token = tokenMatch?.[1]?.trim();
              recipient = toMatch?.[1]?.trim();
              network = networkMatch?.[1]?.trim();
              
              console.log('[Webhook] Extracted from Transaction Details section:', {
                amount,
                token,
                recipient,
                network
              });
            } else {
              console.log('[Webhook] Transaction Details section not found, trying fallback parsing');
              // Fallback: try to extract from the entire message
              // Look for the last occurrence of each field to get the full values
              const amountMatches = [...messageText.matchAll(/Amount:\s*([^\n\r]+)/g)];
              const tokenMatches = [...messageText.matchAll(/Token:\s*([^\n\r]+)/g)];
              const toMatches = [...messageText.matchAll(/To:\s*([^\n\r]+)/g)];
              const networkMatches = [...messageText.matchAll(/Network:\s*([^\n\r]+)/g)];
              
              // Use the last match (from Transaction Details section if it exists)
              amount = amountMatches.length > 0 ? amountMatches[amountMatches.length - 1][1]?.trim() : undefined;
              token = tokenMatches.length > 0 ? tokenMatches[tokenMatches.length - 1][1]?.trim() : undefined;
              recipient = toMatches.length > 0 ? toMatches[toMatches.length - 1][1]?.trim() : undefined;
              network = networkMatches.length > 0 ? networkMatches[networkMatches.length - 1][1]?.trim() : undefined;
              
              console.log('[Webhook] Extracted from fallback parsing:', {
                amount,
                token,
                recipient,
                network
              });
            }
            
            console.log('[Webhook] Parsed transaction details:', {
              amount,
              token,
              recipient,
              network
            });
            
            if (amount && recipient && network) {
              // Import required modules
              const { parseIntentAndParams } = await import('../../lib/intentParser');
              const { handleAction } = await import('../../api/actions');
              
              try {
                // Get the actual user UUID from the database
                const { supabase } = await import('../../lib/supabase');
                const { data: user } = await supabase
                  .from('users')
                  .select('id, telegram_username')
                  .eq('telegram_chat_id', chatId)
                  .single();

                if (!user) {
                  await bot?.sendMessage(chatId, '❌ User not found. Please try /start to initialize your account.');
                  return;
                }

                // Use the user's UUID as the identifier for handleAction
                const transferResult = await handleAction(
                  'send',
                  {
                    amount,
                    token: token === 'native' || token === null ? undefined : token,
                    recipient: recipient,
                    network,
                    confirm: 'true'
                  },
                  user.id
                );
                
                // Send the result
                if (transferResult && typeof transferResult === 'object' && 'text' in transferResult) {
                  const messageOptions: any = { parse_mode: 'Markdown' };
                  if ('reply_markup' in transferResult) {
                    messageOptions.reply_markup = transferResult.reply_markup;
                  }
                  await bot?.sendMessage(chatId, transferResult.text, messageOptions);
                } else if (typeof transferResult === 'string') {
                  await bot?.sendMessage(chatId, transferResult, { parse_mode: 'Markdown' });
                } else {
                  await bot?.sendMessage(chatId, '✅ Transfer completed successfully!');
                }
              } catch (error) {
                console.error('[webhook] Transfer error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await bot?.sendMessage(chatId, `❌ Transfer failed: ${errorMessage}. Please try again.`);
              }
            } else {
              console.log('[Webhook] Failed to parse transaction details from message:', messageText);
              console.log('[Webhook] Missing required fields:', {
                hasAmount: !!amount,
                hasRecipient: !!recipient,
                hasNetwork: !!network,
                hasToken: !!token
              });
              await bot?.sendMessage(chatId, '❌ Could not parse transaction details. Please start the send process again.');
            }
          } else {
            await bot?.answerCallbackQuery(callbackQuery.id, { text: 'Unknown action' });
          }
      }
    } catch (error) {
      console.error('[Webhook] Error handling callback query:', error);
      await bot?.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred' });
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
  const command = msg.text ? msg.text.split(' ')[0].toLowerCase() : '';

  switch (command) {
    case '/start':
      if (botIntegration) {
        await botIntegration.showWelcomeMessage(chatId);
      } else {
        await bot.sendMessage(chatId, 
          `🦉 *Welcome to Hedwig Bot!*\n\n` +
          `I'm your AI assistant for crypto payments and wallet management.\n\n` +
          `🚀 *What I can help you with:*\n` +
          `• 💰 Check wallet balances\n` +
          `• 💸 Send crypto payments\n` +
          `• 📄 Create professional invoices\n` +
          `• 💳 Generate payment links\n` +
          `• 📊 Track earnings and analytics\n` +
          `• 📋 Manage proposals\n\n` +
          `💬 *Just ask me naturally!* Try:\n` +
          `• "Check my balance"\n` +
          `• "Send 10 USDC to 0x123..."\n` +
          `• "Create an invoice for $500"\n` +
          `• "Show my transaction history"\n\n` +
          `📱 Use the menu button or type commands to get started!`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              remove_keyboard: true
            }
          }
        );
      }
      break;

    case '/help':
      await bot.sendMessage(chatId, 
        `🦉 *Welcome to Hedwig!*\n\n` +
        `I'm your crypto assistant. Here's what I can do:\n\n` +
        `*Quick Commands:*\n` +
        `• /start - Get started with Hedwig\n` +
        `• /balance - Check wallet balances\n` +
        `• /wallet - View wallet addresses\n` +
        `• /send - Send crypto to others\n` +
        `• /payment - Create payment links\n` +
        `• /proposal - Create service proposals\n` +
        `• /invoice - Create invoices\n` +
        `• /earnings_summary - View earnings summary\n` +
        `• /business_dashboard - Access business dashboard\n\n` +
        `*Natural Language:*\n` +
        `You can also chat with me naturally! Try:\n` +
        `• "Send 10 USDC to 0x123..."\n` +
        `• "What's my balance?"\n` +
        `• "Create an invoice for $100"\n` +
        `• "Show my earnings summary"\n\n` +
        `💡 *Tip:* Use the menu button (☰) for quick access to commands!`,
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

    case '/send':
      const sendResponse = await processWithAI('send crypto template', chatId);
      if (sendResponse && sendResponse.trim() !== '') {
        await bot.sendMessage(chatId, sendResponse);
      }
      break;

    case '/payment':
      const paymentResponse = await processWithAI('create payment link', chatId);
      await bot.sendMessage(chatId, paymentResponse);
      break;

    case '/proposal':
      const proposalResponse = await processWithAI('create proposal', chatId);
      await bot.sendMessage(chatId, proposalResponse);
      break;

    case '/invoice':
      const invoiceResponse = await processWithAI('create invoice', chatId);
      await bot.sendMessage(chatId, invoiceResponse);
      break;

    case '/earnings_summary':
      const earningsResponse = await processWithAI('show earnings summary', chatId);
      await bot.sendMessage(chatId, earningsResponse);
      break;

    case '/business_dashboard':
      const dashboardResponse = await processWithAI('show business dashboard', chatId);
      await bot.sendMessage(chatId, dashboardResponse);
      break;

    case '/history':
      // Redirect to earnings summary for better user experience
      const redirectResponse = await processWithAI('show earnings summary', chatId);
      await bot.sendMessage(chatId, `📈 *Redirecting to Earnings Summary*\n\n${redirectResponse}`);
      break;

    default:
      // For unknown commands, provide helpful guidance
      await bot.sendMessage(chatId, 
        `❓ Unknown command: ${command}\n\n` +
        `💡 Try these instead:\n` +
        `• Use the menu button (☰) for quick commands\n` +
        `• Type /help to see all available commands\n` +
        `• Chat with me naturally: "Check my balance" or "Send 10 USDC"`
      );
  }
}

// Process message with AI
async function processWithAI(message: string, chatId: number): Promise<string> {
  try {
    // Get the actual user UUID and Telegram username from the database
    const { supabase } = await import('../../lib/supabase');
    const { data: user } = await supabase
      .from('users')
      .select('id, telegram_username, name')
      .eq('telegram_chat_id', chatId)
      .single();

    if (!user) {
      return "❌ User not found. Please try /start to initialize your account.";
    }

    // Check if user has pending context (like waiting for name)
    const { data: session } = await supabase
      .from('sessions')
      .select('context')
      .eq('user_id', user.id)
      .single();

    // Handle pending name collection for proposals/invoices
    if (session?.context && Array.isArray(session.context)) {
      const systemContext = session.context.find((ctx: any) => 
        ctx.role === 'system' && ctx.content
      );
      
      if (systemContext) {
        try {
          const contextData = JSON.parse(systemContext.content);
          
          // If waiting for name and user provided a name
          if (contextData.waiting_for === 'name' && message.trim().length > 0) {
            // Update user's name
            await supabase
              .from('users')
              .update({ name: message.trim() })
              .eq('id', user.id);

            // Clear the waiting context
            await supabase
              .from('sessions')
              .update({ context: [] })
              .eq('user_id', user.id);

            // Process the original pending request
            if (contextData.pending_proposal_message) {
              const { processProposalInput } = await import('../../lib/proposalservice');
              const result = await processProposalInput(contextData.pending_proposal_message, user.id);
              return result.message;
            } else if (contextData.pending_invoice_message) {
              const { processInvoiceInput } = await import('../../lib/invoiceService');
              const updatedUser = { ...user, name: message.trim() };
              const result = await processInvoiceInput(contextData.pending_invoice_message, updatedUser);
              return result.message;
            }
          }
        } catch (parseError) {
          console.error('[processWithAI] Error parsing context:', parseError);
        }
      }
    }

    const { runLLM } = await import('../../lib/llmAgent');
    // Use Telegram username for LLM context, but always use UUID for actions
    const llmUserId = user.telegram_username || user.id;
    
    const llmResponse = await runLLM({
      userId: llmUserId,
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
        return await formatResponseForUser(parsedResponse, user.id, message, chatId);
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
async function formatResponseForUser(parsedResponse: any, userId: string, userMessage: string, chatId?: number): Promise<string> {
  const { intent, params } = parsedResponse;
  
  try {
    switch (intent) {
      case 'welcome':
        return "🦉 **Welcome back to Hedwig!** I'm your AI-powered crypto assistant.\n\n" +
               "🚀 **What I can help you with:**\n" +
               "• 💰 Check wallet balances\n" +
               "• 💸 Send crypto payments\n" +
               "• 📄 Create professional invoices\n" +
               "• 💳 Generate payment links\n" +
               "• 📊 Track earnings and analytics\n" +
               "• 🔄 Perform token swaps\n" +
               "• 📧 Send payment reminders\n" +
               "• 📋 Manage proposals\n\n" +
               "💬 **Just ask me naturally!** Try:\n" +
               "• \"Check my balance\"\n" +
               "• \"Create an invoice for $500\"\n" +
               "• \"Send a reminder to John\"\n" +
               "• \"Show my earnings this month\"\n\n" +
               "What would you like to do today?";
      
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
        
        // If the result has reply_markup and we have a chatId, send the message directly
        if (actionResult.reply_markup && chatId && bot) {
          await bot.sendMessage(chatId, actionResult.text, {
            reply_markup: actionResult.reply_markup,
            parse_mode: 'Markdown'
          });
          return ''; // Return empty string since we already sent the message
        }
        
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

          // No wallet check needed for proposals - removed the wallet validation
          
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
        // Use the existing actions.ts handler for invoice functionality
        const invoiceResult = await handleAction(intent, params, userId);
        return invoiceResult.text;
      
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
      
      case 'send_reminder':
        // Use the existing actions.ts handler for reminder functionality
        const reminderResult = await handleAction(intent, params, userId);
        return reminderResult.text;
      
      case 'get_earnings':
        // Use the existing actions.ts handler for earnings functionality
        const earningsResult = await handleAction(intent, params, userId);
        return earningsResult.text;
      
      case 'get_spending':
        // Use the existing actions.ts handler for spending functionality
        const spendingResult = await handleAction(intent, params, userId);
        return spendingResult.text;
      
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

// Ensure user exists in database and create wallets
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

    // If this is a new user (didn't exist before), create wallets and send welcome message
    if (!existingUser && userId) {
      const userName = from?.first_name || from?.username || 'there';
      
      // Send initial welcome message
      const welcomeMessage = `🦉 Welcome to Hedwig, ${userName}! 

I'm your AI-powered crypto assistant. I'm currently setting up your secure wallets...

⏳ Creating your wallets now...`;

      await bot?.sendMessage(chatId, welcomeMessage);

      try {
        const { getOrCreateCdpWallet } = await import('../../lib/cdp');
        
        // Use Telegram username as wallet identifier, fallback to user UUID if no username
        const walletIdentifier = from?.username || userId;
        
        // Create EVM wallet (use evm to match the new chain naming)
        const evmWallet = await getOrCreateCdpWallet(walletIdentifier, 'evm');
        console.log('[Webhook] Created EVM wallet for new Telegram user:', walletIdentifier);
        
        // Create Solana wallet (use solana to match the new chain naming)
        const solanaWallet = await getOrCreateCdpWallet(walletIdentifier, 'solana');
        console.log('[Webhook] Created Solana wallet for new Telegram user:', walletIdentifier);

        // Send success message with wallet details
        const successMessage = `✅ **Your wallets are ready!**

🔐 **Your Secure Wallets:**

**🟦 Ethereum/Base Wallet:**
\`${evmWallet.address}\`

**🟣 Solana Wallet:**
\`${solanaWallet.address}\`

🎉 **You're all set!** I can help you with:
• 💰 Checking balances
• 💸 Sending crypto
• 📄 Creating invoices
• 💳 Creating payment links
• 📊 Tracking earnings
• 🔄 Token swaps

Just ask me anything like "check my balance" or "create an invoice"!`;

        await bot?.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
        
      } catch (walletError) {
        console.error('[Webhook] Error creating wallets for new user:', walletError);
        
        // Send error message to user
        const errorMessage = `❌ There was an issue setting up your wallets. Please try typing "create wallet" to retry, or contact support if the problem persists.`;
        await bot?.sendMessage(chatId, errorMessage);
      }
    }
  } catch (error) {
    console.error('[Webhook] Error in ensureUserExists:', error);
  }
}

// Async processing function to handle updates without blocking the response
async function processUpdateAsync(update: TelegramBot.Update) {
  try {
    console.log('[Webhook] Processing update asynchronously:', {
      updateId: update.update_id,
      type: update.message ? 'message' : update.callback_query ? 'callback_query' : 'other'
    });
    
    // Initialize bot if not already done
    let botInstance;
    try {
      botInstance = initializeBot();
    } catch (initError) {
      console.error('[Webhook] Bot initialization error in async processing:', initError);
      return;
    }
    
    // Process the webhook update using the bot's built-in method
    try {
      botInstance.processUpdate(update);
    } catch (processError) {
      console.error('[Webhook] Update processing error in async processing:', processError);
    }
  } catch (error) {
    console.error('[Webhook] Error in async processing:', error);
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
      
      // Respond immediately to Telegram to prevent timeout
      res.status(200).json({ ok: true });
      
      // Process the update asynchronously without blocking the response
      // Use setImmediate to ensure the response is sent first
      setImmediate(() => {
        processUpdateAsync(update).catch(error => {
          console.error('[Webhook] Error in async update processing:', error);
        });
      });
      
    } catch (error) {
      console.error('[Webhook] Error processing update:', error);
      // Return 200 to prevent Telegram from retrying failed webhooks
      res.status(200).json({ ok: true, error: 'Processing failed' });
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
      let botInstance;
      try {
        botInstance = initializeBot();
      } catch (initError) {
        console.error('[Webhook] Bot initialization error in GET:', initError);
        return res.status(500).json({ 
          status: 'error',
          error: 'Bot initialization failed'
        });
      }
      
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