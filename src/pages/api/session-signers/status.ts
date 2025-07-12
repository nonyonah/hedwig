// src/pages/api/session-signers/status.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrivyClient } from '@privy-io/server-auth';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Load environment variables for server-side execution
loadServerEnvironment();

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Verify the user's token
    const verifiedClaims = await privy.verifyAuthToken(authToken);
    const userId = verifiedClaims.userId;

    // Check if user has active session signers
    // Note: This is a simplified check. In a real implementation,
    // you would query the Privy API to check actual session signer status
    const user = await privy.getUser(userId);
    
    // For now, we'll assume session signers need to be created/refreshed
    // In a real implementation, you would check the actual session signer status
    const status = 'expired'; // This should be determined by actual Privy API calls

    res.status(200).json({ 
      status,
      userId,
      message: 'Session signer status checked'
    });
  } catch (error) {
    console.error('[session-signers/status] Error:', error);
    res.status(500).json({ 
      error: 'Failed to check session signer status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}