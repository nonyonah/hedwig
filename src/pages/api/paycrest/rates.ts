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
        if (response.status === 400) {
          const errorData = await response.json().catch(() => ({} as any));
          const msg = errorData?.message || 'Rate validation failed';
          throw new Error(`Rate validation failed (${fiatNorm}): ${msg}`);
        } else if (response.status === 404) {
          throw new Error(`No provider available for token/usd/${fiatNorm}`);
        } else {
          throw new Error(`Rate fetch failed (${fiatNorm}): ${response.status} ${response.statusText}`);
        }
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
    console.error('[api/paycrest/rates] Error:', error?.message || error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch rates' });
  }
}
