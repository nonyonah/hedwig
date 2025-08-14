import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!PAYCREST_API_KEY) {
      throw new Error('Paycrest API key not configured.');
    }

    const fetchRate = async (fiat: 'NGN' | 'KSH') => {
      // Using USDC as the default token for off-ramping
      const token = 'usdc';
      const amount = fiat === 'KSH' ? 2 : 1;
      // Normalize fiat to Paycrest standard: ngn, kes (map legacy KSH->KES)
      const fiatNorm = fiat.toLowerCase() === 'ksh' ? 'kes' : fiat.toLowerCase();
      const url = `${PAYCREST_API_URL}/rates/${token}/${amount}/${fiatNorm}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[api/paycrest/rates] Paycrest API error for ${fiatNorm}:`, { status: response.status, body: errorBody });
        return null;
      }
      const data = await response.json();
      return data.data?.amount;
    };

    const [ngnRate, kshRate] = await Promise.all([
      fetchRate('NGN'),
      fetchRate('KSH'),
    ]);

    if (ngnRate === null || kshRate === null) {
      throw new Error('Failed to fetch one or more rates from Paycrest.');
    }

    res.status(200).json({ success: true, rates: { NGN: ngnRate, KSH: kshRate } });
  } catch (error: any) {
    console.error('[api/paycrest/rates] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch rates' });
  }
}
