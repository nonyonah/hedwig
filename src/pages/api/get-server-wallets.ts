import { NextApiRequest, NextApiResponse } from 'next';
import { PrivyClient } from '@privy-io/server-auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Privy client with app credentials
    const privy = new PrivyClient(
      process.env.PRIVY_APP_ID!,
      process.env.PRIVY_APP_SECRET!
    );

    // Get user ID from query parameter
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userId' });
    }

    // Fetch user data from Privy
    const user = await privy.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Extract wallet information
    const wallets = user.linkedAccounts
      .filter(
        (account) =>
          account.type === 'wallet' &&
          account.walletClientType === 'privy' &&
          account.chainType === 'ethereum'
      )
      .map((wallet) => ({
        id: wallet.id,
        address: wallet.address?.toLowerCase(),
        type: 'Embedded Wallet'
      }));

    // Return the wallet information
    res.status(200).json({ wallets });

  } catch (error) {
    console.error('Error fetching server wallets:', error);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
}