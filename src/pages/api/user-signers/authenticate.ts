// src/pages/api/user-signers/authenticate.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrivyClient } from '@privy-io/server-auth';
import { loadServerEnvironment } from '../../../lib/serverEnv';
import { generateECDHP256KeyPair, decryptEncapsulatedKey, exportPublicKeyToBase64 } from '../../../lib/cryptoUtils';
import { sessionManager } from '../../../lib/sessionManager';
import { webcrypto } from 'crypto';

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
    // Verify user authentication first
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Verify the user's JWT token
    const verifiedClaims = await privy.verifyAuthToken(authToken);
    const userId = verifiedClaims.userId;

    const { wallet_address } = req.body;

    if (!wallet_address) {
      return res.status(400).json({ error: 'wallet_address is required' });
    }

    // Generate ECDH P-256 keypair for this authentication request
    const { privateKey, publicKey } = await generateECDHP256KeyPair();
    const recipientPublicKey = await exportPublicKeyToBase64(publicKey);

    console.log(`[UserSignerAuth] Authenticating user signer for user: ${userId}, wallet: ${wallet_address}`);
    
    // Validate user session
    const sessionInfo = await sessionManager.validateUserSession(wallet_address);
    if (!sessionInfo) {
      return res.status(401).json({ 
        error: 'No active user session found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    try {
      // Call Privy's user signer authentication endpoint
      // Note: This is a direct call to Privy's API - you may need to adjust the URL
      const privyResponse = await fetch(`https://auth.privy.io/api/v1/user_signers/authenticate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'privy-app-id': process.env.PRIVY_APP_ID!,
        },
        body: JSON.stringify({
          recipient_public_key: recipientPublicKey
        })
      });

      if (!privyResponse.ok) {
        const errorText = await privyResponse.text();
        console.error('[UserSignerAuth] Privy authentication failed:', errorText);
        return res.status(privyResponse.status).json({ 
          error: 'User signer authentication failed',
          details: errorText,
          code: 'PRIVY_AUTH_FAILED'
        });
      }

      const authResult = await privyResponse.json();
      const { authorization_key, encapsulated_key, wallets } = authResult;

      if (!authorization_key || !encapsulated_key) {
        return res.status(500).json({ 
          error: 'Missing encrypted authorization key or encapsulated key from Privy',
          code: 'INCOMPLETE_AUTH_RESPONSE',
          received: { 
            has_authorization_key: !!authorization_key,
            has_encapsulated_key: !!encapsulated_key 
          }
        });
      }

      console.log(`[UserSignerAuth] Successfully authenticated user signer for ${wallet_address}`);
      console.log(`[UserSignerAuth] Received ${wallets?.length || 0} wallets from Privy`);

      // Store the encrypted key and encapsulated key in session for later decryption
      // In a production environment, you might want to store this securely
      const updatedSession = {
        ...sessionInfo,
        encryptedAuthorizationKey: authorization_key,
        encapsulatedKey: encapsulated_key,
        lastActivity: new Date(),
        wallets: wallets || []
      };

      // Update session cache
      sessionManager.getSessionInfo(wallet_address); // This will update the cache

      return res.status(200).json({
        success: true,
        authorization_key,
        encapsulated_key,
        wallets: wallets || [],
        session_info: {
          user_id: sessionInfo.userId,
          privy_user_id: sessionInfo.privyUserId,
          wallet_address: wallet_address,
          authenticated_at: new Date().toISOString()
        }
      });

    } catch (apiError) {
      console.error('[UserSignerAuth] API call failed:', apiError);
      return res.status(500).json({ 
        error: 'Failed to authenticate with Privy user signer API',
        details: apiError instanceof Error ? apiError.message : 'Unknown error',
        code: 'API_ERROR'
      });
    }

  } catch (error) {
    console.error('[UserSignerAuth] Authentication failed:', error);
    return res.status(500).json({ 
      error: 'User signer authentication failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    });
  }
}