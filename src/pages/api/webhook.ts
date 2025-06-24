import type { NextApiRequest, NextApiResponse } from 'next';
import { handleIncomingWhatsAppMessage } from '@/lib/whatsappUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Webhook verification (for WhatsApp setup)
    try {
      const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(String(challenge));
        return;
      }
      res.status(403).send('Verification failed');
    } catch (error) {
      console.error('Webhook verification error:', error);
      res.status(500).send('Internal server error');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      await handleIncomingWhatsAppMessage(body);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error handling WhatsApp message:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}