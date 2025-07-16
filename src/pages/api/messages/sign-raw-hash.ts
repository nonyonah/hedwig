import { NextApiRequest, NextApiResponse } from 'next';
import { privyWalletApi } from '../../../lib/privyWalletApi';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * API endpoint for signing raw hashes
 * POST /api/messages/sign-raw-hash
 * 
 * Body parameters:
 * - userId: string - Supabase user ID
 * - hash: string - Raw hash to sign (32-byte hex string)
 * - chain?: string - Chain identifier (default: 'base-sepolia')
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, hash, chain = 'base-sepolia' } = req.body;

    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    if (!hash) {
      return res.status(400).json({ 
        error: 'Missing required parameter: hash' 
      });
    }

    // Validate hash format (should be 32-byte hex string)
    if (typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      return res.status(400).json({ 
        error: 'Invalid hash format: must be a 32-byte hex string (0x + 64 hex characters)' 
      });
    }

    console.log(`[API] Signing raw hash for user ${userId}:`, { hash });

    // Get user's wallet from database
    const wallet = await privyWalletApi.getUserWallet(userId, chain);
    
    if (!wallet.cdp_wallet_id) {
      return res.status(400).json({ error: 'Wallet does not have a Privy wallet ID' });
    }

    // Sign the raw hash using Privy Wallet API
    // Sign the raw hash using Privy Wallet API
    const result = await privyWalletApi.signRawHash(
      wallet.cdp_wallet_id,
      hash
    );

    console.log(`[API] Raw hash signed successfully`);

    return res.status(200).json({
      success: true,
      signature: result.signature,
      encoding: result.encoding
    });

  } catch (error) {
    console.error('[API] Failed to sign raw hash:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      error: 'Failed to sign raw hash',
      details: errorMessage
    });
  }
}

/**
 * Example request body:
 * {
 *   "userId": "user-123",
 *   "hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
 *   "chain": "base-sepolia"
 * }
 */