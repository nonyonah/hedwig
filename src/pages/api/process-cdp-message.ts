import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  sendWhatsAppMessage, 
  sendWhatsAppImage, 
  sendWhatsAppListMessage, 
  sendWhatsAppReplyButtons,
  validatePhoneNumber 
} from '@/lib/whatsappUtils';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database';
import { 
  WhatsAppResponse, 
  CommandContext, 
  WebhookEntry as WhatsAppWebhookEntry,
  TextResponse,
  ImageResponse,
  ListResponse,
  ButtonsResponse,
  CommandMessage
} from '@/types/whatsapp';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// CORS headers for API responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD, PUT, PATCH, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  'Access-Control-Max-Age': '86400', // 24 hours
};

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase URL or key');
}

const supabase = createClient<Database>(supabaseUrl!, supabaseKey!);

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

// In-memory rate limiting (consider using Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Define a proper CommandResult interface that doesn't conflict with WhatsAppResponse
interface CommandResult {
  success: boolean;
  message: string | WhatsAppResponse;
  type?: string;
  text?: string;
  imageUrl?: string;
  caption?: string;
  header?: string;
  body?: string;
  bodyText?: string;
  buttonText?: string;
  sections?: any[];
  buttons?: any[];
}

// Create a custom context interface without extending CommandContext
interface CustomCommandContext {
  supabase: ReturnType<typeof createClient<Database>>;
  phoneNumber: string;
  message: string;
}

// Type definitions for WhatsApp webhook payload
interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { 
    id: string; 
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  button?: { text: string; payload: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

// WhatsAppValue interface is kept for type checking webhook payloads
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface WhatsAppValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts: WhatsAppContact[];
  messages: WhatsAppMessage[];
  statuses?: Array<{
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code: number; title: string }>;
  }>;
}

type MessageType = 'text' | 'image' | 'button' | 'interactive' | 'list';

interface ProcessedMessage {
  from: string;
  text: string;  // This must always be a string
  messageId: string;
  timestamp: string;
  type: MessageType;
  mediaId?: string;
  buttonId?: string;
  buttonText?: string;
}

// WhatsApp response types are used through their respective interfaces: ImageResponse, ListResponse, ButtonsResponse
// WebhookEntry type checking is done through the WhatsAppWebhookEntry type

/**
 * Processes a WhatsApp message through the CDP agent
 */
