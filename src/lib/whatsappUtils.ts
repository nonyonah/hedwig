import { getRequiredEnvVar } from '@/lib/envUtils';
import { loadServerEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { textTemplate, txPending, sendTokenPrompt } from './whatsappTemplates';
import { runLLM } from './llmAgent';
import { parseIntentAndParams } from './intentParser';
import { handleAction } from '../api/actions';
import { createClient } from '@supabase/supabase-js';

// Extend the global object to include our message cache
declare global {
  var processedMessages: Record<string, number>;
}

// Initialize the global message cache if it doesn't exist
if (typeof global.processedMessages === 'undefined') {
  global.processedMessages = {};
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Ensure environment variables are loaded
loadServerEnvironment();

interface WhatsAppTemplateMessage {
  to: string;
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters?: Array<{
        type: string;
        text?: string;
        image?: {
          link?: string;
        };
      }>;
    }>;
  };
}

/**
 * Sends a text message via WhatsApp
 */
interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

/**
 * Sends a text message via WhatsApp (template or string)
 */
export async function sendWhatsAppMessage(to: string, message: string | { text: string }): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    // Check if we have valid credentials before attempting to send
    if (!accessToken || accessToken.includes('dev-') || accessToken === 'EAABBC') {
      console.warn(`[WhatsApp] Missing valid WhatsApp access token. Message to ${to} will not be sent.`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV MODE] Would have sent WhatsApp message to ${to}:`, message);
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: `mock-${Date.now()}` }]
        };
      }
      throw new Error('Missing valid WhatsApp access token');
    }
    if (!phoneNumberId || phoneNumberId.includes('dev-')) {
      console.warn(`[WhatsApp] Missing valid WhatsApp phone number ID. Message to ${to} will not be sent.`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV MODE] Would have sent WhatsApp message to ${to} using phone ID: ${phoneNumberId}`);
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: `mock-${Date.now()}` }]
        };
      }
      throw new Error('Missing valid WhatsApp phone number ID');
    }
    console.log(`Sending WhatsApp message to ${to} using phone number ID: ${phoneNumberId}`);
    const text = typeof message === 'string' ? message : message.text;
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { 
            body: text,
            preview_url: false,
          },
        }),
      }
    );
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp message:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp message: ${errorData}`);
    }
    const result = await response.json();
    console.log('WhatsApp message sent successfully to:', to);
    return result;
  } catch (err) {
    console.error('Exception in sendWhatsAppMessage:', err);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DEV MODE] Providing mock WhatsApp response due to error');
      return {
        messaging_product: 'whatsapp',
        contacts: [{ input: to, wa_id: to }],
        messages: [{ id: `error-mock-${Date.now()}` }]
      };
    }
    throw err;
  }
}

/**
 * Sends an image via WhatsApp
 */
export async function sendWhatsAppImage(to: string, imageUrl: string, caption: string = ''): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'image',
          image: {
            link: imageUrl,
            caption: caption || ''
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp image:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp image: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error('Exception in sendWhatsAppImage:', err);
    throw err;
  }
}

/**
 * Sends a template message via WhatsApp
 */
export async function sendWhatsAppTemplateMessage(message: WhatsAppTemplateMessage): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to,
          type: 'template',
          template: message.template,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp template message:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp template message: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error('Exception in sendWhatsAppTemplateMessage:', err);
    throw err;
  }
}

/**
 * Sends a list message with interactive buttons
 */
interface WhatsAppListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

export async function sendWhatsAppListMessage(
  to: string, 
  header: string, 
  body: string, 
  buttonText: string, 
  sections: WhatsAppListSection[]
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: {
              type: 'text',
              text: header,
            },
            body: {
              text: body,
            },
            action: {
              button: buttonText,
              sections,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp list message:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp list message: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error('Exception in sendWhatsAppListMessage:', err);
    throw err;
  }
}

/**
 * Sends a reply button message
 */
interface WhatsAppButton {
  id: string;
  title: string;
}

export async function sendWhatsAppReplyButtons(
  to: string,
  body: string,
  buttons: WhatsAppButton[]
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: body,
            },
            action: {
              buttons: buttons.map((button) => ({
                type: 'reply',
                reply: {
                  id: button.id,
                  title: button.title,
                },
              })),
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp reply buttons:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp reply buttons: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error('Exception in sendWhatsAppReplyButtons:', err);
    throw err;
  }
}

/**
 * Validates a WhatsApp phone number format
 */
export function validatePhoneNumber(phoneNumber: string): boolean {
  // Basic validation - should be in format 1234567890 or +1234567890
  return /^\+?[1-9]\d{1,14}$/.test(phoneNumber);
}

/**
 * Formats a phone number to E.164 format
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // If it starts with a country code, add +
  if (digits.length > 10) {
    return `+${digits}`;
  }
  
  // Default to US country code if no country code provided
  return `+1${digits}`;
}

/**
 * Sends a custom interactive template via WhatsApp
 * @param to Phone number to send to
 * @param template Template object with interactive content
 * @returns WhatsApp message response
 */
export async function sendWhatsAppTemplate(to: string, template: any): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    // Check if we have valid credentials before attempting to send
    if (!accessToken || accessToken.includes('dev-') || accessToken === 'EAABBC') {
      console.warn(`[WhatsApp] Missing valid WhatsApp access token. Template to ${to} will not be sent.`);
      
      // In development, return a fake success response
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV MODE] Would have sent WhatsApp template to ${to}:`, JSON.stringify(template, null, 2));
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: `mock-${Date.now()}` }]
        };
      }
      
      throw new Error('Missing valid WhatsApp access token');
    }
    
    if (!phoneNumberId || phoneNumberId.includes('dev-')) {
      console.warn(`[WhatsApp] Missing valid WhatsApp phone number ID. Template to ${to} will not be sent.`);
      
      // In development, return a fake success response
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV MODE] Would have sent WhatsApp template to ${to} using phone ID: ${phoneNumberId}`);
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: `mock-${Date.now()}` }]
        };
      }
      
      throw new Error('Missing valid WhatsApp phone number ID');
    }
    
    console.log(`Sending WhatsApp template to ${to} using phone number ID: ${phoneNumberId}`);
    
    // Debug the template
    console.log('Template before processing:', JSON.stringify(template, null, 2));
    
    // Validate template structure
    if (!template || typeof template !== 'object') {
      console.error('Invalid template object:', template);
      throw new Error('Template must be a valid object');
    }

    // Special case: handle interactive buttons
    if (template.type === 'buttons' && template.text && Array.isArray(template.buttons)) {
      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: template.text
          },
          action: {
            buttons: template.buttons.map((button: any) => ({
              type: 'reply',
              reply: {
                id: button.id,
                title: button.title
              }
            }))
          }
        }
      };
      
      console.log('Sending interactive message with buttons:', JSON.stringify(interactiveMessage, null, 2));
      
      const response = await fetch(
        `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(interactiveMessage),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Error sending WhatsApp interactive message:', response.status, errorData);
        throw new Error(`Failed to send WhatsApp interactive message: ${errorData}`);
      }
      
      const result = await response.json();
      console.log('WhatsApp interactive message sent successfully to:', to);
      return result;
    }

    // Special case: handle no_wallet_yet as interactive message with buttons
    if (template.name === 'no_wallet_yet') {
      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: "👋 Welcome!\n\nYou're almost ready to start.\n\nTap below to create your wallets:\n🔹 EVM (Base, Ethereum, etc.)\n🔸 Solana (fast + low fees)"
          },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: 'create_wallets',
                  title: 'Create Wallets'
                }
              }
            ]
          }
        }
      };
      
      console.log('Sending interactive message for no_wallet_yet:', JSON.stringify(interactiveMessage, null, 2));
      
      const response = await fetch(
        `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(interactiveMessage),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Error sending WhatsApp interactive message:', response.status, errorData);
        throw new Error(`Failed to send WhatsApp interactive message: ${errorData}`);
      }
      
      const result = await response.json();
      console.log('WhatsApp interactive message sent successfully to:', to);
      return result;
    }
    
    // Special case: handle templates with URL buttons (send_success, swap_success)
    if (template.name === 'send_success' || template.name === 'swap_success') {
      // Extract the URL from the explorerUrl parameter if available
      const explorerUrl = template.explorerUrl || '';
      
      if (explorerUrl && explorerUrl.startsWith('http')) {
        // Find the body text based on template type
        let bodyText = '';
        if (template.name === 'send_success' && template.components?.[0]?.parameters) {
          const params = template.components[0].parameters;
          const amount = params[0]?.text || '';
          const token = params[1]?.text || '';
          const recipient = params[2]?.text || '';
          const balance = params[3]?.text || '';
          bodyText = `✅ You sent ${amount} ${token} to:\n\n${recipient}\n\n🔗 Your new balance is:\n${balance}`;
        } else if (template.name === 'swap_success' && template.components?.[0]?.parameters) {
          const params = template.components[0].parameters;
          const from_amount = params[0]?.text || '';
          const to_amount = params[1]?.text || '';
          const network = params[2]?.text || '';
          const balance = params[3]?.text || '';
          bodyText = `🔄 Swap complete!\n\nYou swapped ${from_amount}\n→ ${to_amount} on ${network}.\n\n🔗 Your new balance is\n${balance}`;
        }
        
        // Create interactive message with button
        const interactiveMessage = {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: bodyText
            },
            action: {
              buttons: [
                {
                  type: 'url',
                  url: explorerUrl,
                  text: 'View in Explorer'
                }
              ]
            }
          }
        };
        
        console.log('Sending interactive message with URL button:', JSON.stringify(interactiveMessage, null, 2));
        
        const response = await fetch(
          `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(interactiveMessage),
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          console.error('Error sending WhatsApp interactive message:', response.status, errorData);
          throw new Error(`Failed to send WhatsApp interactive message: ${errorData}`);
        }
        
        const result = await response.json();
        console.log('WhatsApp interactive message sent successfully to:', to);
        return result;
      }
    }

    // For all other templates, use standard template format
    if (!template.name) {
      console.error('Template missing name:', template);
      throw new Error('Template must include a name property');
    }

    // Ensure language is in the correct format
    const language = typeof template.language === 'string' 
      ? { code: template.language } 
      : template.language || { code: 'en' };

    // Clean up components if present
    let components = [];
    if (Array.isArray(template.components)) {
      components = template.components.map((comp: any) => {
        const cleanComponent: any = { type: comp.type };
        
        // Handle parameters if present
        if (Array.isArray(comp.parameters)) {
          // Check if this is a positional or named parameter template
          // These templates use positional parameters (no 'name' property)
          const positionalTemplates = [
            'wallet_balance',
            'users_wallet_addresses',
            'no_wallet_yet',
            'private_keys',
            'crypto_deposit_notification',
            'swap_processing',
            'swap_quote_confirm',
            'quote_pending',
            'swap_prompt',
            'send_token_prompt',
            'bridge_deposit_notification',
            'bridge_processing',
            'bridge_quote_confirm',
            'bridge_quote_pending'
          ];
          
          const isPositionalTemplate = positionalTemplates.includes(template.name);
          
          // For positional templates, remove the name property
          // For named templates, keep the name property
          cleanComponent.parameters = comp.parameters.map((param: any) => {
            if (isPositionalTemplate) {
              // For positional templates, remove name property
              return {
                type: param.type || 'text',
                text: param.text || ''
              };
            } else {
              // For named templates, keep name property
              return {
                type: param.type || 'text',
                text: param.text || '',
                name: param.name
              };
            }
          });
        }
        
        return cleanComponent;
      });
    }

    // Create the final template payload
    const fullTemplate = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: String(template.name),
        language,
        components
      }
    };
    
    // Debug the final template
    console.log('Final template payload:', JSON.stringify(fullTemplate, null, 2));
    
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fullTemplate),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp template:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp template: ${errorData}`);
    }
    
    const result = await response.json();
    console.log('WhatsApp template sent successfully to:', to);
    return result;
  } catch (err) {
    console.error('Exception in sendWhatsAppTemplate:', err);
    
    // In development, provide a mock response instead of throwing
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DEV MODE] Providing mock WhatsApp response due to error');
      return {
        messaging_product: 'whatsapp',
        contacts: [{ input: to, wa_id: to }],
        messages: [{ id: `error-mock-${Date.now()}` }]
      };
    }
    
    throw err;
  }
}

// Handle incoming WhatsApp messages
export async function handleIncomingWhatsAppMessage(body: any) {
  console.log('Received WhatsApp webhook payload:', JSON.stringify(body, null, 2));
  
  // Parse the incoming WhatsApp message
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  
  // Check if this is a message
  const message = value?.messages?.[0];
  
  // Check if this is a button click
  const interactive = message?.interactive;
  const buttonReply = interactive?.button_reply;
  
  // Get the sender - could be in different places depending on message type
  const from = message?.from || value?.contacts?.[0]?.wa_id || value?.metadata?.phone_number_id;
  
  // No sender, no processing
  if (!from) {
    console.log('No sender found in the message. Full payload:', JSON.stringify(body, null, 2));
    return;
  }
  
  console.log(`Processing message from: ${from}`);
  
  // Detect duplicate messages using a simple timestamp-based approach
  // This helps prevent processing the same message twice
  const messageId = message?.id || (interactive ? `interactive_${Date.now()}` : `unknown_${Date.now()}`);
  const timestamp = value?.timestamp || Date.now();
  
  // Use a static cache for simplicity (in production, use Redis or similar)
  if (!global.processedMessages) {
    global.processedMessages = {};
  }
  
  // Check if we've seen this message before
  if (messageId && global.processedMessages[messageId]) {
    console.log(`Skipping duplicate message ${messageId}`);
    return;
  }
  
  // Mark this message as processed
  if (messageId) {
    global.processedMessages[messageId] = timestamp;
    
    // Clean up old messages (keep last 100)
    const messageIds = Object.keys(global.processedMessages);
    if (messageIds.length > 100) {
      const oldestKeys = messageIds
        .sort((a, b) => global.processedMessages[a] - global.processedMessages[b])
        .slice(0, messageIds.length - 100);
      
      oldestKeys.forEach(key => {
        delete global.processedMessages[key];
      });
    }
  }

  try {
    // Generate a proper UUID for the user based on the phone number
    // This ensures we have a valid UUID for database operations
    const userId = await getUserIdFromPhone(from);
    
    // Handle button clicks
    if (buttonReply) {
      console.log('Button clicked:', buttonReply);
      const buttonId = buttonReply.id;
      
      // Handle specific button actions
      if (buttonId === 'create_wallets') {
        console.log('Create wallets button clicked by:', from);
        const actionResult = await handleAction('create_wallets', {}, userId);
        
        if (!actionResult) {
          console.error('No action result returned from create_wallets');
          await sendWhatsAppMessage(from, { text: "I couldn't create your wallets. Please try again." });
          return;
        }
        
        if ('name' in actionResult) {
          await sendWhatsAppTemplate(from, actionResult);
        } else if ('text' in actionResult && typeof actionResult.text === 'string') {
          await sendWhatsAppMessage(from, { text: actionResult.text });
        } else {
          console.error('Unknown action result format from create_wallets:', actionResult);
          await sendWhatsAppMessage(from, { text: "I couldn't process your wallet creation properly." });
        }
        
        return;
      }
      
      // Handle send confirmation buttons
      if (buttonId === 'confirm_send' || buttonReply.title.toLowerCase() === 'yes') {
        console.log('Send confirmation button clicked by:', from);
        // Show pending message
        await sendWhatsAppTemplate(from, txPending());
        // Get transaction details from the session
        const { data: session } = await supabase
          .from('sessions')
          .select('context')
          .eq('user_id', userId)
          .single();
        const pendingTx = session?.context?.find((item: { role: string, content: string }) => 
          item.role === 'system' && 
          JSON.parse(item.content)?.pending?.action === 'send'
        );
        let txParams = {};
        if (pendingTx) {
          txParams = JSON.parse(pendingTx.content)?.pending || {};
        }
        // Execute the send transaction
        const actionResult = await handleAction('send', { ...txParams, isExecute: true }, userId);
        if (actionResult) {
          if ('name' in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
          } else if ('text' in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
          }
        }
        return;
      }
      
      if (buttonId === 'cancel_send') {
        console.log('Send canceled by:', from);
        await sendWhatsAppMessage(from, { text: "Transaction canceled. Your funds have not been sent." });
        return;
      }
      
      // For other buttons, we can handle them here
      // ...
    }
    
    // Handle text messages
    const text = message?.text?.body;
    if (text) {
      // Check for greetings before anything else
      const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
      if (greetings.some(greet => text.trim().toLowerCase().startsWith(greet))) {
        await sendWhatsAppMessage(from, {
          text: "Hi! I'm Hedwig, your crypto assistant. I can help you create wallets, check balances, send, swap, and bridge tokens, and more. How can I help you today?"
        });
        return;
      }
      
      // Check if the user is asking about the bot's identity
      const lowerText = text.toLowerCase();
      if ((lowerText.includes('who are you') || 
           lowerText.includes('what are you') || 
           lowerText.includes('what is your name') ||
           lowerText.includes('what do you do') ||
           (lowerText.includes('your') && lowerText.includes('name')) ||
           (lowerText.includes('what') && lowerText.includes('hedwig')))) {
        
        await sendWhatsAppMessage(from, { 
          text: "I'm Hedwig, your crypto assistant bot! I can help you manage your crypto wallets, send and receive tokens, swap between different cryptocurrencies, and bridge tokens between chains. Just let me know what you'd like to do!" 
        });
        return;
      }
      
      // Use Gemini LLM (Hedwig) for response
      const llmResponse = await runLLM({ userId, message: text });
      console.log('LLM Response:', llmResponse);
      
      // Add detailed logging for intent detection
      console.log('User message:', text);
      
      const { intent, params } = parseIntentAndParams(llmResponse);
      console.log('Detected intent:', intent);
      console.log('Detected params:', params);
      
      // Normalize token field in params
      params.token = params.token || params.asset || params.symbol;
      // Check for pending action in session
      const { data: session } = await supabase
        .from('sessions')
        .select('context')
        .eq('user_id', userId)
        .single();
      let pending = null;
      if (session?.context) {
        pending = session.context.find((item: any) => item.role === 'system' && JSON.parse(item.content)?.pending);
      }
      // Intercept 'yes' for send confirmation if pending send flow is ready
      if (pending) {
        const pendingObj = JSON.parse(pending.content).pending;
        // Normalize token in pendingObj
        pendingObj.token = pendingObj.token || pendingObj.asset || pendingObj.symbol;
        const mergedParams = { ...pendingObj, ...params };
        mergedParams.token = mergedParams.token || mergedParams.asset || mergedParams.symbol;
        const hasAll = mergedParams.token && mergedParams.amount && mergedParams.recipient && mergedParams.network;
        if (hasAll && (text.trim().toLowerCase() === 'yes' || text.trim().toLowerCase() === 'confirm')) {
          // Show tx_pending
          await sendWhatsAppTemplate(from, txPending());
          // Execute the send transaction
          const actionResult = await handleAction('send', { ...mergedParams, isExecute: true }, userId);
          if (actionResult) {
            if ('name' in actionResult) {
              await sendWhatsAppTemplate(from, actionResult);
            } else if ('text' in actionResult) {
              await sendWhatsAppMessage(from, { text: actionResult.text });
            }
          }
          // Clear pending context
          await supabase.from('sessions').upsert([
            {
              user_id: userId,
              context: [],
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'user_id' });
          return;
        }
      }
      
      // Direct keyword detection for certain operations
      // This helps catch specific user requests even if LLM parsing fails
      
      // Check for deposit-related keywords
      if (lowerText.includes('deposit') || 
          lowerText.includes('receive') || 
          (lowerText.includes('wallet') && lowerText.includes('address'))) {
        console.log('Deposit request detected, overriding intent');
        const actionResult = await handleAction('instruction_deposit', {}, userId);
        console.log('Action result for instruction_deposit:', JSON.stringify(actionResult, null, 2));
        
        if (actionResult && 'text' in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }
      
      // Check for send-related keywords to provide guidance
      if ((lowerText.includes('send') || lowerText.includes('transfer')) && 
          (lowerText.includes('token') || lowerText.includes('eth') || 
           lowerText.includes('sol') || lowerText.includes('usdc') || lowerText === 'send' || lowerText === 'send tokens')) {
        console.log('Send request detected, providing guidance');
        // If this is a generic send request, prompt for all fields with an example
        if (lowerText === 'send' || lowerText === 'send tokens' || lowerText === 'i want to send tokens' || lowerText === 'i want to send') {
          await sendWhatsAppMessage(from, {
            text: 'Sure! What token would you like to send? For example: "Send 0.1 USDC to 0x123... on Base Sepolia"'
          });
          // Store pending context for send
          await supabase.from('sessions').upsert([
            {
              user_id: userId,
              context: [{
                role: 'system',
                content: JSON.stringify({ pending: { action: 'send' } })
              }],
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'user_id' });
          return;
        }
        // Get the detected parameters
        const token = params.token || params.asset || params.symbol;
        const amount = params.amount || '';
        const recipient = params.recipient || params.to || '';
        const network = params.network || params.chain || '';
        // If we're missing details, ask for them
        const missing: string[] = [];
        if (!token) missing.push('token');
        if (!amount) missing.push('amount');
        if (!recipient) missing.push('recipient');
        if (!network) missing.push('network');
        if (missing.length > 0) {
          let promptText = 'To send tokens, please specify: ';
          if (missing.length === 4) {
            promptText = 'What token would you like to send? For example: "Send 0.1 USDC to 0x123... on Base Sepolia"';
          } else {
            promptText += missing.join(', ');
          }
          // Store pending context in session
          await supabase.from('sessions').upsert([
            {
              user_id: userId,
              context: [{
                role: 'system',
                content: JSON.stringify({ pending: { action: 'send', ...params } })
              }],
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'user_id' });
          await sendWhatsAppMessage(from, { text: promptText });
          return;
        }
        // If we have all parameters, proceed with the send prompt
        const actionResult = await handleAction('send_token_prompt', { 
          amount, 
          token, 
          recipient,
          network
        }, userId);
        if (actionResult) {
          if ('name' in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
          } else if ('text' in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
          }
        }
        return;
      }
      
      // Check for swap instruction keywords
      if ((lowerText.includes('swap') || lowerText.includes('exchange') || lowerText.includes('convert')) &&
          (lowerText.includes('how') || lowerText.includes('help') || 
           lowerText.includes('instruct') || lowerText.includes('want to'))) {
        console.log('Swap instruction request detected, overriding intent');
        const actionResult = await handleAction('instruction_swap', {}, userId);
        console.log('Action result for instruction_swap:', JSON.stringify(actionResult, null, 2));
        
        if (actionResult && 'text' in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }
      
      // Check for bridge instruction keywords
      if ((lowerText.includes('bridge') || 
           lowerText.includes('cross chain') || 
           lowerText.includes('move between chains')) &&
          (lowerText.includes('how') || lowerText.includes('help') || 
           lowerText.includes('instruct') || lowerText.includes('want to'))) {
        console.log('Bridge instruction request detected, overriding intent');
        const actionResult = await handleAction('instruction_bridge', {}, userId);
        console.log('Action result for instruction_bridge:', JSON.stringify(actionResult, null, 2));
        
        if (actionResult && 'text' in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }
      
      // Check for send instruction keywords
      if ((lowerText.includes('send') || lowerText.includes('withdraw') || lowerText.includes('transfer')) &&
          (lowerText.includes('how') || lowerText.includes('help') || 
           lowerText.includes('instruct') || lowerText.includes('want to'))) {
        console.log('Send instruction request detected, overriding intent');
        const actionResult = await handleAction('instruction_send', {}, userId);
        console.log('Action result for instruction_send:', JSON.stringify(actionResult, null, 2));
        
        if (actionResult && 'text' in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }
      
      // Add extra check for wallet address requests
      if (lowerText.includes('wallet address') || 
          lowerText.includes('my address') || 
          lowerText.includes('show address') || 
          lowerText.includes('view address')) {
        console.log('Wallet address request detected, overriding intent');
        const actionResult = await handleAction('instruction_deposit', {}, userId);
        console.log('Action result for instruction_deposit:', JSON.stringify(actionResult, null, 2));
        
        if (actionResult) {
          if ('name' in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
            return;
          } else if ('text' in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
            return;
          }
        }
      }
      
      const actionResult = await handleAction(intent, params, userId);
      console.log('Action result:', JSON.stringify(actionResult, null, 2));
      
      // Handle different result types
      if (!actionResult) {
        console.error('No action result returned');
        await sendWhatsAppMessage(from, { text: "I couldn't process that request." });
        return;
      }
      
      if ('template' in actionResult && actionResult.template) {
        // Legacy template format with nested template property
        await sendWhatsAppTemplate(from, actionResult.template);
      } else if (Array.isArray(actionResult)) {
        // Safely handle array of messages
        for (let i = 0; i < actionResult.length; i++) {
          const msg = actionResult[i];
          try {
            if (msg && typeof msg === 'object') {
              if ('template' in msg && msg.template) {
                await sendWhatsAppTemplate(from, msg.template);
              } else if ('name' in msg && msg.name) {
                await sendWhatsAppTemplate(from, msg);
              } else if ('text' in msg && typeof msg.text === 'string') {
                await sendWhatsAppMessage(from, { text: msg.text });
              } else {
                console.warn('Unrecognized message format in array:', msg);
              }
            }
          } catch (err) {
            console.error('Error processing message in array:', err);
          }
        }
      } else if ('name' in actionResult) {
        // Direct template format
        await sendWhatsAppTemplate(from, actionResult);
      } else if ('text' in actionResult && typeof actionResult.text === 'string') {
        // Plain text response
        await sendWhatsAppMessage(from, { text: actionResult.text });
      } else {
        console.error('Unknown action result format:', actionResult);
        await sendWhatsAppMessage(from, { text: "I couldn't process that request properly." });
      }
    }
  } catch (error) {
    console.error('Error handling WhatsApp message:', error);
    await sendWhatsAppMessage(from, { text: "Sorry, I encountered an error processing your request." });
  }
}

/**
 * Get or create a UUID for a user based on their phone number
 * @param phoneNumber The user's phone number
 * @returns A valid UUID for the user
 */
async function getUserIdFromPhone(phoneNumber: string): Promise<string> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Check if user exists with this phone number
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    
    if (existingUser?.id) {
      console.log(`Found existing user ID ${existingUser.id} for phone ${phoneNumber}`);
      return existingUser.id;
    }
    
    // Create a new user with a valid UUID
    const newUserId = uuidv4();
    const { error } = await supabase
      .from('users')
      .insert([{ 
        id: newUserId, 
        phone_number: phoneNumber,
        created_at: new Date().toISOString()
      }]);
    
    if (error) {
      console.error('Error creating user:', error);
      throw error;
    }
    
    console.log(`Created new user ID ${newUserId} for phone ${phoneNumber}`);
    return newUserId;
  } catch (error) {
    console.error('Error in getUserIdFromPhone:', error);
    // Return a valid UUID as fallback
    const fallbackId = uuidv4();
    console.log(`Using fallback UUID ${fallbackId} for phone ${phoneNumber} due to error`);
    return fallbackId;
  }
}
