import type { NextApiRequest, NextApiResponse } from 'next';
import * as CDP from '@/lib/cdp';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, chain, userName } = req.body;
  if (!userId || !chain) {
    return res.status(400).json({ error: 'Missing userId or chain' });
  }

  try {
    const result = await CDP.getOrCreateWallet(userId, chain, userName);
    return res.status(200).json({ success: true, wallet: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || error.toString() });
  }
} 