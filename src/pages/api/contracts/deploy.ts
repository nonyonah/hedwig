import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { smartContractDeploymentService } from '../../../services/smartContractDeploymentService';
import { verifyApiKey } from '../../../utils/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify API key or admin access
    const authResult = await verifyApiKey(req);
    if (!authResult.success) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, chain, ...params } = req.body;

    if (!type || !chain) {
      return res.status(400).json({ 
        error: 'Missing required fields: type and chain' 
      });
    }

    let result;

    switch (type) {
      case 'factory':
        result = await smartContractDeploymentService.deployProjectContractFactory({
          chain,
          platformWallet: process.env.PLATFORM_WALLET || '0x742d35Cc6634C0532925a3b8D4C9db96C4b5Da5e',
          platformFeeRate: 250, // 2.5%
          privateKey: process.env.DEPLOYER_PRIVATE_KEY
        });
        break;
      
      case 'project':
        if (!params.client || !params.freelancer || !params.totalAmount) {
          return res.status(400).json({ 
            error: 'Missing required fields for project contract: client, freelancer, totalAmount' 
          });
        }
        
        // Get factory address for the chain
        const factoryAddress = await smartContractDeploymentService.getFactoryAddress(chain);
        if (!factoryAddress) {
          return res.status(400).json({ 
            error: `No factory contract deployed on ${chain}. Deploy factory first.` 
          });
        }
        
        const projectResult = await smartContractDeploymentService.deployProjectContract(
          factoryAddress,
          params,
          {
            chain,
            platformWallet: process.env.PLATFORM_WALLET || '0x742d35Cc6634C0532925a3b8D4C9db96C4b5Da5e',
            privateKey: process.env.DEPLOYER_PRIVATE_KEY
          }
        );
        
        result = {
          contractAddress: `${factoryAddress}:${projectResult.contractId}`,
          transactionHash: projectResult.transactionHash,
          blockNumber: 0,
          gasUsed: '0',
          deploymentCost: '0',
          networkName: chain,
          chainId: 0
        };
        break;
      
      default:
        return res.status(400).json({ 
          error: 'Invalid contract type. Supported types: factory, project' 
        });
    }

    // Log deployment to database
    const { data: deployment, error: dbError } = await supabase
      .from('contract_deployments')
      .insert({
        contract_address: result.contractAddress,
        chain,
        contract_type: type,
        deployment_tx_hash: result.transactionHash,
        status: 'deployed',
        deployed_at: new Date().toISOString(),
        platform_wallet: process.env.PLATFORM_WALLET || '0x742d35Cc6634C0532925a3b8D4C9db96C4b5Da5e',
        platform_fee_rate: 250
      })
      .select()
      .single();

    if (dbError) {
      console.error('Failed to log deployment:', dbError);
      // Don't fail the request, just log the error
    }

    res.status(200).json({
      success: true,
      deployment: {
        id: deployment?.id,
        contractAddress: result.contractAddress,
        txHash: result.transactionHash,
        chain,
        type,
        status: 'deployed',
        deployedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Contract deployment error:', error);
    
    // Log failed deployment if we have enough info
    if (req.body.chain && req.body.type) {
      await supabase
        .from('contract_deployments')
        .insert({
          contract_address: '',
          chain: req.body.chain,
          contract_type: req.body.type,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    res.status(500).json({ 
      error: 'Contract deployment failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}