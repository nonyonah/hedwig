export async function sendWhatsAppMessage(to: string, message: string) {
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
          text: { body: message },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error sending WhatsApp message:', response.status, errorData);
      throw new Error(`Failed to send WhatsApp message: ${errorData}`);
    }
    console.log('WhatsApp message sent successfully to:', to);
    return await response.json();
  } catch (err) {
    console.error('Exception in sendWhatsAppMessage:', err);
    throw err; // Re-throw to allow caller to handle
  }
}
