import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    if (!PAYCREST_API_KEY) return res.status(500).json({ error: 'Paycrest API key not configured' });

    const { amountUSD, currency } = req.body as { amountUSD: number | string; currency: 'NGN' | 'KSH' | 'KES' };
    if (!amountUSD || !currency) return res.status(400).json({ error: 'Missing amountUSD or currency' });

    // Normalize currency to Paycrest standard (ngn/kes)
    const fiatNorm = String(currency).toLowerCase() === 'ksh' ? 'kes' : String(currency).toLowerCase();

    // Follow Sender API create order with retry/backoff
    const payload = {
      source_currency: 'USD',
      source_amount: Number(amountUSD),
      destination_currency: fiatNorm,
    };

    const maxRetries = 3;
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${PAYCREST_API_URL}/sender/orders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYCREST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          // Expose rate validation details clearly (400)
          if (response.status === 400) {
            const field = data?.data?.field;
            const msg = data?.data?.message || data?.message;
            throw new Error(msg ? `Validation failed${field ? ` (${field})` : ''}: ${msg}` : 'Validation failed');
          }
          throw new Error(data?.message || `Failed to create sender order (${response.status})`);
        }

        const receiveAddress = data?.data?.receive_address || data?.data?.receiveAddress;
        if (!receiveAddress) throw new Error('Missing receive address from Paycrest');

        return res.status(200).json({ success: true, receiveAddress, orderId: data?.data?.id });
      } catch (err: any) {
        lastError = err;
        if (attempt === maxRetries) break;
        const delay = Math.pow(2, attempt) * 1000; // exponential backoff
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    console.error('[api/paycrest/create-sender-order] Error after retries:', lastError);
    return res.status(500).json({ error: lastError?.message || 'Failed to create sender order' });
  } catch (e: any) {
    console.error('[api/paycrest/create-sender-order] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
