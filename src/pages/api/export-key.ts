import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyExportToken } from '@/lib/jwtExport';
import { getOrCreatePrivyWallet } from '@/lib/privy';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;
  if (typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }
  const data = verifyExportToken(token);
  if (!data) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Optionally, you could fetch wallet info here for extra validation
  // const wallet = await getOrCreatePrivyWallet({ userId: data.userId, phoneNumber: '', chain: 'base-sepolia' });
  // if (!wallet || wallet.address !== data.walletAddress) return res.status(403).json({ error: 'Wallet mismatch' });

  // For now, just return the wallet address for demo:
  return res.status(200).json({ walletAddress: data.walletAddress, userId: data.userId });
}
