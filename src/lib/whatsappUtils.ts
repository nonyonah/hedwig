import { getRequiredEnvVar } from '@/lib/envUtils';
import { loadServerEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { textTemplate } from './whatsappTemplates';
import { runLLM } from './llmAgent';
import { parseIntentAndParams } from './intentParser';
import { handleAction } from '../api/actions';

// Extend the global object to include our message cache
declare global {
  var processedMessages: Record<string, number>;
}

// Initialize the global message cache if it doesn't exist
if (typeof global.processedMessages === 'undefined') {
  global.processedMessages = {};
}

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
          cleanComponent.parameters = comp.parameters.map((param: any) => {
            // Remove 'name' property if present
            const { name, ...cleanParam } = param;
            return cleanParam;
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
  // Parse the incoming WhatsApp message
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  
  // Check if this is a message
  const message = value?.messages?.[0];
  
  // Check if this is a button click
  const interactive = message?.interactive;
  const buttonReply = interactive?.button_reply;
  
  // Get the sender
  const from = message?.from;
  
  // No sender, no processing
  if (!from) {
    console.log('No sender found in the message');
    return;
  }
  
  // Detect duplicate messages using a simple timestamp-based approach
  // This helps prevent processing the same message twice
  const messageId = message?.id;
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
    // Handle button clicks
    if (buttonReply) {
      console.log('Button clicked:', buttonReply);
      const buttonId = buttonReply.id;
      
      // Handle specific button actions
      if (buttonId === 'create_wallets') {
        console.log('Create wallets button clicked by:', from);
        const actionResult = await handleAction('create_wallets', {}, from);
        
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
      
      // For other buttons, we can handle them here
      // ...
    }
    
    // Handle text messages
    const text = message?.text?.body;
    if (text) {
      // Use Gemini LLM (Hedwig) for response
      const llmResponse = await runLLM({ userId: from, message: text });
      console.log('LLM Response:', llmResponse);
      const { intent, params } = parseIntentAndParams(llmResponse);
      const actionResult = await handleAction(intent, params, from);
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
