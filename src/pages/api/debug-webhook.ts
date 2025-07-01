import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Log the full incoming request details
    console.log("===== DEBUG WEBHOOK =====");
    console.log("Method:", req.method);
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log("Query:", JSON.stringify(req.query, null, 2));

    // WhatsApp validation
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      // Check if a token and mode were sent
      if (mode && token) {
        // Check the mode and token sent are correct
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === 'subscribe' && token === verifyToken) {
          // Respond with the challenge token from the request
          console.log('WEBHOOK_VERIFIED');
          return res.status(200).send(challenge);
        } else {
          // Respond with '403 Forbidden' if verify tokens do not match
          return res.status(403).end();
        }
      }
    }

    // Process incoming webhook
    if (req.method === 'POST') {
      const { entry } = req.body;
      
      if (entry && entry.length > 0) {
        // Extract payload from button click if exists
        const messages = entry[0]?.changes?.[0]?.value?.messages;
        
        if (messages && messages.length > 0) {
          const message = messages[0];
          
          // Check for interactive message (button click)
          if (message.type === 'interactive') {
            const buttonPayload = message?.interactive?.button_reply?.id;
            console.log("Button payload:", buttonPayload);
            
            if (buttonPayload === 'create_wallets') {
              console.log("🔍 CREATE WALLET BUTTON CLICKED!");
            }
          }
          
          // Check for quick reply
          if (message.type === 'button') {
            const buttonPayload = message?.button?.payload;
            console.log("Quick reply payload:", buttonPayload);
            
            if (buttonPayload === 'create_wallets') {
              console.log("🔍 CREATE WALLET BUTTON CLICKED!");
            }
          }
        }
      }
    }

    // Always return 200 OK to acknowledge receipt
    return res.status(200).end();
  } catch (error) {
    console.error("Debug webhook error:", error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
} 