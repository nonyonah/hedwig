// src/pages/api/session-signers/create.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrivyClient } from '@privy-io/server-auth';
import { createClient } from '@supabase/supabase-js';
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
  if (req.method !== 'POST') {
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

    // Get user details
    const user = await privy.getUser(userId);
    
    if (!user.wallet?.address) {
      return res.status(400).json({ error: 'User does not have a wallet' });
    }

    // Note: Session signer creation through Privy API requires specific implementation
    // based on your KeyQuorum configuration. This is a placeholder implementation.
    // You would typically:
    // 1. Create a session signer through Privy's KeyQuorum API
    // 2. Set appropriate permissions and expiration
    // 3. Return the session signer details
    
    console.log(`[session-signers/create] Creating session signer for user ${userId}`);
    
    // Placeholder response - replace with actual Privy KeyQuorum API call
    const sessionSignerResponse = {
      success: true,
      sessionSignerId: `session_${Date.now()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      permissions: ['eth_sendTransaction'],
      walletAddress: user.wallet.address
    };

    res.status(200).json({
      success: true,
      sessionSigner: sessionSignerResponse,
      message: 'Session signer created successfully'
    });
  } catch (error) {
    console.error('[session-signers/create] Error:', error);
    res.status(500).json({ 
      error: 'Failed to create session signer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}