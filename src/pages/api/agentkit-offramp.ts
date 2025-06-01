import type { NextApiRequest, NextApiResponse } from 'next';
import { offRampCrypto } from '../../lib/agentkit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { token, amount, walletAddress } = req.body;
  if (!token || !amount || !walletAddress) {
    return res.status(400).json({ error: 'token, amount, and walletAddress are required' });
  }

  try {
    const result = await offRampCrypto(token, amount, walletAddress);
    res.status(200).json({ result });
  } catch (error) {
    console.error('Error off-ramping crypto:', error);
    res.status(500).json({ error: 'Failed to off-ramp crypto' });
  }
}