import { NextRequest, NextResponse } from 'next/server';
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
  ButtonsResponse
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
      wallet = await getOrCreateWallet(userId);
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

/**
 * Handles incoming webhook events from WhatsApp
 */
export async function POST(req: NextRequest) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, PUT, PATCH, POST, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      }
    });
  }

  try {
    const body = await req.json();
    console.log('Received webhook payload:', JSON.stringify(body, null, 2));
    
    // Handle status updates (message delivery/read receipts)
    const statusUpdate = body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
    if (statusUpdate) {
      console.log(`Message ${statusUpdate.id} status: ${statusUpdate.status}`);
      if (statusUpdate.errors) {
        console.error('Message delivery error:', statusUpdate.errors);
      }
      return NextResponse.json(
        { status: 'success', message: 'Status update received' },
        { 
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, PUT, PATCH, POST, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
          }
        }
      );
    }
    
    // Process incoming messages - support both WhatsApp webhook and simplified payload formats
    let messageData: ProcessedMessage | null = null;
    
    // Try standard WhatsApp webhook format first
    const entry = body.entry?.[0] as WhatsAppWebhookEntry | undefined;
    if (entry) {
      messageData = extractAndProcessMessage(entry);
    } 
    // Fallback to simplified payload format
    else if (body.from && (body.messageText || body.text)) {
      console.log('Processing simplified message format:', body);
      messageData = {
        from: body.from,
        text: body.messageText || body.text || '',
        messageId: body.messageId || `web-${Date.now()}`,
        timestamp: body.timestamp || new Date().toISOString(),
        type: 'text'
      };
    }
    
    if (!messageData) {
      console.log('No processable message found in webhook');
      return NextResponse.json(
        { status: 'success', message: 'No processable message' },
        { 
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const { from: phoneNumber, text: messageText, type: messageType } = messageData;
    
    // Validate phone number format
    if (!validatePhoneNumber(phoneNumber)) {
      console.error(`Invalid phone number format: ${phoneNumber}`);
      return NextResponse.json(
        { status: 'error', message: 'Invalid phone number' },
        { 
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    // Apply rate limiting
    const { isRateLimited, retryAfter } = checkRateLimit(phoneNumber);
    if (isRateLimited) {
      console.warn(`Rate limit exceeded for ${phoneNumber}`);
      await sendWhatsAppMessage(
        phoneNumber,
        `⚠️ Too many requests. Please try again in ${retryAfter} seconds.`
      );
      return NextResponse.json(
        { status: 'error', message: 'Rate limit exceeded', retryAfter },
        { 
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': retryAfter?.toString() || '60'
          }
        }
      );
    }

    console.log(`Processing ${messageType} message from ${phoneNumber}: ${messageText}`);

    try {
      // Try to process with CDP first for all message types
      const cdpResponse = await processWithCDP(messageText, phoneNumber);
      
      // Process with CDP if we got a response
      let response: WhatsAppResponse | null = null;
      
      if (cdpResponse) {
        // Log the CDP response for debugging
        console.log('CDP response:', cdpResponse);
        response = {
          type: 'text',
          text: cdpResponse
        };
      }
      
      // If CDP didn't return a response, use the command handler
      if (!response) {
        const commandContext: CommandContext = {
          userId: phoneNumber,
          message: {
            text: messageText,
            preview_url: undefined // Add this if you need to support preview URLs
          },
          messageType: messageType,
          phoneNumber,
        };

        response = await handleCommand(commandContext);
      }

      // Send the appropriate response based on type
      if (response) {
        if (typeof response === 'string') {
          // Handle simple string responses
          await sendWhatsAppMessage(phoneNumber, response);
        } else if ((response as TextResponse).type === 'text') {
          const textResponse = response as TextResponse;
          await sendWhatsAppMessage(phoneNumber, textResponse.text);
        } else if ((response as ImageResponse).type === 'image') {
          const imageResponse = response as ImageResponse;
          await sendWhatsAppImage(phoneNumber, imageResponse.url, imageResponse.caption);
        } else if ((response as ListResponse).type === 'list') {
          const listResponse = response as ListResponse;
          await sendWhatsAppListMessage(
            phoneNumber,
            listResponse.header,
            listResponse.body,
            listResponse.buttonText,
            listResponse.sections
          );
        } else if ((response as ButtonsResponse).type === 'buttons') {
          const buttonsResponse = response as ButtonsResponse;
          await sendWhatsAppReplyButtons(
            phoneNumber,
            buttonsResponse.text,
            buttonsResponse.buttons
          );
        }
      }

      // Log the interaction in the database
      await supabase.from('message_logs').insert({
        user_id: phoneNumber,
        message_type: messageType,
        content: messageText,
        direction: 'incoming',
      });
      
      return NextResponse.json(
        { status: 'success', message: 'Message processed successfully' },
        { 
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
      
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Log the error
      await supabase.from('errors').insert({
        user_id: phoneNumber,
        error_type: 'message_processing',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        stack_trace: error instanceof Error ? error.stack : undefined,
        metadata: { messageData },
      });
      
      // Send user-friendly error message
      await sendWhatsAppMessage(
        phoneNumber, 
        '⚠️ Sorry, I encountered an error while processing your message. Please try again later.'
      );
      
      return NextResponse.json(
        { status: 'error', message: 'Error processing message' },
        { 
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * Handles WhatsApp webhook verification
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('Webhook verification request:', { 
    mode, 
    hasToken: !!token, 
    hasChallenge: !!challenge 
  });

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified successfully');
    return new NextResponse(challenge, { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  console.error('Webhook verification failed', { 
    expectedToken: verifyToken ? '***' : 'undefined',
    receivedToken: token ? '***' : 'undefined',
    mode 
  });
  
  return new NextResponse('Verification failed', { 
    status: 403,
    headers: { 'Content-Type': 'text/plain' }
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime
