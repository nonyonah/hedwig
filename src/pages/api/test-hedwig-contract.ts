import { NextApiRequest, NextApiResponse } from 'next';
import { hedwigProjectContractService } from '../../services/hedwigProjectContractService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { chain = 'base', isTestnet = true } = req.body;

    console.log('[Test Hedwig Contract] Testing with:', { chain, isTestnet });

    // Test project creation with sample data
    const testProject = {
      client: '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc', // Platform wallet as test client
      freelancer: '0x29B30cd52d9e8DdF9ffEaFb598715Db78D3B771d', // Deployer address as test freelancer
      amount: (1000 * Math.pow(10, 6)).toString(), // 1000 USDC in wei (6 decimals)
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      deadline: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
      projectTitle: 'Test Project Contract',
      projectDescription: 'This is a test project to verify Hedwig contract integration'
    };

    const result = await hedwigProjectContractService.createProject(
      testProject,
      chain,
      isTestnet
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Hedwig project contract test successful',
        result: {
          projectId: result.projectId,
          contractAddress: result.contractAddress,
          transactionHash: result.transactionHash
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Hedwig project contract test failed',
        error: result.error
      });
    }

  } catch (error) {
    console.error('[Test Hedwig Contract] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}