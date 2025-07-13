import { NextApiRequest, NextApiResponse } from 'next';
import { privyWalletApi, SUPPORTED_CHAINS } from '../../../lib/privyWalletApi';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * API endpoint for switching chains (getting chain information)
 * GET /api/wallet/switch-chain?chain=base-sepolia
 * POST /api/wallet/switch-chain
 * 
 * Query/Body parameters:
 * - chain: string - Chain identifier to switch to
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get chain from query params (GET) or body (POST)
    const chain = req.method === 'GET' ? req.query.chain as string : req.body.chain;

    if (!chain) {
      return res.status(400).json({ 
        error: 'Missing required parameter: chain' 
      });
    }

    console.log(`[API] Getting chain information for: ${chain}`);

    // Validate chain is supported
    const chainConfig = SUPPORTED_CHAINS[chain];
    if (!chainConfig) {
      return res.status(400).json({ 
        error: `Unsupported chain: ${chain}`,
        supportedChains: Object.keys(SUPPORTED_CHAINS)
      });
    }

    console.log(`[API] Chain information retrieved successfully for ${chain}`);

    return res.status(200).json({
      success: true,
      chain: {
        identifier: chain,
        ...chainConfig
      },
      supportedChains: Object.keys(SUPPORTED_CHAINS).map(key => ({
        identifier: key,
        ...SUPPORTED_CHAINS[key]
      }))
    });

  } catch (error) {
    console.error('[API] Failed to get chain information:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      error: 'Failed to get chain information',
      details: errorMessage
    });
  }
}

/**
 * Example GET request:
 * GET /api/wallet/switch-chain?chain=base-sepolia
 * 
 * Example POST request body:
 * {
 *   "chain": "base-sepolia"
 * }
 * 
 * Example response:
 * {
 *   "success": true,
 *   "chain": {
 *     "identifier": "base-sepolia",
 *     "chainId": 84532,
 *     "caip2": "eip155:84532",
 *     "name": "Base Sepolia",
 *     "explorerUrl": "https://sepolia.basescan.org"
 *   },
 *   "supportedChains": [
 *     {
 *       "identifier": "ethereum",
 *       "chainId": 1,
 *       "caip2": "eip155:1",
 *       "name": "Ethereum Mainnet",
 *       "explorerUrl": "https://etherscan.io"
 *     },
 *     ...
 *   ]
 * }
 */