import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { currency, bankCode, accountNumber } = req.body;
    if (!currency || !bankCode || !accountNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!PAYCREST_API_KEY) {
      return res.status(500).json({ error: 'Paycrest API key not configured' });
    }

    const response = await fetch(`${PAYCREST_API_URL}/payouts/accounts/verify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          institution_code: bankCode,
          account_number: accountNumber,
          currency: currency,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[api/paycrest/verify-account] Paycrest API error:', data);
      return res.status(response.status).json({ error: data.message || 'Failed to verify account' });
    }

    return res.status(200).json({ success: true, accountName: data.data.account_name });
  } catch (e: any) {
    console.error('[api/paycrest/verify-account] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
