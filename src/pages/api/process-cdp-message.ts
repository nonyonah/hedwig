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
  button?: string;
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
 * Safe JSON stringify function that handles circular references
 * @param obj The object to stringify
 * @returns JSON string without circular references
 */
function safeJsonStringify(obj: any, indent = 2): string {
  const cache = new Set();
  
  return JSON.stringify(obj, (key, value) => {
    // Handle non-serializable types like functions
    if (typeof value === 'function') {
      return '[Function]';
    }
    
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      // Skip DOM nodes
      if (value.nodeType && value.nodeType === 1) {
        return '[DOM Node]';
      }
      
      // Skip Timer objects (common source of circular refs)
      if (
        value._idleTimeout !== undefined && 
        value._idlePrev !== undefined && 
        value._idleNext !== undefined
      ) {
        return '[Timer]';
      }
      
      // Handle circular references in objects
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
    }
    
    return value;
  }, indent);
}

/**
 * Processes a WhatsApp message through the CDP agent
 */
export async function processWithCDP(
  message: string,
  phone: string,
  username?: string
): Promise<string | WhatsAppResponse> {
  console.log(`[CDP] Processing message from user ${phone}${username ? ` (${username})` : ''}: ${message}`);
  
  // Use phone as the primary user identifier for wallet management
  const userId = phone;
  
  try {
    // Import needed modules
    const { getAgentKit } = await import('@/lib/agentkit');
    const { getLangChainAgent } = await import('@/lib/langchain');
    const { walletTemplates } = await import('@/lib/whatsappTemplates');
    const { getWalletFromDb } = await import('@/lib/cdpWallet');
    
    // Initialize AgentKit with the user's wallet if available
    const agentKit = await getAgentKit(userId, username);
    
    // Check if this is a blockchain-related query
    const isBlockchainQuery = message.toLowerCase().includes('wallet') || 
                            message.toLowerCase().includes('balance') || 
                            message.toLowerCase().includes('crypto') || 
                            message.toLowerCase().includes('transfer') || 
                            message.toLowerCase().includes('send') || 
                            message.toLowerCase().includes('receive') ||
                            message.toLowerCase().includes('address');
    
    // If the user wants to create a wallet, handle it directly
    if (message.toLowerCase() === '/wallet create' || 
        message.toLowerCase() === 'create wallet') {
      console.log('[CDP] Handling wallet creation command');
      try {
        const walletAddress = await createWallet(userId, username);
        return walletTemplates.walletCreated(walletAddress);
      } catch (error) {
        console.error('[CDP] Error creating wallet:', error);
        return "I couldn't create a wallet for you right now. Please try again later.";
      }
    }
    
    // Get the user's wallet status
    const hasWallet = await (async () => {
      try {
        const walletData = await getWalletFromDb(userId);
        return !!walletData;
      } catch (error) {
        console.error('[CDP] Error checking wallet status:', error);
        return false;
      }
    })();
    
    // Special handling for specific wallet commands
    if (message.toLowerCase().startsWith('/wallet')) {
      console.log('[CDP] Handling wallet command');
      const args = message.split(' ').slice(1);
      const result = await handleWalletCommand(userId, args, username);
      return result.message;
    }
    
    // If this is a blockchain query but the user doesn't have a wallet, prompt them to create one
    if (isBlockchainQuery && !hasWallet) {
      console.log('[CDP] User does not have a wallet but sent a blockchain query');
      return walletTemplates.noWallet();
    }
    
    if (message.toLowerCase().includes('wallet balance')) {
      const result = await handleWalletBalance(userId, username);
      return result.message;
    }
    
    // Process the message with LangChain agent
    try {
      console.log('[CDP] Processing message with LangChain agent');
      
      // Initialize the LangChain agent with AgentKit
      const agent = await getLangChainAgent(agentKit);
      
      // Add context information to the message based on wallet status
      let contextualizedMessage = message;
      if (hasWallet) {
        contextualizedMessage = `[User has a wallet] ${message}`;
      } else if (isBlockchainQuery) {
        contextualizedMessage = `[BLOCKCHAIN QUERY WITHOUT WALLET] ${message}`;
      }
      
      console.log(`[CDP] Sending contextualized message to LangChain: ${contextualizedMessage}`);
      
      // Call the agent with the message
      const result = await agent.invoke({
        messages: [
          { 
            role: 'user',
            content: contextualizedMessage
          }
        ]
      });
      
      // Extract text response in a safe way
      let responseText = "";
      
      if (result && result.messages && result.messages.length > 0) {
        const lastMessage = result.messages[result.messages.length - 1];
        
        if (typeof lastMessage.content === 'string') {
          responseText = lastMessage.content;
          console.log(`[CDP] LangChain returned string response: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
        } else {
          // For non-string content, try to extract text in a safe way
          try {
            console.log('[CDP] LangChain returned non-string response:', JSON.stringify(lastMessage.content).substring(0, 200));
            
            if (Array.isArray(lastMessage.content)) {
              // Handle array of content blocks
              responseText = lastMessage.content
                .map(item => {
                  if (typeof item === 'string') return item;
                  if (item && typeof item === 'object' && 'text' in item) {
                    return String(item.text);
                  }
                  return '';
                })
                .filter(text => text)
                .join('\n');
                
              console.log(`[CDP] Extracted text from array: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
            } else if (lastMessage.content && typeof lastMessage.content === 'object') {
              // Handle object content
              responseText = JSON.stringify(lastMessage.content);
              console.log(`[CDP] Converted object to string: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
            }
          } catch (err) {
            console.error('[CDP] Error extracting text from complex content:', err);
          }
        }
      } else {
        console.warn('[CDP] LangChain returned empty or invalid result structure:', result);
      }
      
      // If we got a response, return it, otherwise use fallback
      if (responseText) {
        return responseText;
      } else {
        // If we couldn't get a valid response, use a simple fallback based on the message
        console.warn('[CDP] Using fallback response for message:', message);
        
        if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi ') || message.toLowerCase() === 'hi') {
          return "Hello! I'm Hedwig, your crypto assistant. How can I help you today?";
        } else if (message.toLowerCase().includes('how are you')) {
          return "I'm doing well, thank you for asking! How can I assist you with crypto today?";
        } else if (message.toLowerCase().includes('your name')) {
          return "I'm Hedwig, your friendly crypto and blockchain assistant. How can I help you today?";
        } else {
          return "I'm here to help with crypto and blockchain questions. Would you like to learn about creating a wallet, checking balances, or sending crypto?";
        }
      }
    } catch (error) {
      console.error('[CDP] Error processing message with LangChain agent:', error);
      
      // Fallback to a more friendly response
      return "I'm sorry, I'm having trouble understanding your request right now. Could you try rephrasing or asking something else?";
    }
  } catch (error) {
    console.error('[CDP] Error in processWithCDP:', error);
    return "I'm sorry, I encountered an error. Please try again later.";
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

  // Process different message types
  switch (messageType) {
    case 'text':
      text = message.text?.body || '';
      break;
    case 'image':
      mediaId = message.image?.id;
      text = message.image?.caption || '';
      break;
    case 'button':
      text = message.button?.text || '';
      buttonId = message.button?.payload;
      break;
    case 'interactive':
      if (message.interactive?.type === 'button_reply') {
        buttonId = message.interactive.button_reply?.id;
        buttonText = message.interactive.button_reply?.title;
        text = buttonText || '';
      } else if (message.interactive?.type === 'list_reply') {
        buttonId = message.interactive.list_reply?.id;
        buttonText = message.interactive.list_reply?.title;
        text = buttonText || '';
      }
      break;
    default:
      text = '';
  }

  // Special handling for wallet creation button
  if (buttonId === 'create_wallet' || text.toLowerCase() === 'create wallet') {
    console.log('Wallet creation button detected');
    text = '/wallet create';
  }

  return {
    from: message.from,
    text,
    messageId: message.id,
    timestamp: message.timestamp,
    type: messageType,
    mediaId,
    buttonId,
    buttonText
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
    const { from, messageText, phone, buttonId, buttonTitle, type, timestamp, username } = req.body;

    // Use phone parameter if available, otherwise fall back to from
    const userPhone = phone || from;

    // Basic validation
    if (!userPhone || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone/from and messageText',
      });
    }

    // Validate phone number format
    if (!validatePhoneNumber(userPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
      });
    }

    // Check rate limiting
    const rateLimit = checkRateLimit(userPhone);
    if (rateLimit.isRateLimited) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: rateLimit.retryAfter,
      });
    }

    // Log detailed information about the incoming request
    console.log(`Processing message from ${userPhone}:`, {
      messageText,
      buttonId,
      buttonTitle,
      type,
      isInteractive: type === 'interactive',
      requestBody: safeJsonStringify(req.body)
    });

    // --- Wallet gating logic: prompt for wallet creation if none exists ---
    const { userHasWallet, walletPromptAlreadyShown, markWalletPromptShown } = await import('./_walletUtils');
    const hasWallet = await userHasWallet(userPhone);
    
    console.log(`[process-cdp-message] Wallet check for ${userPhone}: ${hasWallet ? 'Has wallet' : 'No wallet'}`);
    
    // Check if it's a command (starts with /) or a wallet-related command
    const isCommand = messageText.trim().startsWith('/');
    const isWalletCommand = messageText.trim().startsWith('/wallet');
    
    // Detect wallet create button clicks
    const isWalletCreateButton = 
      buttonId === 'create_wallet' || 
      (type === 'interactive' && buttonId === 'create_wallet') ||
      (messageText === 'create_wallet') ||
      (messageText.toLowerCase().includes('create wallet')) ||
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
    const promptShown = await walletPromptAlreadyShown(userPhone);
    
    if (!hasWallet && !promptShown && !isWalletCommand && !isWalletCreateButton) {
      // Show wallet creation prompt (one time)
      console.log(`[process-cdp-message] Showing wallet prompt to user ${userPhone}`);
      await markWalletPromptShown(userPhone);
      const { walletTemplates } = await import('@/lib/whatsappTemplates');
      const walletPrompt = walletTemplates.noWallet();
      return handleResponse(userPhone, walletPrompt, res);
    }
    
    // Handle both explicit commands and button clicks for wallet creation
    if (isCommand || isWalletCreateButton) {
      console.log(`Handling command or button: ${messageText} (isWalletCreateButton: ${isWalletCreateButton})`);
      
      // Convert button click to wallet create command if needed
      const effectiveMessage = isWalletCreateButton ? '/wallet create' : messageText;
      
      // Handle command with custom context
      const commandContext: CustomCommandContext = {
        supabase,
        phoneNumber: userPhone,
        message: effectiveMessage
      };
      
      try {
        // Create a properly formatted CommandContext with the expected message structure
        const formattedContext = {
          ...commandContext,
          userId: userPhone, // Add userId explicitly
          message: {
            text: effectiveMessage,
            type: 'text',
            from: userPhone,
            timestamp: timestamp || new Date().toISOString(),
            id: `manual-${Date.now()}`,
            preview_url: false
          }
        };
        
        // Log the formatted context for debugging
        console.log('Formatted command context:', safeJsonStringify(formattedContext, 2));
        
        // Handle the command with explicit typing and pass the formatted context
        console.log('Calling handleCommand with formatted context');
        const commandResult = await handleCommand(effectiveMessage, userPhone, username);
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
                text: 'body' in commandResult ? String(commandResult.body || '') : '',
                button: 'buttonText' in commandResult ? String(commandResult.buttonText || 'Select') : 'Select',
                sections: validSections
              };
              
              formattedResult = {
                success: true,
                message: listResponse,
                type: 'list',
                text: listResponse.text || '',
                button: listResponse.button || 'Select',
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
                await handleResponse(userPhone, whatsAppResponse, res);
                
                // Then send the introduction message after a short delay
                setTimeout(async () => {
                  const introMessage = `🎉 *Welcome to Hedwig!* 🎉\n\nNow that your wallet is ready, I can help you with:\n\n• Checking your wallet balance\n• Sending and receiving crypto\n• Getting testnet funds\n• Exploring blockchain data\n• Learning about Web3\n\nWhat would you like to do first?`;
                  
                  try {
                    await sendWhatsAppMessage(userPhone, introMessage);
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
          return handleResponse(userPhone, whatsAppResponse, res);
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
      // Call processWithCDP with the correct parameters
      const response = await processWithCDP(messageText, userPhone, username);
      
      if (response) {
        // Check if the response is a WhatsAppResponse object or a string
        if (typeof response === 'string') {
          const result = await sendWhatsAppMessage(userPhone, response);
        return res.status(200).json({
          success: true,
            message: 'Response sent successfully',
          result
        });
        } else {
          // It's a WhatsAppResponse object, handle it with the appropriate method
          return handleResponse(userPhone, response, res);
        }
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
        await sendWhatsAppMessage(userPhone, "I'm having trouble processing your message. Please try again later or type /help for available commands.");
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
      
      const listResponse: ListResponse = {
        type: 'list',
        text: 'body' in result ? String(result.body || '') : '',
        button: 'buttonText' in result ? String(result.buttonText || 'Select') : 'Select',
        sections: validSections
      };
      
      return {
        type: 'list',
        text: result.body || result.bodyText || '',
        button: result.buttonText || 'Select',
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
            listResponse.text || '',
            listResponse.text || '',
            listResponse.button || 'Select',
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

async function handleCommand(message: string, userId: string, username?: string): Promise<CommandResult> {
  try {
    console.log(`Handling command: ${message} for user ${userId}${username ? ` (${username})` : ''}`);
    
    // Extract command and subcommand
    const parts = message.trim().split(/\s+/);
    const command = parts[0].toLowerCase().replace('/', '');
    
    // Handle different command types
    switch (command) {
      case 'wallet':
        return await handleWalletCommand(userId, parts.slice(1), username);
        
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

async function handleWalletCommand(userId: string, args: string[], username?: string): Promise<CommandResult> {
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
        return await handleWalletBalance(userId, username);
        
      case 'create':
        const createResult = await createWallet(userId, username);
        return {
          success: true,
          message: createResult,
          type: 'text'
        };
        
      case 'address':
        if (!hasWallet) {
          return {
            success: false,
            message: walletTemplates.noWallet(),
            type: 'buttons'
          };
        }
        return await handleWalletAddress(userId, username);
        
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

async function handleWalletBalance(userId: string, username?: string): Promise<CommandResult> {
  try {
    console.log(`[CDP] Getting wallet balance for user ${userId}${username ? ` (${username})` : ''}`);
    
    // Import required modules
    const { getWalletBalances, getWalletFromDb } = await import('@/lib/wallet');
    
    // Get wallet data
    const walletData = await getWalletFromDb(userId);
    
    if (!walletData || !walletData.address) {
      console.log(`[CDP] No wallet found for user ${userId}${username ? ` (${username})` : ''}`);
      return {
        success: false,
        message: "You don't have a wallet yet. Say 'create wallet' to create one."
      };
    }
    
    // Get wallet balances
    const balances = await getWalletBalances(userId);
    
    if (!balances || balances.tokens.length === 0) {
      return {
        success: true,
        message: `Your wallet (${walletData.address.substring(0, 6)}...${walletData.address.substring(38)}) has no tokens yet.\n\nYou can get free test tokens from the Base Sepolia faucet: https://www.coinbase.com/faucets/base-sepolia-faucet`
      };
    }
    
    // Format the balance message
    let message = `Your wallet balances:\n\n`;
    
    // Add native balance
    message += `ETH: ${balances.nativeBalance}\n`;
    
    // Add token balances
    balances.tokens.forEach((token) => {
      message += `${token.symbol}: ${token.formattedBalance}\n`;
    });
    
    message += `\nView your wallet: https://sepolia.basescan.org/address/${walletData.address}`;
    
    return {
      success: true,
      message
    };
  } catch (error) {
    console.error(`[CDP] Error getting wallet balance:`, error);
    return {
      success: false,
      message: "I couldn't get your wallet balance. Please try again later."
    };
  }
}

async function handleWalletAddress(userId: string, username?: string): Promise<CommandResult> {
  try {
    console.log(`[CDP] Getting wallet address for user ${userId}${username ? ` (${username})` : ''}`);
    
    // Import required modules
    const { getWalletFromDb } = await import('@/lib/wallet');
    
    // Get wallet data
    const walletData = await getWalletFromDb(userId);
    
    if (!walletData || !walletData.address) {
      console.log(`[CDP] No wallet found for user ${userId}${username ? ` (${username})` : ''}`);
      return {
        success: false,
        message: "I couldn't retrieve your wallet information. Please try again later."
      };
    }
    
    // Format the address for display
    const address = walletData.address;
    const shortAddress = `${address.substring(0, 6)}...${address.substring(38)}`;
    
    return {
      success: true,
      message: `Your wallet address is: ${address}\n\nYou can view your wallet on the Base Sepolia explorer: https://sepolia.basescan.org/address/${address}`
    };
  } catch (error) {
    console.error(`[CDP] Error getting wallet address:`, error);
    return {
      success: false,
      message: "I couldn't get your wallet address. Please try again later."
    };
  }
}

async function createWallet(userId: string, username?: string): Promise<string> {
  console.log(`[CDP] Creating wallet for user ${userId}${username ? ` (${username})` : ''}`);
  
  try {
    // Call our user-wallet API to create a wallet
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/user-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        phone: userId,
        username,
        network: 'base-sepolia'
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[CDP] Error creating wallet:`, errorData);
      return "I couldn't create a wallet for you right now. Please try again later.";
    }
    
    const walletData = await response.json();
    
    if (!walletData || !walletData.address) {
      console.error(`[CDP] Invalid wallet data received:`, walletData);
      return "There was a problem creating your wallet. Please try again later.";
    }
    
    // If the wallet was just created
    if (walletData.created) {
      console.log(`[CDP] Created new wallet for user ${userId}${username ? ` (${username})` : ''}: ${walletData.address}`);
      return `Great! I've created a new wallet for you. Your wallet address is: ${walletData.address}\n\nYou can view your wallet on the Base Sepolia explorer: https://sepolia.basescan.org/address/${walletData.address}`;
    } else {
      // If the wallet already existed
      console.log(`[CDP] User ${userId}${username ? ` (${username})` : ''} already has wallet: ${walletData.address}`);
      return `You already have a wallet! Your wallet address is: ${walletData.address}\n\nYou can view your wallet on the Base Sepolia explorer: https://sepolia.basescan.org/address/${walletData.address}`;
    }
  } catch (error) {
    console.error(`[CDP] Error creating wallet:`, error);
    return "I couldn't create a wallet for you right now. Please try again later.";
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
