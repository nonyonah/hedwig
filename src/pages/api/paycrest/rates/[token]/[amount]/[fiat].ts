import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_TOKEN = process.env.PAYCREST_API_TOKEN;
const PAYCREST_API_BASE_URL = 'https://api.paycrest.com/v1/sender';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Basic CORS handling
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!PAYCREST_API_TOKEN) {
      return res.status(500).json({ error: 'Paycrest API token not configured' });
    }

    const { token, amount, fiat, network, provider_id } = req.query as Record<string, string>;

    if (!token || !amount || !fiat) {
      return res.status(400).json({ error: 'Missing required path params: /api/paycrest/rates/{token}/{amount}/{fiat}' });
    }

    const normToken = token.toLowerCase();
    const parsedAmount = Number(amount);

    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount. Must be a positive number.' });
    }

    // Normalize fiat to Paycrest standard: ngn, kes (map legacy KSH->KES)
    const fiatLower = fiat.toLowerCase();
    const normFiat = fiatLower === 'ksh' ? 'kes' : fiatLower;

    const url = new URL(`${PAYCREST_API_BASE_URL}/rates/${normToken}/${parsedAmount}/${normFiat}`);
    if (network) url.searchParams.append('network', network);
    if (provider_id) url.searchParams.append('provider_id', provider_id);

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${PAYCREST_API_TOKEN}` },
      cache: 'no-store',
    });

    const data = await upstream.json().catch(() => ({} as any));

    if (!upstream.ok) {
      if (upstream.status === 400) {
        return res.status(400).json({ error: data?.message || 'Rate validation failed' });
      }
      if (upstream.status === 404) {
        return res.status(404).json({ error: `No provider available for ${normToken}/${parsedAmount}/${normFiat}` });
      }
      return res.status(upstream.status).json({ error: data?.message || `Rate fetch failed: ${upstream.statusText}` });
    }

    // Expecting Paycrest shape { data: { amount: <number>, ... } }
    return res.status(200).json({ success: true, data: data.data });
  } catch (error: any) {
    console.error('[api/paycrest/rates/[token]/[amount]/[fiat]] Error:', error?.message || error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
