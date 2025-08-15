import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Basic CORS handling
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { institution, accountIdentifier } = req.body;
    if (!institution || !accountIdentifier) {
      return res.status(400).json({ error: 'Missing required fields: institution, accountIdentifier' });
    }

    if (!PAYCREST_API_KEY) {
      return res.status(500).json({ error: 'Paycrest API key not configured' });
    }

    const response = await fetch(`${PAYCREST_API_URL}/verify-account`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          institution: institution,
          accountIdentifier: accountIdentifier,
        }),
      }
    );

    const data = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      console.error('[api/paycrest/verify-account] Paycrest API error:', data);
      // Surface validation errors clearly
      if (response.status === 400) {
        return res.status(400).json({ error: data?.message || 'Verification validation failed' });
      }
      return res.status(response.status).json({ error: data?.message || 'Failed to verify account' });
    }

    // According to docs, success response data is the account name string
    return res.status(200).json({ success: true, accountName: data?.data });
  } catch (e: any) {
    console.error('[api/paycrest/verify-account] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
