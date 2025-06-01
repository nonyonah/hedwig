import type { NextApiRequest, NextApiResponse } from 'next';
import { swapTokens } from '../../lib/agentkit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { fromToken, toToken, amount, walletAddress } = req.body;
  if (!fromToken || !toToken || !amount || !walletAddress) {
    return res.status(400).json({ error: 'fromToken, toToken, amount, and walletAddress are required' });
  }

  try {
    const result = await swapTokens(fromToken, toToken, amount, walletAddress);
    res.status(200).json({ result });
  } catch (error) {
    console.error('Error swapping tokens:', error);
    res.status(500).json({ error: 'Failed to swap tokens' });
  }
}