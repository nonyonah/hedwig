import type { NextApiRequest, NextApiResponse } from 'next';
import { handleIncomingWhatsAppMessage } from '@/lib/whatsappUtils';

console.log('Loading /api/webhook module...');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[Webhook] Received ${req.method} request.`);

  if (req.method === 'GET') {
    try {
      const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[Webhook] Verification successful!');
        res.status(200).send(String(challenge));
        return;
      }
      console.warn('[Webhook] Verification failed: Mode or token mismatch.');
      res.status(403).send('Verification failed');
    } catch (error) {
      console.error('[Webhook] Verification error:', error);
      res.status(500).send('Internal server error');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      console.log('[Webhook] Handling POST request...');
      await handleIncomingWhatsAppMessage(req.body);
      console.log('[Webhook] POST request handled successfully.');
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[Webhook] Error handling POST request:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}