async function processWithCDP(message: string, userId: string): Promise<string | null> {
  try {
    // Dynamically import necessary modules
    const { getAgentKit, registerUserWallet, getUserWalletProvider } = await import('@/lib/agentkit');
    const { userHasWalletInDb, getWalletFromDb } = await import('@/lib/walletDb');

    console.log(`Starting CDP processing for user ${userId} with message: ${message}`);

    // Check if this is a blockchain-related query
    const blockchainKeywords = [
      'wallet', 'balance', 'crypto', 'token', 'transfer', 'blockchain', 'eth', 'bitcoin', 
      'transaction', 'nft', 'web3', 'defi', 'swap', 'trade', 'exchange', 'send', 'receive'
    ];
    const isBlockchainQuery = blockchainKeywords.some(keyword => message.toLowerCase().includes(keyword));

    // IMPORTANT: Check if user has a wallet from previous operations, but NEVER create one automatically
    console.log(`Checking if user ${userId} has a wallet already`);
    let wallet = null;
    let hasWallet = false;
    
    // Check the database for a wallet
    console.log(`Checking database for wallet for user ${userId}`);
    const hasWalletInDb = await userHasWalletInDb(userId);
    
    if (hasWalletInDb) {
      console.log(`Found wallet in database for user ${userId}`);
      hasWallet = true;
      
      try {
        // Get the wallet from the database
        const walletFromDb = await getWalletFromDb(userId);
        
        if (walletFromDb) {
          console.log(`Successfully retrieved wallet from database for user ${userId}`);
          
          // Try to get the initialized wallet provider
          wallet = await getUserWalletProvider(userId);
          
          if (!wallet) {
            // Initialize the wallet provider if it doesn't exist
            const { getOrCreateWallet } = await import('@/lib/wallet');
            const result = await getOrCreateWallet(userId);
            wallet = result.provider;
            
            // Register with AgentKit
            await registerUserWallet(userId, wallet);
            console.log(`Registered wallet with AgentKit for user ${userId}`);
          }
        }
      } catch (dbWalletError) {
        console.error('Error initializing wallet from database:', dbWalletError);
        wallet = null;
      }
    }
    
    // Final wallet status
    console.log(`Wallet status for user ${userId}: ${hasWallet ? 'Has wallet' : 'No wallet'}`);
    
    // If this is a blockchain query but user has no wallet, prompt them to create one
    if (isBlockchainQuery && !hasWallet) {
      const { walletTemplates } = await import('@/lib/whatsappTemplates');
      // Check if this message is already a wallet command to avoid circular prompting
      const isWalletCommand = message.trim().toLowerCase().startsWith('/wallet');
      
      if (!isWalletCommand) {
        console.log(`[processWithCDP] Blockchain query detected but user ${userId} has no wallet. Prompting to create one.`);
        return "You need a wallet to perform blockchain operations. Send '/wallet create' to create one.";
      } else {
        console.log(`[processWithCDP] Allowing wallet command to proceed: ${message}`);
      }
    }

    // Initialize AgentKit - if we have a wallet, use it; otherwise use default
    let agentKit;
    try {
      // Only pass userId if we have a wallet for that user
      agentKit = await getAgentKit(hasWallet ? userId : undefined);
      // Verify AgentKit is properly initialized
      const actions = await agentKit.getActions();
      console.log(`AgentKit initialized with ${actions.length} available actions${hasWallet ? ` for user ${userId}` : ' (default instance)'}`);
    } catch (agentKitError) {
      console.error('Error initializing AgentKit:', agentKitError);
      return "I'm having trouble with my blockchain tools. Is there anything else I can help you with?";
    }

    // Initialize LangChain agent
    let langchainAgent;
    try {
      const { getLangChainAgent } = await import('@/lib/langchain');
      langchainAgent = await getLangChainAgent(agentKit);
    } catch (langchainError) {
      console.error('Error initializing LangChain agent:', langchainError);
      return "I'm experiencing technical difficulties with my AI capabilities. Can I help you with something simpler?";
    }

    console.log('Processing message with CDP:', message);

    // Prepare a more blockchain-focused prompt if the message seems to be about blockchain
    let enhancedMessage = message;
    if (isBlockchainQuery) {
      if (hasWallet) {
        enhancedMessage = `[BLOCKCHAIN QUERY WITH WALLET] ${message} [User has a wallet. Use blockchain tools to answer this]`;
      } else {
        enhancedMessage = `[BLOCKCHAIN QUERY WITHOUT WALLET] ${message} [User does NOT have a wallet yet. Provide educational information only]`;
      }
    } else {
      // Even for non-blockchain queries, indicate wallet status to avoid confusion
      if (hasWallet) {
        enhancedMessage = `[User has a wallet] ${message}`;
      }
    }

    // Invoke the agent with proper error handling
    let result;
    try {
      // Import the necessary message type
      const { HumanMessage } = await import('@langchain/core/messages');
      
      // Pass the message in the format expected by the agent
      result = await langchainAgent.invoke({
        messages: [new HumanMessage({ content: enhancedMessage })]
      });
      console.log('CDP agent response:', JSON.stringify(result, null, 2));
    } catch (invokeError) {
      console.error('Error invoking LangChain agent:', invokeError);
      return "I encountered an error while processing your request. Could you try again with a simpler query?";
    }

    // Handle different response formats
    if (typeof result === 'string') {
      return result;
    } 
    
    if (result?.messages?.length > 0) {
      const lastMsg = result.messages[result.messages.length - 1];
      if (typeof lastMsg.content === 'string') {
        return lastMsg.content;
      }
      if (Array.isArray(lastMsg.content)) {
        return lastMsg.content
          .map((c: unknown) => {
            if (typeof c === 'string') return c;
            if (c && typeof c === 'object' && 'text' in c) return (c as { text: string }).text;
            return '';
          })
          .join(' ')
          .trim();
      }
    }
    
    // If we couldn't extract a proper response, provide a fallback
    return "I've processed your request, but I'm having trouble formulating a response. Could you please try rephrasing your question?";
  } catch (error) {
    console.error('Error in processWithCDP:', error);
    // Return a user-friendly error message instead of null
    return "I encountered an error while processing your request. Let me try to help you in another way.";
  }
}

/**
 * Checks if a user is rate limited
 */
