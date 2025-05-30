import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchWalletBalance } from '../../lib/wallet';
import { ethers } from 'ethers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { address, chain } = req.query;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Address is required' });
  }

  const RPC_URLS: Record<string, string> = {
    base: process.env.BASE_RPC_URL || '',
  };
  const rpcUrl = RPC_URLS[(chain as string) || 'ethereum'];
  if (!rpcUrl) {
    return res.status(400).json({ error: 'Unsupported chain' });
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const balance = await fetchWalletBalance(address, provider);
    res.status(200).json({ balance });
  } catch {
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
}