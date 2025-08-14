import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // If integrating real Paycrest rates, call their endpoint with API key here.
    // Fallback to simulated rates with minor jitter to mimic live updates
    const baseNGN = 1650;
    const baseKSH = 150;
    const jitter = (n: number, delta: number) => n + (Math.random() * 2 - 1) * delta;

    const NGN = jitter(baseNGN, 10);
    const KSH = jitter(baseKSH, 1);

    res.status(200).json({ success: true, rates: { NGN, KSH } });
  } catch (error: any) {
    console.error('[api/paycrest/rates] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch rates' });
  }
}
