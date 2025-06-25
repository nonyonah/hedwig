import { getRequiredEnvVar } from '@/lib/envUtils';
import { loadServerEnvironment } from './serverEnv';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { textTemplate } from './whatsappTemplates';
import { runLLM } from './llmAgent';
import { parseIntentAndParams } from './intentParser';
import { handleAction } from '../api/actions';

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
    
    // Add the recipient and required messaging_product to the template
    const fullTemplate = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: {
          code: template.language
        },
        components: template.components
      }
    };
    
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
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
  const message = change?.value?.messages?.[0];
  const from = message?.from;
  const text = message?.text?.body;

  if (text) {
    // Use Gemini LLM (Hedwig) for response
    const llmResponse = await runLLM({ userId: from, message: text });
    console.log('LLM Response:', llmResponse);
    const { intent, params } = parseIntentAndParams(llmResponse);
    const actionResult = await handleAction(intent, params, from);
    if ('template' in actionResult) {
      await sendWhatsAppTemplate(from, actionResult);
    } else if (Array.isArray(actionResult)) {
      for (const msg of actionResult) {
        if ('template' in msg) {
          await sendWhatsAppTemplate(from, msg);
        } else {
          const response = textTemplate(msg.text);
          await sendWhatsAppMessage(from, response);
        }
      }
    } else if ('name' in actionResult) {
      await sendWhatsAppTemplate(from, actionResult);
    }
  }
}
