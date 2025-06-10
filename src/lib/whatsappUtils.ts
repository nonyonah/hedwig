interface WhatsAppMessage {
  to: string;
  body: string;
  previewUrl?: boolean;
  mediaUrl?: string;
}

interface WhatsAppTemplateMessage {
  to: string;
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: any[];
  };
}

/**
 * Sends a text message via WhatsApp
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<any> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
export async function sendWhatsAppImage(to: string, imageUrl: string, caption: string = ''): Promise<any> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
export async function sendWhatsAppTemplateMessage(message: WhatsAppTemplateMessage): Promise<any> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
export async function sendWhatsAppListMessage(
  to: string, 
  header: string, 
  body: string, 
  buttonText: string, 
  sections: Array<{title: string, rows: Array<{id: string, title: string, description?: string}>}>
): Promise<any> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
export async function sendWhatsAppReplyButtons(
  to: string,
  body: string,
  buttons: Array<{id: string, title: string}>
): Promise<any> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
              buttons: buttons.map(button => ({
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
