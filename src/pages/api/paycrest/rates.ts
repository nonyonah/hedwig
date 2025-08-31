import type { NextApiRequest, NextApiResponse } from 'next';

const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // Fetch the current rate in the requested pattern
    const fetchRate = async (token: string, amount: number, currency: 'NGN' | 'KSH' | 'KES', network?: string) => {
      // Normalize KSH -> KES
      const fiat = currency.toUpperCase() === 'KSH' ? 'KES' : currency.toUpperCase();
      const base = `${PAYCREST_API_BASE_URL}/rates/${token}/${amount}/${fiat}`;
      const url = network ? `${base}?network=${encodeURIComponent(network)}` : base;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Rate fetch failed: ${response.status} ${response.statusText}`);
      }

      const rateData = await response.json();
      return rateData.data as string; // upstream returns string
    };

    // Using USDC with NGN and KES on 'base' network by default
    const [ngnRate, kesRate] = await Promise.all([
      fetchRate('USDC', 1, 'NGN', 'base'),
      fetchRate('USDC', 1, 'KES', 'base'),
    ]);

    // Parse rates to numbers since upstream returns strings
    const parsedRates = {
      NGN: parseFloat(ngnRate),
      KSH: parseFloat(kesRate)
    };

    res.status(200).json({ success: true, rates: parsedRates });
  } catch (error: any) {
    console.error('[api/paycrest/rates] Error:', error?.message || error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch rates' });
  }
}
