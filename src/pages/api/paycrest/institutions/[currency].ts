import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { currency } = req.query;

    if (!currency || typeof currency !== 'string') {
      return res.status(400).json({ error: 'Missing currency' });
    }

    // Normalize currency code to Paycrest standard (lowercase)
    const normalized = currency.toString().toLowerCase();
    const currencyCode = normalized === 'ksh' ? 'kes' : normalized; // map legacy KSH -> KES
    if (!['ngn', 'kes'].includes(currencyCode)) {
      return res.status(400).json({ error: 'Unsupported currency. Use NGN or KES.' });
    }

    const url = `${PAYCREST_API_URL}/institutions/${currencyCode}`;

    const response = await fetch(url,
      {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[api/paycrest/institutions] Paycrest API error:', { status: response.status, body: errorBody });
      try {
        const errorData = JSON.parse(errorBody);
        return res.status(response.status).json({ error: errorData.message || 'Failed to fetch institutions' });
      } catch (e) {
        return res.status(response.status).json({ error: 'Failed to fetch institutions' });
      }
    }

    const data = await response.json();
    const institutions = data.data.map((inst: any) => ({ name: inst.name, code: inst.code }));

    return res.status(200).json({ success: true, institutions });
  } catch (e: any) {
    console.error('[api/paycrest/institutions] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
