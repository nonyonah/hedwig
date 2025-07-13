import { NextApiRequest, NextApiResponse } from 'next';
import { privyWalletApi, EthereumTransaction } from '../../../lib/privyWalletApi';
import { loadServerEnvironment } from '../../../lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * API endpoint for sending Ethereum transactions
 * POST /api/transactions/send
 * 
 * Body parameters:
 * - userId: string - Supabase user ID
 * - transaction: EthereumTransaction - Transaction parameters
 * - chain?: string - Chain identifier (default: 'base-sepolia')
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, transaction, chain = 'base-sepolia' } = req.body;

    // Validate required parameters
    if (!userId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: userId' 
      });
    }

    if (!transaction || !transaction.to) {
      return res.status(400).json({ 
        error: 'Missing required parameter: transaction with to address' 
      });
    }

    console.log(`[API] Sending transaction for user ${userId} on ${chain}:`, transaction);

    // Get user's wallet from database
    const wallet = await privyWalletApi.getUserWallet(userId, chain);
    
    if (!wallet.wallet_id) {
      return res.status(400).json({ 
        error: 'Wallet does not have a Privy wallet ID' 
      });
    }

    // Send transaction using Privy
    const result = await privyWalletApi.sendTransaction(
      wallet.wallet_id,
      transaction as EthereumTransaction,
      chain
    );

    // Get explorer URL
    const explorerUrl = privyWalletApi.getExplorerUrl(chain, result.hash);

    console.log(`[API] Transaction sent successfully: ${result.hash}`);

    return res.status(200).json({
      success: true,
      hash: result.hash,
      explorerUrl,
      caip2: result.caip2,
      transactionId: result.transactionId
    });

  } catch (error) {
    console.error('[API] Failed to send transaction:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return res.status(500).json({
      error: 'Failed to send transaction',
      details: errorMessage
    });
  }
}

/**
 * Example request body:
 * {
 *   "userId": "user-123",
 *   "transaction": {
 *     "to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b",
 *     "value": "1000000000000000000",
 *     "data": "0x"
 *   },
 *   "chain": "base-sepolia"
 * }
 */