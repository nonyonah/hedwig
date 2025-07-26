import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // Log the full incoming request details
        console.log("===== DEBUG WEBHOOK =====");
        console.log("Method:", req.method);
        console.log("Headers:", JSON.stringify(req.headers, null, 2));
        console.log("Body:", JSON.stringify(req.body, null, 2));
        console.log("Query:", JSON.stringify(req.query, null, 2));

        // Telegram validation (deprecated endpoint)
        if (req.method === 'GET') {
            return res.status(410).json({ 
                error: 'Telegram webhook is deprecated',
                message: 'Please use the new Telegram Bot API endpoint'
            });
        }

        const verifyToken = process.env.TELEGRAM_BOT_TOKEN;

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
                            console.log("==> CREATE WALLET BUTTON CLICKED!");
                        }
                    }
                    
                    // Check for quick reply
                    if (message.type === 'button') {
                        const buttonPayload = message?.button?.payload;
                        console.log("Quick reply payload:", buttonPayload);
                        
                        if (buttonPayload === 'create_wallets') {
                            console.log("==> CREATE WALLET BUTTON CLICKED!");
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