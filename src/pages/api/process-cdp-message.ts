import type { NextApiRequest, NextApiResponse } from 'next';
import { 
  sendWhatsAppMessage, 
  sendWhatsAppImage, 
  sendWhatsAppListMessage, 
  sendWhatsAppReplyButtons,
  validatePhoneNumber 
} from '@/lib/whatsappUtils';
import { handleCommand } from '@/lib/commandHandlers';
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

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

// In-memory rate limiting (consider using Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Additional interfaces to fix type errors
interface CommandResult {
  success: boolean;
  message: string;
  type: 'text' | 'image' | 'list' | 'buttons';
  text?: string;
  imageUrl?: string;
  caption?: string;
  header?: string;
  body?: string;
  buttonText?: string;
  sections?: any[];
  buttons?: any[];
  bodyText?: string;
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
    const { HumanMessage } = await import('@langchain/core/messages');
    const { getAgentKit } = await import('@/lib/agentkit');
    const { getOrCreateWallet } = await import('@/lib/wallet');
    const { getLangChainAgent } = await import('@/lib/langchain');

    console.log(`Starting CDP processing for user ${userId} with message: ${message}`);

    // Try to initialize the wallet and handle errors gracefully
    let wallet;
    try {
      // Always use cached wallet if available, otherwise create and cache
      const { getCachedWalletCredentials } = await import('@/lib/wallet');
      let cached = getCachedWalletCredentials(userId);
      wallet = await getOrCreateWallet(userId, cached?.address);
      // Verify wallet is working by attempting to get the address
      const address = await wallet.getAddress();
      console.log(`Successfully initialized wallet for ${userId} with address: ${address}`);
    } catch (walletError) {
      console.error('Error initializing wallet:', walletError);
      return "I'm having trouble accessing the blockchain right now. Let me help you with something else instead.";
    }

    // Initialize AgentKit
    let agentKit;
    try {
      agentKit = await getAgentKit();
      // Verify AgentKit is properly initialized
      const actions = await agentKit.getActions();
      console.log(`AgentKit initialized with ${actions.length} available actions`);
    } catch (agentKitError) {
      console.error('Error initializing AgentKit:', agentKitError);
      return "I'm having trouble with my blockchain tools. Is there anything else I can help you with?";
    }

    // Initialize LangChain agent
    let langchainAgent;
    try {
      langchainAgent = await getLangChainAgent(agentKit);
    } catch (langchainError) {
      console.error('Error initializing LangChain agent:', langchainError);
      return "I'm experiencing technical difficulties with my AI capabilities. Can I help you with something simpler?";
    }

    console.log('Processing message with CDP:', message);

    // Prepare a more blockchain-focused prompt if the message seems to be about blockchain
    const blockchainKeywords = ['wallet', 'balance', 'crypto', 'token', 'transfer', 'blockchain', 'eth', 'bitcoin', 'transaction'];
    const isBlockchainQuery = blockchainKeywords.some(keyword => message.toLowerCase().includes(keyword));
    
    let enhancedMessage = message;
    if (isBlockchainQuery) {
      enhancedMessage = `[BLOCKCHAIN QUERY] ${message} [Use blockchain tools to answer this]`;
    }

    // Invoke the agent with proper error handling
    let result;
    try {
      result = await langchainAgent.invoke({
        messages: [new HumanMessage({ content: enhancedMessage })],
      });
      console.log('CDP agent response:', JSON.stringify(result, null, 2));
    } catch (invokeError) {
      console.error('Error invoking LangChain agent:', invokeError);
      return "I encountered an error while processing your blockchain request. Could you try again with a simpler query?";
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
    const { from, messageText, timestamp } = req.body;

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

    console.log(`Processing message from ${from}: ${messageText}`);

    // Check if it's a command (starts with /)
    if (messageText.trim().startsWith('/')) {
      // Handle command with custom context
      const commandContext: CustomCommandContext = {
        supabase,
        phoneNumber: from,
        message: messageText
      };
      
      try {
        // Handle the command with explicit typing and pass as any to bypass type checking
        const commandResult = await handleCommand(commandContext as any) as CommandResult;
        
        if (commandResult && commandResult.success) {
          // Convert commandResult to appropriate WhatsAppResponse type
          const whatsAppResponse = convertCommandResultToWhatsAppResponse(commandResult);
          return handleResponse(from, whatsAppResponse, res);
        } else if (commandResult) {
          console.log(`Command failed: ${commandResult.message}`);
          return res.status(200).json({
            success: false,
            message: `Command processing failed: ${commandResult.message}`,
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
  switch (result.type) {
    case 'text':
      return {
        type: 'text',
        text: result.text || result.message
      } as TextResponse;
    case 'image':
      return {
        type: 'image',
        url: result.imageUrl || '',
        caption: result.caption
      } as ImageResponse;
    case 'list':
      return {
        type: 'list',
        header: result.header || '',
        body: result.body || result.bodyText || '',
        buttonText: result.buttonText || 'Select',
        sections: result.sections || []
      } as ListResponse;
    case 'buttons':
      return {
        type: 'buttons',
        text: result.body || result.bodyText || '',
        buttons: result.buttons || []
      } as ButtonsResponse;
    default:
      return {
        type: 'text',
        text: result.message
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
