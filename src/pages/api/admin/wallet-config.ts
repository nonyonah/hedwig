import { NextApiRequest, NextApiResponse } from 'next';
import { HedwigPaymentService } from '../../../contracts/HedwigPaymentService';
import { getCurrentConfig, validateWalletConfig, checkRequiredEnvVars } from '../../../contracts/config';

// Admin authentication middleware (implement based on your auth system)
function isAuthorizedAdmin(req: NextApiRequest): boolean {
  const adminKey = req.headers['x-admin-key'] as string;
  return adminKey === process.env.HEDWIG_ADMIN_KEY;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check admin authorization
  if (!isAuthorizedAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const config = getCurrentConfig();
  const paymentService = new HedwigPaymentService(
    config.contractAddress,
    config.rpcUrl,
    process.env.PLATFORM_PRIVATE_KEY
  );

  if (req.method === 'GET') {
    try {
      // Get current contract configuration
      const contractConfig = await paymentService.getContractConfig();
      const envCheck = checkRequiredEnvVars();
      const configValidation = validateWalletConfig(config);

      return res.status(200).json({
        contractConfig,
        environmentCheck: envCheck,
        configValidation,
        currentConfig: {
          platformWallet: config.platformWallet,
          platformFeePercentage: config.platformFeePercentage,
          contractAddress: config.contractAddress,
          chainId: config.chainId
        }
      });
    } catch (error: any) {
      console.error('Error fetching wallet config:', error);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { action, ...params } = req.body;

      switch (action) {
        case 'setPlatformWallet':
          const { walletAddress } = params;
          if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address is required' });
          }

          const txHash = await paymentService.setPlatformWallet(walletAddress);
          return res.status(200).json({ 
            success: true, 
            transactionHash: txHash,
            message: 'Platform wallet updated successfully'
          });

        case 'setPlatformFee':
          const { feeInBasisPoints } = params;
          if (typeof feeInBasisPoints !== 'number') {
            return res.status(400).json({ error: 'Fee in basis points is required' });
          }

          const feeTxHash = await paymentService.setPlatformFee(feeInBasisPoints);
          return res.status(200).json({ 
            success: true, 
            transactionHash: feeTxHash,
            message: 'Platform fee updated successfully'
          });

        case 'whitelistToken':
          const { tokenAddress, status } = params;
          if (!tokenAddress || typeof status !== 'boolean') {
            return res.status(400).json({ error: 'Token address and status are required' });
          }

          const tokenTxHash = await paymentService.whitelistToken(tokenAddress, status);
          return res.status(200).json({ 
            success: true, 
            transactionHash: tokenTxHash,
            message: `Token ${status ? 'whitelisted' : 'removed from whitelist'} successfully`
          });

        case 'batchWhitelistTokens':
          const { tokens } = params;
          if (!Array.isArray(tokens)) {
            return res.status(400).json({ error: 'Tokens array is required' });
          }

          const batchTxHashes = await paymentService.batchWhitelistTokens(tokens);
          return res.status(200).json({ 
            success: true, 
            transactionHashes: batchTxHashes,
            message: 'Batch token whitelist updated successfully'
          });

        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error: any) {
      console.error('Error updating wallet config:', error);
      return res.status(500).json({ 
        error: 'Failed to update configuration',
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Export configuration for use in other parts of the application
export { getCurrentConfig };