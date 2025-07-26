import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[Deprecated Webhook] Received ${req.method} request.`);

  // This endpoint is deprecated - WhatsApp functionality has been replaced with Telegram
  res.status(410).json({ 
    error: 'WhatsApp webhook is deprecated', 
    message: 'This application now uses Telegram Bot API. Please use /api/telegram/webhook instead.',
    redirect: '/telegram'
  });
}