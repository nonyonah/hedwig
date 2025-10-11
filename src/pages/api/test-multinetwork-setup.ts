import { NextApiRequest, NextApiResponse } from 'next';
import { multiNetworkPaymentService } from '../../services/MultiNetworkPaymentService';

/**
 * Test endpoint to verify multi-network payment setup
 * GET /api/test-multinetwork-setup
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Testing multi-network payment setup...');

    // Get service status
    const status = multiNetworkPaymentService.getStatus();
    
    // Test network configurations
    const networkTests = {
      base: {
        config: multiNetworkPaymentService.getNetworkConfig('base'),
        service: multiNetworkPaymentService.getPaymentService('base'),
        tokens: {
          USDC: multiNetworkPaymentService.getTokenAddress('base', 'USDC'),
          USDT: multiNetworkPaymentService.getTokenAddress('base', 'USDT'),
          USDbC: multiNetworkPaymentService.getTokenAddress('base', 'USDbC')
        }
      },
      celo: {
        config: multiNetworkPaymentService.getNetworkConfig('celo'),
        service: multiNetworkPaymentService.getPaymentService('celo'),
        tokens: {
          cUSD: multiNetworkPaymentService.getTokenAddress('celo', 'cUSD'),
          USDC: multiNetworkPaymentService.getTokenAddress('celo', 'USDC'),
          USDT: multiNetworkPaymentService.getTokenAddress('celo', 'USDT'),
          CELO: multiNetworkPaymentService.getTokenAddress('celo', 'CELO')
        }
      }
    };

    // Test network detection
    const networkDetectionTests = {
      baseFromChainId: multiNetworkPaymentService.getNetworkFromChainId(8453),
      celoFromChainId: multiNetworkPaymentService.getNetworkFromChainId(42220),
      unknownChainId: multiNetworkPaymentService.getNetworkFromChainId(1), // Ethereum
    };

    // Test token support validation
    const tokenSupportTests = {
      baseUSDC: multiNetworkPaymentService.isTokenSupported('base', 'USDC'),
      celoUSDC: multiNetworkPaymentService.isTokenSupported('celo', 'USDC'),
      baseCUSD: multiNetworkPaymentService.isTokenSupported('base', 'cUSD'), // Should be false
      celoETH: multiNetworkPaymentService.isTokenSupported('celo', 'ETH'), // Should be false
    };

    // Environment variable checks
    const envChecks = {
      baseContract: !!process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE || !!process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS,
      celoContract: !!process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO,
      baseRpc: !!process.env.BASE_RPC_URL,
      celoRpc: !!process.env.CELO_RPC_URL,
      basePlatformWallet: !!process.env.HEDWIG_PLATFORM_WALLET_BASE || !!process.env.HEDWIG_PLATFORM_WALLET_MAINNET,
      celoPlatformWallet: !!process.env.HEDWIG_PLATFORM_WALLET_CELO,
    };

    // Contract connectivity tests (if services are available)
    const contractTests: any = {};
    
    for (const [network, test] of Object.entries(networkTests)) {
      if (test.service) {
        try {
          // Test basic contract calls
          const contractAddress = test.service.getContractAddress();
          contractTests[network] = {
            contractAddress,
            canConnect: true,
            // Note: We don't test actual contract calls here to avoid requiring network access
            // In a real test, you might want to call test.service.getVersion() or similar
          };
        } catch (error) {
          contractTests[network] = {
            canConnect: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      } else {
        contractTests[network] = {
          canConnect: false,
          error: 'Service not initialized'
        };
      }
    }

    const testResults = {
      timestamp: new Date().toISOString(),
      status: 'success',
      serviceStatus: status,
      networkConfigurations: networkTests,
      networkDetection: networkDetectionTests,
      tokenSupport: tokenSupportTests,
      environmentVariables: envChecks,
      contractConnectivity: contractTests,
      summary: {
        networksConfigured: Object.keys(status.networks).length,
        networksActive: Object.values(status.networks).filter((n: any) => n.isInitialized).length,
        allEnvironmentVariablesSet: Object.values(envChecks).every(Boolean),
        criticalIssues: []
      }
    };

    // Check for critical issues
    if (!envChecks.baseContract) {
      testResults.summary.criticalIssues.push('Base contract address not configured');
    }
    if (!envChecks.baseRpc) {
      testResults.summary.criticalIssues.push('Base RPC URL not configured');
    }
    if (envChecks.celoContract && !envChecks.celoRpc) {
      testResults.summary.criticalIssues.push('Celo contract configured but RPC URL missing');
    }

    // Log results
    console.log('✅ Multi-network setup test completed');
    console.log('📊 Networks configured:', testResults.summary.networksConfigured);
    console.log('🟢 Networks active:', testResults.summary.networksActive);
    
    if (testResults.summary.criticalIssues.length > 0) {
      console.warn('⚠️ Critical issues found:', testResults.summary.criticalIssues);
    }

    return res.status(200).json(testResults);

  } catch (error) {
    console.error('❌ Multi-network setup test failed:', error);
    
    return res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to test multi-network payment setup'
    });
  }
}

/**
 * Test helper function to validate network configuration
 */
export function validateNetworkSetup() {
  const requiredEnvVars = [
    'HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE',
    'BASE_RPC_URL',
    'HEDWIG_PLATFORM_WALLET_BASE'
  ];

  const optionalEnvVars = [
    'HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO',
    'CELO_RPC_URL',
    'HEDWIG_PLATFORM_WALLET_CELO'
  ];

  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  const optional = optionalEnvVars.filter(varName => !process.env[varName]);

  return {
    isValid: missing.length === 0,
    missingRequired: missing,
    missingOptional: optional,
    recommendations: [
      ...(missing.length > 0 ? [`Set required environment variables: ${missing.join(', ')}`] : []),
      ...(optional.length > 0 ? [`Consider setting optional variables for full multi-network support: ${optional.join(', ')}`] : [])
    ]
  };
}