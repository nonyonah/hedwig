import type { NextApiRequest, NextApiResponse } from 'next';
import { checkWalletBalance } from '../../lib/agentkit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { address } = req.query;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    const balance = await checkWalletBalance();
    res.status(200).json({ balance });
  } catch (error) {
    console.error('Error checking balance:', error);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
}