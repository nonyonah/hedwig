import { getRequiredEnvVar } from '@/lib/envUtils';
import { loadServerEnvironment, getWhatsAppEnvironment } from './serverEnv';

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

export async function sendWhatsAppMessage(to: string, message: string): Promise<WhatsAppMessageResponse> {
  try {
    const whatsappEnv = getWhatsAppEnvironment();
    const phoneNumberId = whatsappEnv.phoneNumberId;
    const accessToken = whatsappEnv.accessToken;
    
    console.log(`Sending WhatsApp message to ${to} using phone number ID: ${phoneNumberId}`);
    
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
            body: message,
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
    throw err;
  }
}

/**
 * Sends an image via WhatsApp
 */
export async function sendWhatsAppImage(to: string, imageUrl: string, caption: string = ''): Promise<WhatsAppMessageResponse> {
  try {
    const whatsappEnv = getWhatsAppEnvironment();
    const phoneNumberId = whatsappEnv.phoneNumberId;
    const accessToken = whatsappEnv.accessToken;
    
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
    const whatsappEnv = getWhatsAppEnvironment();
    const phoneNumberId = whatsappEnv.phoneNumberId;
    const accessToken = whatsappEnv.accessToken;
    
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
    const whatsappEnv = getWhatsAppEnvironment();
    const phoneNumberId = whatsappEnv.phoneNumberId;
    const accessToken = whatsappEnv.accessToken;
    
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
    const whatsappEnv = getWhatsAppEnvironment();
    const phoneNumberId = whatsappEnv.phoneNumberId;
    const accessToken = whatsappEnv.accessToken;
    
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
