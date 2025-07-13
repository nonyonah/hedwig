import { NextApiRequest, NextApiResponse } from 'next';
import { privyWalletApi } from '../../../lib/privyWalletApi';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * API endpoint for signing messages
 * POST /api/messages/sign
 * 
 * Body parameters:
 * - userId: string - Supabase user ID
 * - message: string - Message to sign (string or hex)
 * - chain?: string - Chain identifier (default: 'base-sepolia')
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, message, chain = 'base-sepolia' } = req.body;

    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    if (!message) {
      return res.status(400).json({ 
        error: 'Missing required parameter: message' 
      });
    }

    console.log(`[API] Signing message for user ${userId}:`, { message });

    // Get user's wallet from database
    const wallet = await privyWalletApi.getUserWallet(userId, chain);
    
    if (!wallet.wallet_id) {
      return res.status(400).json({ 
        error: 'Wallet does not have a Privy wallet ID' 
      });
    }

    // Sign message using Privy
    const result = await privyWalletApi.signMessage(
      wallet.wallet_id,
      message
    );

    console.log(`[API] Message signed successfully`);

    return res.status(200).json({
      success: true,
      signature: result.signature,
      encoding: result.encoding
    });

  } catch (error) {
    console.error('[API] Failed to sign message:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      error: 'Failed to sign message',
      details: errorMessage
    });
  }
}

/**
 * Example request body:
 * {
 *   "userId": "user-123",
 *   "message": "Hello, this is a test message!",
 *   "chain": "base-sepolia"
 * }
 * 
 * Or with hex message:
 * {
 *   "userId": "user-123",
 *   "message": "0x48656c6c6f2c20746869732069732061207465737420686578206d65737361676521",
 *   "chain": "base-sepolia"
 * }
 */