function checkRateLimit(phoneNumber: string): { isRateLimited: boolean; retryAfter?: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(phoneNumber);

  if (!userLimit) {
    rateLimitMap.set(phoneNumber, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { isRateLimited: false };
  }

  // Reset the counter if the window has passed
  if (now > userLimit.resetTime) {
    rateLimitMap.set(phoneNumber, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { isRateLimited: false };
  }

  // Check if user has exceeded the limit
  if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
    return { 
      isRateLimited: true, 
      retryAfter: Math.ceil((userLimit.resetTime - now) / 1000) 
    };
  }

  // Increment the counter
  rateLimitMap.set(phoneNumber, { 
    ...userLimit, 
    count: userLimit.count + 1 
  });

  return { isRateLimited: false };
}

/**
 * Extracts and processes message from webhook payload
 */
function extractAndProcessMessage(entry: WhatsAppWebhookEntry): ProcessedMessage | null {
  if (!entry) {
    console.log('No entry found in webhook payload');
    return null;
  }

  const change = entry.changes?.[0];
  if (!change || change.field !== 'messages') {
    console.log('No message change found in webhook entry');
    return null;
  }

  // Get the first message
  const message = entry.changes[0]?.value.messages?.[0];
  if (!message) {
    console.log('No message found in webhook payload');
    return null;
  }
  
  // We don't need to extract contact or metadata for now
  // as they're not used in the current implementation

  // Ensure we always have a valid text value
  let text = '';
  // Ensure type is one of the allowed values
  const messageType: MessageType = (['text', 'image', 'button', 'interactive', 'list'] as const).includes(
    message.type as MessageType
  ) ? message.type as MessageType : 'text'; // Default to 'text' if type is unexpected
  let mediaId: string | undefined;
  let buttonId: string | undefined;
  let buttonText: string | undefined;

  // Handle different message types
  if (message.type === 'text' && message.text) {
    text = message.text.body;
  } else if (message.type === 'image' && message.image) {
    // Ensure caption is always treated as a string
    text = (typeof message.image.caption === 'string') ? message.image.caption : '';
    mediaId = message.image.id;
  } else if (message.type === 'button' && message.button) {
    text = message.button.payload || '';
    buttonId = message.button.payload;
    buttonText = message.button.text;
  } else if (message.type === 'interactive' && message.interactive) {
    const interactive = message.interactive;
    if (interactive.type === 'button_reply' && interactive.button_reply) {
      text = interactive.button_reply.id || '';
      buttonId = interactive.button_reply.id;
      buttonText = interactive.button_reply.title;
    } else if (interactive.type === 'list_reply' && interactive.list_reply) {
      text = interactive.list_reply.id || '';
      buttonId = interactive.list_reply.id;
      buttonText = interactive.list_reply.title;
    }
  }

  // Return the processed message with guaranteed string text
  return {
    from: message.from,
    messageId: message.id,
    timestamp: message.timestamp,
    text,
    type: messageType,
    ...(mediaId && { mediaId }),
    ...(buttonId && { buttonId }),
    ...(buttonText && { buttonText })
  };

}

// Default export handler function for Pages Router API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS method for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests
  if (req.method === 'GET') {
    return handleGetRequest(req, res);
  }

  // Handle POST requests
  if (req.method === 'POST') {
    return handlePostRequest(req, res);
  }

  // Handle other methods
  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

// Handle GET requests
async function handleGetRequest(req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({
    status: 'ok',
    message: 'CDP Message Processing API is running',
    timestamp: new Date().toISOString(),
  });
}

// Handle POST requests
async function handlePostRequest(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { from, messageText, buttonId, buttonTitle, type, timestamp } = req.body;

    // Basic validation
    if (!from || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from and messageText',
      });
    }

    // Validate phone number format
    if (!validatePhoneNumber(from)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
      });
    }

    // Check rate limiting
    const rateLimit = checkRateLimit(from);
    if (rateLimit.isRateLimited) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: rateLimit.retryAfter,
      });
    }

    // Log detailed information about the incoming request
    console.log(`Processing message from ${from}:`, {
      messageText,
      buttonId,
      buttonTitle,
      type,
      isInteractive: type === 'interactive',
      requestBody: JSON.stringify(req.body)
    });

    // --- Wallet gating logic: prompt for wallet creation if none exists ---
    const { userHasWallet, walletPromptAlreadyShown, markWalletPromptShown } = await import('./_walletUtils');
    const hasWallet = await userHasWallet(from);
    
    console.log(`[process-cdp-message] Wallet check for ${from}: ${hasWallet ? 'Has wallet' : 'No wallet'}`);
    
    // Check if it's a command (starts with /) or a wallet-related command
    const isCommand = messageText.trim().startsWith('/');
    const isWalletCommand = messageText.trim().startsWith('/wallet');
    
    // Enhanced button detection - check multiple possible locations
    const isWalletCreateButton = 
      buttonId === 'create_wallet' || 
      (type === 'interactive' && buttonId === 'create_wallet') ||
      (messageText === 'create_wallet') ||
      (req.body.interactive && req.body.interactive.button_reply && req.body.interactive.button_reply.id === 'create_wallet');
    
    console.log(`Message classification:`, {
      isCommand,
      isWalletCommand,
      isWalletCreateButton,
      buttonId,
      messageText,
      type
    });
    
    // Only show wallet prompt if:
    // 1. User doesn't have a wallet
    // 2. Prompt hasn't been shown before
    // 3. This is not a wallet creation command or button click
    const promptShown = await walletPromptAlreadyShown(from);
    
    if (!hasWallet && !promptShown && !isWalletCommand && !isWalletCreateButton) {
      // Show wallet creation prompt (one time)
      console.log(`[process-cdp-message] Showing wallet prompt to user ${from}`);
      await markWalletPromptShown(from);
      const { walletTemplates } = await import('@/lib/whatsappTemplates');
      const walletPrompt = walletTemplates.noWallet();
      return handleResponse(from, walletPrompt, res);
    }
    
    // Handle both explicit commands and button clicks for wallet creation
    if (isCommand || isWalletCreateButton) {
      console.log(`Handling command or button: ${messageText} (isWalletCreateButton: ${isWalletCreateButton})`);
      
      // Convert button click to wallet create command if needed
      const effectiveMessage = isWalletCreateButton ? '/wallet create' : messageText;
      
      // Handle command with custom context
      const commandContext: CustomCommandContext = {
        supabase,
        phoneNumber: from,
        message: effectiveMessage
      };
      
      try {
        // Create a properly formatted CommandContext with the expected message structure
        const formattedContext = {
          ...commandContext,
          userId: from, // Add userId explicitly
          message: {
            text: effectiveMessage,
            type: 'text',
            from: from,
            timestamp: timestamp || new Date().toISOString(),
            id: `manual-${Date.now()}`,
            preview_url: false
          }
        };
        
        // Log the formatted context for debugging
        console.log('Formatted command context:', JSON.stringify(formattedContext, null, 2));
        
        // Handle the command with explicit typing and pass the formatted context
        console.log('Calling handleCommand with formatted context');
        const commandResult = await handleCommand(effectiveMessage, from);
        console.log('Command result:', typeof commandResult, commandResult);
        
        // Ensure we have a properly formatted CommandResult
        let formattedResult: CommandResult;
        
        // If the result is a string, wrap it in a CommandResult
        if (typeof commandResult === 'string') {
          formattedResult = {
            success: true,
            message: commandResult,
            type: 'text',
            text: commandResult
          };
        } 
        // Handle different response types
        else if (commandResult && typeof commandResult === 'object') {
          // Check if it's a response object with a type property
          if ('type' in commandResult && typeof commandResult.type === 'string') {
            const responseType = commandResult.type;
            
            if (responseType === 'text' && 'text' in commandResult) {
              const textResponse: TextResponse = {
                type: 'text',
                text: commandResult.text || 'No message content'
              };
              formattedResult = {
                success: true,
                message: textResponse,
                type: 'text',
                text: commandResult.text || 'No message content'
              };
            } else if (responseType === 'buttons' && 'buttons' in commandResult) {
              const buttonsResponse: ButtonsResponse = {
                type: 'buttons',
                text: 'text' in commandResult ? (commandResult.text || '') : '',
                buttons: Array.isArray(commandResult.buttons) ? commandResult.buttons.map(button => ({
                  id: button.id || 'button_' + Math.random().toString(36).substring(2, 9),
                  title: button.title || 'Button',
                  ...(button.url ? { url: button.url } : {})
                })) : [{ id: 'default_button', title: 'OK' }]
              };
              formattedResult = {
                success: true,
                message: buttonsResponse,
                type: 'buttons',
                buttons: buttonsResponse.buttons,
                text: buttonsResponse.text
              };
            } else if (responseType === 'image' && 'url' in commandResult) {
              const imageResponse: ImageResponse = {
                type: 'image',
                url: String(commandResult.url),
                caption: 'caption' in commandResult ? String(commandResult.caption || '') : undefined
              };
              formattedResult = {
                success: true,
                message: imageResponse,
                type: 'image',
                imageUrl: String(commandResult.url),
                caption: 'caption' in commandResult ? String(commandResult.caption || '') : undefined
              };
            } else if (responseType === 'list' && 'sections' in commandResult) {
              // Ensure sections have the correct structure
              interface ListRow {
                id?: string;
                title?: string;
                description?: string;
              }
              
              interface ListSection {
                title?: string;
                rows?: ListRow[];
              }
              
              const validSections = Array.isArray(commandResult.sections) 
                ? commandResult.sections.map((section: ListSection) => ({
                    title: typeof section.title === 'string' ? section.title : 'Section',
                    rows: Array.isArray(section.rows) 
                      ? section.rows.map((row: ListRow) => ({
                          id: typeof row.id === 'string' ? row.id : 'row_' + Math.random().toString(36).substring(2, 9),
                          title: typeof row.title === 'string' ? row.title : 'Item',
                          ...(row.description ? { description: String(row.description) } : {})
                        })) 
                      : [{ id: 'default_row', title: 'Default Item' }]
                  })) 
                : [
                    {
                      title: 'Default Section',
                      rows: [{ id: 'default_row', title: 'Default Item' }]
                    }
                  ];
              
              const listResponse: ListResponse = {
                type: 'list',
                header: 'header' in commandResult ? String(commandResult.header || '') : '',
                body: 'body' in commandResult ? String(commandResult.body || '') : '',
                buttonText: 'buttonText' in commandResult ? String(commandResult.buttonText || 'Select') : 'Select',
                sections: validSections
              };
              
              formattedResult = {
                success: true,
                message: listResponse,
                type: 'list',
                header: listResponse.header,
                body: listResponse.body,
                buttonText: listResponse.buttonText,
                sections: validSections
              };
            } else {
              // Default case for other response types
              const defaultResponse: TextResponse = {
                type: 'text',
                text: 'Unknown response type'
              };
              formattedResult = {
                success: true,
                message: defaultResponse,
                type: 'text',
                text: 'Unknown response type'
              };
            }
          } else {
            // It's a CommandResult already
            formattedResult = commandResult as CommandResult;
          }
        } else {
          // Otherwise assume it's already a CommandResult
          formattedResult = commandResult as CommandResult;
        }
        
        // Check for wallet creation success
        if (formattedResult && formattedResult.success) {
          // Convert commandResult to appropriate WhatsAppResponse type
          const whatsAppResponse = convertCommandResultToWhatsAppResponse(formattedResult);
          
          // For wallet creation success, send an additional introduction message
          if (isWalletCreateButton || (isCommand && effectiveMessage.toLowerCase() === '/wallet create')) {
            try {
              // Check if the result indicates successful wallet creation
              const isWalletCreated = formattedResult.message && 
                (typeof formattedResult.message === 'string' 
                  ? formattedResult.message.includes('Wallet Created') 
                  : formattedResult.message.type === 'buttons' && 
                    'text' in formattedResult.message &&
                    typeof formattedResult.message.text === 'string' && 
                    formattedResult.message.text.includes('Wallet Created'));
              
              if (isWalletCreated) {
                // Send the wallet creation response first
                await handleResponse(from, whatsAppResponse, res);
                
                // Then send the introduction message after a short delay
                setTimeout(async () => {
                  const introMessage = `🎉 *Welcome to Hedwig!* 🎉\n\nNow that your wallet is ready, I can help you with:\n\n• Checking your wallet balance\n• Sending and receiving crypto\n• Getting testnet funds\n• Exploring blockchain data\n• Learning about Web3\n\nWhat would you like to do first?`;
                  
                  try {
                    await sendWhatsAppMessage(from, introMessage);
                    console.log('Sent introduction message after wallet creation');
                  } catch (introError) {
                    console.error('Failed to send introduction message:', introError);
                  }
                }, 1500); // 1.5 second delay
                
                // Return success immediately after sending the wallet creation response
                return res.status(200).json({
                  success: true,
                  message: 'Wallet created and introduction message scheduled',
                });
              }
            } catch (introError) {
              console.error('Error handling introduction message:', introError);
              // Continue with normal response handling if there was an error
            }
          }
          
          // Normal response handling for non-wallet creation commands
          return handleResponse(from, whatsAppResponse, res);
        } else if (formattedResult) {
          console.log(`Command failed: ${typeof formattedResult.message === 'string' ? formattedResult.message : 'Command processing failed'}`);
          return res.status(200).json({
            success: false,
            message: `Command processing failed: ${typeof formattedResult.message === 'string' ? formattedResult.message : 'Unknown error'}`,
          });
        } else {
          return res.status(200).json({
            success: false,
            message: 'No response from command handler',
          });
        }
      } catch (commandError) {
        console.error('Command handling error:', commandError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process command',
        });
      }
    }
    
    // Process with CDP for non-command messages
    try {
      const response = await processWithCDP(messageText, from);
      
      if (response) {
        const result = await sendWhatsAppMessage(from, response);
        return res.status(200).json({
          success: true,
          message: 'Message processed successfully',
          result
        });
      } else {
        console.error('No response from CDP processor');
        return res.status(500).json({
          success: false,
          message: 'No response from AI processor',
        });
      }
    } catch (cdpError) {
      console.error('Error processing message with CDP:', cdpError);
      
      // Send a fallback message
      try {
        await sendWhatsAppMessage(from, "I'm having trouble processing your message. Please try again later or type /help for available commands.");
      } catch (whatsappError) {
        console.error('Failed to send fallback message:', whatsappError);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to process message with CDP',
        error: cdpError instanceof Error ? cdpError.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Helper function to convert CommandResult to WhatsAppResponse
function convertCommandResultToWhatsAppResponse(result: CommandResult): WhatsAppResponse {
  // If message is already a WhatsAppResponse object, return it directly
  if (typeof result.message !== 'string' && 'type' in result.message) {
    return result.message;
  }
  
  // Otherwise, create the appropriate response type based on the type field
  if (!result.type || result.type === 'text') {
    // Default to text response if type is not specified or is text
    return {
          type: 'text',
      text: result.text || (typeof result.message === 'string' ? result.message : 'No message available')
    } as TextResponse;
  }

  switch (result.type) {
    case 'image':
      if (!result.imageUrl) {
        return {
          type: 'text',
          text: 'Image URL is required for image messages'
        } as TextResponse;
      }
      return {
        type: 'image',
        url: result.imageUrl,
        caption: result.caption
      } as ImageResponse;
      
    case 'list':
      // Validate sections
      if (!result.sections || !Array.isArray(result.sections) || result.sections.length === 0) {
        return {
          type: 'text',
          text: 'Sections are required for list messages'
        } as TextResponse;
      }
      
      // Ensure each section has a valid structure
      const validSections = result.sections.map((section: { title?: string; rows?: any[] }) => {
        // Validate section
        if (!section || typeof section !== 'object') {
          return {
            title: 'Default Section',
            rows: [{ id: 'default_row', title: 'Default Item' }]
          };
        }
        
        // Validate rows
        const rows = Array.isArray(section.rows) 
          ? section.rows.map((row: { id?: string; title?: string; description?: string }) => {
              if (!row || typeof row !== 'object') {
                return { id: 'default_row', title: 'Default Item' };
              }
              return {
                id: typeof row.id === 'string' ? row.id : 'row_' + Math.random().toString(36).substring(2, 9),
                title: typeof row.title === 'string' ? row.title : 'Item',
                ...(row.description ? { description: String(row.description) } : {})
              };
            })
          : [{ id: 'default_row', title: 'Default Item' }];
        
        return {
          title: typeof section.title === 'string' ? section.title : 'Section',
          rows
        };
      });
      
      return {
        type: 'list',
        header: result.header || '',
        body: result.body || result.bodyText || '',
        buttonText: result.buttonText || 'Select',
        sections: validSections
      } as ListResponse;
      
    case 'buttons':
      // Validate buttons
      if (!result.buttons || !Array.isArray(result.buttons) || result.buttons.length === 0) {
        return {
          type: 'text',
          text: 'Buttons are required for button messages'
        } as TextResponse;
      }
      
      // Ensure each button has a valid structure
      const validButtons = result.buttons.map((button: { id?: string; title?: string; url?: string }) => {
        if (!button || typeof button !== 'object') {
          return { id: 'default_button', title: 'OK' };
        }
        return {
          id: typeof button.id === 'string' ? button.id : 'button_' + Math.random().toString(36).substring(2, 9),
          title: typeof button.title === 'string' ? button.title : 'Button',
          ...(button.url ? { url: String(button.url) } : {})
        };
      });
      
      // Special handling for transaction success (if txHash and Basescan link are present)
      if (validButtons.some(b => b.id && b.id.startsWith('view_basescan_'))) {
        return {
          type: 'buttons',
          text: result.text || result.body || result.bodyText || '',
          buttons: validButtons
        } as ButtonsResponse;
      }
      
      return {
        type: 'buttons',
        text: result.text || result.body || result.bodyText || '',
        buttons: validButtons
      } as ButtonsResponse;
      
    default:
      // Default to text for unknown types
      return {
        type: 'text',
        text: typeof result.message === 'string' ? result.message : 'No message available'
      } as TextResponse;
  }
}

// Helper function to handle WhatsApp response sending
async function handleResponse(phoneNumber: string, response: WhatsAppResponse, res: NextApiResponse) {
  try {
    let result;
    
    // Handle each response type correctly
        if (typeof response === 'string') {
          // Handle simple string responses
      result = await sendWhatsAppMessage(phoneNumber, response);
    } else {
      switch (response.type) {
        case 'text':
          const textResponse = response as TextResponse;
          result = await sendWhatsAppMessage(phoneNumber, textResponse.text);
          break;
        case 'image':
          const imageResponse = response as ImageResponse;
          result = await sendWhatsAppImage(phoneNumber, imageResponse.url, imageResponse.caption);
          break;
        case 'list':
          const listResponse = response as ListResponse;
          result = await sendWhatsAppListMessage(
            phoneNumber,
            listResponse.header || '',
            listResponse.body || '',
            listResponse.buttonText || 'Select',
            listResponse.sections || []
          );
          break;
        case 'buttons':
          const buttonsResponse = response as ButtonsResponse;
          result = await sendWhatsAppReplyButtons(
            phoneNumber,
            buttonsResponse.text || '',
            buttonsResponse.buttons || []
          );
          break;
        default:
          throw new Error(`Unsupported response type: ${(response as any).type}`);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Response sent successfully',
      result
    });
  } catch (error) {
    console.error('Error sending WhatsApp response:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send WhatsApp response',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime

async function handleCommand(message: string, userId: string): Promise<CommandResult> {
  try {
    console.log(`Handling command: ${message} for user ${userId}`);
    
    // Extract command and subcommand
    const parts = message.trim().split(/\s+/);
    const command = parts[0].toLowerCase().replace('/', '');
    
    // Handle different command types
    switch (command) {
      case 'wallet':
        return await handleWalletCommand(userId, parts.slice(1));
        
      case 'help':
        const { helpTemplates } = await import('@/lib/whatsappTemplates');
        return {
          success: true,
          message: helpTemplates.mainMenu(),
          type: 'text'
        };
        
      default:
        return {
          success: false,
          message: `Unknown command: ${command}\nType /help to see available commands.`,
          type: 'text'
        };
    }
  } catch (error) {
    console.error('Error handling command:', error);
    return {
      success: false,
      message: 'Sorry, there was an error processing your command.',
      type: 'text'
    };
  }
}

async function handleWalletCommand(userId: string, args: string[]): Promise<CommandResult> {
  try {
    console.log(`Handling wallet command for user ${userId} with args:`, args);
    
    // Import required modules
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    const { userHasWalletInDb } = await import('@/lib/walletDb');
    
    // Get the subcommand (default to 'help' if none provided)
    const subcommand = args.length > 0 ? args[0].toLowerCase() : 'help';
    
    // Check if user has a wallet
    const hasWallet = await userHasWalletInDb(userId);
    
    console.log(`Wallet status for user ${userId}: ${hasWallet ? 'Has wallet' : 'No wallet'}`);
    
    // Handle different wallet subcommands
    switch (subcommand) {
      case 'balance':
        if (!hasWallet) {
          return {
            success: false,
            message: walletTemplates.noWallet(),
            type: 'buttons'
          };
        }
        return await handleWalletBalance(userId);
        
      case 'create':
        return await createWallet(userId);
        
      case 'address':
        if (!hasWallet) {
          return {
            success: false,
            message: walletTemplates.noWallet(),
            type: 'buttons'
          };
        }
        return await handleWalletAddress(userId);
        
      case 'deposit':
        if (!hasWallet) {
          return {
            success: false,
            message: walletTemplates.noWallet(),
            type: 'buttons'
          };
        }
        return await handleWalletDeposit(userId);
        
      case 'withdraw':
        if (!hasWallet) {
          return {
            success: false,
            message: walletTemplates.noWallet(),
            type: 'buttons'
          };
        }
        return await handleWalletWithdraw(userId);
        
      default:
        // Return help message
        return {
          success: true,
          message: `📚 *Wallet Commands*\n\n` +
            `*/wallet balance* - Check your balance\n` +
            `*/wallet address* - Show your wallet address\n` +
            `*/wallet create* - Create a new wallet\n` +
            `*/wallet deposit* - Get deposit instructions\n` +
            `*/wallet withdraw* - Withdraw funds\n`,
          type: 'text'
        };
    }
  } catch (error) {
    console.error('Error handling wallet command:', error);
    return {
      success: false,
      message: 'Sorry, there was an error processing your wallet command.',
      type: 'text'
    };
  }
}

async function handleWalletBalance(userId: string): Promise<CommandResult> {
  try {
    console.log(`Handling wallet balance request for user ${userId}`);
    
    // Import required modules
    const { getOrCreateWallet } = await import('@/lib/wallet');
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    const { ethers } = await import('ethers');
    
    // Get wallet provider
    const walletResult = await getOrCreateWallet(userId);
    const provider = walletResult.provider;
    
    if (!provider) {
      console.error(`Could not retrieve wallet for user ${userId}`);
      return {
        success: false,
        message: 'Could not access your wallet. Please try creating a new one with /wallet create.',
        type: 'buttons'
      };
    }
    
    // Get wallet address
    const address = await provider.getAddress();
    console.log(`Retrieved wallet address for user ${userId}: ${address}`);
    
    // Get provider for Base Sepolia
    const rpcProvider = new ethers.JsonRpcProvider('https://sepolia.base.org');
    
    // Get balance
    const balanceWei = await rpcProvider.getBalance(address);
    const balanceEth = ethers.formatEther(balanceWei);
    console.log(`Retrieved balance for user ${userId}: ${balanceEth} ETH`);
    
    // Format balance to 6 decimal places
    const formattedBalance = parseFloat(balanceEth).toFixed(6);
    
    return {
      success: true,
      message: walletTemplates.balance(formattedBalance, 'ETH'),
      type: 'text'
    };
  } catch (error) {
    console.error('Error handling wallet balance:', error);
    return {
      success: false,
      message: 'Sorry, there was an error retrieving your wallet balance.',
      type: 'text'
    };
  }
}

async function handleWalletAddress(userId: string): Promise<CommandResult> {
  try {
    console.log(`Handling wallet address request for user ${userId}`);
    
    // Import required modules
    const { getOrCreateWallet, getWalletFromDb } = await import('@/lib/wallet');
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    
    // Get wallet address
    let address = '';
    
    // Try getting address from database first
    const walletFromDb = await getWalletFromDb(userId);
    if (walletFromDb) {
      console.log(`Retrieved wallet from database for user ${userId}`);
      address = walletFromDb.address;
    }
    
    // If no address found in database, get it from the provider
    if (!address) {
      try {
        const walletResult = await getOrCreateWallet(userId);
        const provider = walletResult.provider;
        address = await provider.getAddress();
      } catch (error) {
        console.error('Error getting wallet provider:', error);
      }
    }
    
    if (!address) {
      return {
        success: false,
        message: 'Could not retrieve your wallet address. Please try creating a new wallet with /wallet create.',
        type: 'buttons'
      };
    }
    
    return {
      success: true,
      message: walletTemplates.address(address),
      type: 'text'
    };
  } catch (error) {
    console.error('Error handling wallet address:', error);
    return {
      success: false,
      message: 'Sorry, there was an error retrieving your wallet address.',
      type: 'text'
    };
  }
}

async function createWallet(userId: string): Promise<CommandResult> {
  try {
    console.log(`Creating wallet for user ${userId}`);
    
    // Import necessary modules
    const { userHasWalletInDb, getWalletFromDb, getOrCreateWallet } = await import('@/lib/wallet');
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    
    // Check if the user already has a wallet
    const hasWallet = await userHasWalletInDb(userId);
    
    if (hasWallet) {
      const existingWallet = await getWalletFromDb(userId);
      return {
        success: true,
        message: walletTemplates.walletExists(existingWallet?.address || 'Unknown address'),
        type: 'text'
      };
    }
    
    console.log(`No existing wallet found for user ${userId}, creating new one`);
    
    try {
      // Create new wallet
      const walletResult = await getOrCreateWallet(userId);
      const provider = walletResult.provider;
      const address = await provider.getAddress();
      
      return {
        success: true,
        message: walletTemplates.walletCreated(address),
        type: 'text'
      };
    } catch (walletError) {
      console.error('Error creating wallet:', walletError);
      return {
        success: false,
        message: 'Sorry, there was an error creating your wallet. Please try again later.',
        type: 'text'
      };
    }
  } catch (error) {
    console.error('Error in createWallet:', error);
    return {
      success: false,
      message: 'Sorry, there was an error processing your wallet creation request.',
      type: 'text'
    };
  }
}

async function handleWalletDeposit(userId: string): Promise<CommandResult> {
  try {
    console.log(`Handling wallet deposit request for user ${userId}`);
    
    // Import required modules
    const { getOrCreateWallet, getWalletFromDb } = await import('@/lib/wallet');
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    
    // Get wallet address
    let address = '';
    
    // Try getting address from database first
    const walletFromDb = await getWalletFromDb(userId);
    if (walletFromDb) {
      console.log(`Retrieved wallet from database for user ${userId}`);
      address = walletFromDb.address;
    }
    
    // If still no address, try creating or getting the wallet
    if (!address) {
      try {
        const walletResult = await getOrCreateWallet(userId);
        const provider = walletResult.provider;
        address = await provider.getAddress();
      } catch (error) {
        console.error(`Could not create or get wallet for user ${userId}:`, error);
      }
    }
    
    if (!address) {
      console.error(`Could not retrieve wallet address for user ${userId}`);
      return {
        success: false,
        message: 'Could not access your wallet. Please try creating a new one with /wallet create.',
        type: 'buttons'
      };
    }
    
    console.log(`Retrieved wallet address for user ${userId}: ${address}`);
    
    return {
      success: true,
      message: walletTemplates.deposit(address),
      type: 'text'
    };
  } catch (error) {
    console.error('Error handling wallet deposit:', error);
    return {
      success: false,
      message: 'Sorry, there was an error processing your deposit request.',
      type: 'text'
    };
  }
}

async function handleWalletWithdraw(userId: string): Promise<CommandResult> {
  try {
    console.log(`Handling wallet withdrawal request for user ${userId}`);
    
    // Import required modules
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    
    // For now, just return the withdraw template
    // In the future, this could initiate a multi-step withdrawal process
    return {
      success: true,
      message: walletTemplates.withdraw(),
      type: 'text'
    };
  } catch (error) {
    console.error('Error handling wallet withdrawal:', error);
    return {
      success: false,
      message: 'Sorry, there was an error processing your withdrawal request.',
      type: 'text'
    };
  }
}
