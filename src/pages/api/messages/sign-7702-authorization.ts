import { NextApiRequest, NextApiResponse } from 'next';
import { privyWalletApi } from '../../../lib/privyWalletApi';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * API endpoint for signing EIP-7702 authorizations
 * POST /api/messages/sign-7702-authorization
 * 
 * Body parameters:
 * - userId: string - Supabase user ID
 * - authorization: object - EIP-7702 authorization object
 * - chain?: string - Chain identifier (default: 'base-sepolia')
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, authorization, chain = 'base-sepolia' } = req.body;

    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    if (!authorization) {
      return res.status(400).json({ 
        error: 'Missing required parameter: authorization' 
      });
    }

    // Validate EIP-7702 authorization structure
    if (!authorization.chainId || !authorization.address || !authorization.nonce) {
      return res.status(400).json({ 
        error: 'Invalid authorization: must contain chainId, address, and nonce' 
      });
    }

    console.log(`[API] Signing EIP-7702 authorization for user ${userId}:`, { authorization });

    // Get user's wallet from database
    const wallet = await privyWalletApi.getUserWallet(userId, chain);
    
    if (!wallet.privy_wallet_id) {
    return res.status(400).json({ error: 'Wallet does not have a Privy wallet ID' });
  }

  try {
    // Sign the EIP-7702 authorization using Privy Wallet API
    const result = await privyWalletApi.sign7702Authorization(
      wallet.privy_wallet_id,
      authorization
    );

    console.log(`[API] EIP-7702 authorization signed successfully`);

    return res.status(200).json({
      success: true,
      signature: result.signature,
      encoding: result.encoding
    });

  } catch (error) {
    console.error('[API] Failed to sign EIP-7702 authorization:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      error: 'Failed to sign EIP-7702 authorization',
      details: errorMessage
    });
  }
}

/**
 * Example request body:
 * {
 *   "userId": "user-123",
 *   "authorization": {
 *     "chainId": 84532,
 *     "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b",
 *     "nonce": 0
 *   },
 *   "chain": "base-sepolia"
 * }
 */