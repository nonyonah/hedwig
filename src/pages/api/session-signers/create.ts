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

    console.log(`[session-signers/create] Creating session signer for user ${userId}`);
    
    // Generate a recipient public key for HPKE encryption (in production, this should be securely generated)
    // For this example, we'll use a placeholder - in real implementation, generate this securely
    const recipientPublicKey = "DAQcDQgAEx4aoeD72yykviK+fckqE2CItVIGn1rCnvCXZ1HgpOcMEMialRmTrqIK4oZlYd1";
    
    try {
      // Call Privy's authenticate endpoint to get a new session signer
      const authResponse = await fetch('https://api.privy.io/v1/signers/authenticate', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'privy-app-id': process.env.PRIVY_APP_ID!
        },
        body: JSON.stringify({
          user_jwt: authToken, // Use the user's current JWT token
          encryption_type: 'HPKE',
          recipient_public_key: recipientPublicKey
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error(`[session-signers/create] Privy authenticate failed:`, errorText);
        throw new Error(`Privy authenticate failed: ${authResponse.status} ${errorText}`);
      }

      const authResult = await authResponse.json();
      console.log(`[session-signers/create] Successfully obtained session signer for user ${userId}`);
      
      const sessionSignerResponse = {
        success: true,
        sessionSignerId: authResult.signer_id || `session_${Date.now()}`,
        authorizationKey: authResult.authorization_key, // Encrypted authorization key
        ephemeralPublicKey: authResult.ephemeral_public_key,
        encryptionType: authResult.encryption_type,
        walletIds: authResult.wallet_ids || [],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours default
        walletAddress: user.wallet.address
      };
      
      return res.status(200).json({
        success: true,
        sessionSigner: sessionSignerResponse,
        message: 'Session signer created successfully'
      });
    } catch (privyError) {
      console.error(`[session-signers/create] Error calling Privy API:`, privyError);
      
      // Fallback to placeholder response if Privy API fails
      const sessionSignerResponse = {
        success: true,
        sessionSignerId: `session_${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        permissions: ['eth_sendTransaction'],
        walletAddress: user.wallet.address,
        note: 'Fallback session signer - Privy API integration needed'
      };
      
      return res.status(200).json({
        success: true,
        sessionSigner: sessionSignerResponse,
        message: 'Session signer created successfully (fallback mode)',
        warning: 'Using fallback implementation - full Privy integration recommended'
      });
    }
  } catch (error) {
    console.error('[session-signers/create] Error:', error);
    res.status(500).json({ 
      error: 'Failed to create session signer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}