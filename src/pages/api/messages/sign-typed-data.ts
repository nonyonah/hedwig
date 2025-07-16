import { NextApiRequest, NextApiResponse } from 'next';
import { privyWalletApi } from '../../../lib/privyWalletApi';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * API endpoint for signing typed data (EIP-712)
 * POST /api/messages/sign-typed-data
 * 
 * Body parameters:
 * - userId: string - Supabase user ID
 * - typedData: object - EIP-712 typed data object
 * - chain?: string - Chain identifier (default: 'base-sepolia')
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, typedData, chain = 'base-sepolia' } = req.body;

    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    if (!typedData) {
      return res.status(400).json({ 
        error: 'Missing required parameter: typedData' 
      });
    }

    // Validate EIP-712 structure
    if (!typedData.domain || !typedData.types || !typedData.message) {
      return res.status(400).json({ 
        error: 'Invalid typedData: must contain domain, types, and message' 
      });
    }

    console.log(`[API] Signing typed data for user ${userId}:`, { typedData });

    // Get user's wallet from database
    const wallet = await privyWalletApi.getUserWallet(userId, chain);
    
    if (!wallet.cdp_wallet_id) {
      return res.status(400).json({ error: 'Wallet does not have a Privy wallet ID' });
    }

    // Sign the typed data using Privy Wallet API
    // Sign the typed data using Privy Wallet API
    const result = await privyWalletApi.signTypedData(
      wallet.cdp_wallet_id,
      typedData
    );

    console.log(`[API] Typed data signed successfully`);

    return res.status(200).json({
      success: true,
      signature: result.signature,
      encoding: result.encoding
    });

  } catch (error) {
    console.error('[API] Failed to sign typed data:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      error: 'Failed to sign typed data',
      details: errorMessage
    });
  }
}

/**
 * Example request body:
 * {
 *   "userId": "user-123",
 *   "typedData": {
 *     "domain": {
 *       "name": "MyDApp",
 *       "version": "1",
 *       "chainId": 84532,
 *       "verifyingContract": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b"
 *     },
 *     "types": {
 *       "EIP712Domain": [
 *         { "name": "name", "type": "string" },
 *         { "name": "version", "type": "string" },
 *         { "name": "chainId", "type": "uint256" },
 *         { "name": "verifyingContract", "type": "address" }
 *       ],
 *       "Message": [
 *         { "name": "content", "type": "string" },
 *         { "name": "timestamp", "type": "uint256" }
 *       ]
 *     },
 *     "message": {
 *       "content": "Hello, this is a typed message!",
 *       "timestamp": 1640995200
 *     }
 *   },
 *   "chain": "base-sepolia"
 * }
 */