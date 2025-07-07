import { v4 as uuidv4 } from 'uuid';

/**
 * Sends a WhatsApp template message to a user
 * @param phoneNumber User's phone number
 * @param template Template object with name, language, and components
 * @returns Promise that resolves when the message is sent
 */
export async function sendWhatsAppTemplate(phoneNumber: string, template: any): Promise<any> {
  try {
    // Get your WhatsApp Business Account ID and access token from env vars
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!wabaId || !accessToken) {
      console.error('Missing required environment variables for WhatsApp API');
      throw new Error('Missing WhatsApp API configuration');
    }
    
    // Construct the request to the WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'template',
          template: template
        })
      }
    );
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status} ${JSON.stringify(result)}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error sending WhatsApp template:', error);
    throw error;
  }
}

/**
 * Triggers a WhatsApp Flow for wallet import
 * @param phoneNumber User's phone number
 * @returns Promise that resolves when the flow is triggered
 */
export async function triggerWalletImportFlow(phoneNumber: string): Promise<any> {
  try {
    // Get your WhatsApp Business Account ID and Flow ID from env vars
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const flowId = process.env.WALLET_IMPORT_FLOW_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!wabaId || !flowId || !accessToken) {
      console.error('Missing required environment variables for WhatsApp Flow');
      throw new Error('Missing WhatsApp Flow configuration');
    }
    
    // Construct the request to the WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'flows',
          flows: [{
            flow_id: flowId,
            // Optional flow token if you need to pass data to the flow
            flow_token: uuidv4(),
            // Optional context data to pre-fill flow fields
            context: {
              // You can include any context data needed for the flow
              requested_at: new Date().toISOString(),
              phone_number: phoneNumber
            }
          }]
        })
      }
    );
    
    const result = await response.json();
    console.log('Flow trigger result:', result);
    return result;
  } catch (error) {
    console.error('Error triggering wallet import flow:', error);
    throw error;
  }
}