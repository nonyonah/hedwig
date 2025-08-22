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
    config.rpcUrl
  );

  if (req.method === 'GET') {
    try {
      // Get current contract configuration from the smart contract
      const [platformWallet, platformFee, usdcAddress, owner, version] = await Promise.all([
        paymentService.getPlatformWallet(),
        paymentService.getPlatformFee(),
        paymentService.getUSDCAddress(),
        paymentService.getOwner(),
        paymentService.getVersion()
      ]);

      return res.status(200).json({
        currentConfig: {
          platformWallet,
          platformFeeInBasisPoints: platformFee,
          platformFeePercentage: platformFee / 100, // Convert basis points to percentage
          usdcAddress,
          contractAddress: config.contractAddress,
          chainId: config.chainId,
          owner,
          version
        }
      });
    } catch (error: any) {
      console.error('Error fetching wallet config:', error);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  }

  if (req.method === 'POST') {
    // Since the smart contract has immutable values, we only support read operations
    // Admin functions are not available as the contract values are set at deployment
    return res.status(400).json({ 
      error: 'Configuration modification not supported',
      message: 'The HedwigPayment contract has immutable configuration values set at deployment time. Use GET to view current configuration.'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Export configuration for use in other parts of the application
export { getCurrentConfig };