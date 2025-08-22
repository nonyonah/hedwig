import { NextApiRequest, NextApiResponse } from 'next';
import { createPublicClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { makeSerializable } from '../../lib/bigintUtils';

const HEDWIG_PAYMENT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "freelancer",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "invoiceId",
        "type": "string"
      }
    ],
    "name": "pay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientAllowance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Unauthorized",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TokenNotWhitelisted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvoiceAlreadyProcessed",
    "type": "error"
  }
] as const;

const USDC_ABI = [
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

const USDC_CONTRACT_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { contractAddress, amount, freelancer, invoiceId, userAddress } = req.body;

    if (!contractAddress || !amount || !freelancer || !invoiceId || !userAddress) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Create public client for Base Sepolia
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http()
    });

    // Check USDC balance
    const balance = await publicClient.readContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [userAddress as `0x${string}`]
    });

    console.log('User USDC balance:', balance.toString());

    if (balance < BigInt(amount)) {
      return res.status(400).json({
        message: `Insufficient USDC balance. Required: ${amount}, Available: ${balance.toString()}`
      });
    }

    // Check USDC allowance
    const allowance = await publicClient.readContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'allowance',
      args: [userAddress as `0x${string}`, contractAddress as `0x${string}`]
    });

    console.log('User USDC allowance:', allowance.toString());

    // Solution 1: Check if tokens need to be approved first
    if (allowance < BigInt(amount)) {
      return res.status(400).json({
        message: `Insufficient USDC allowance. Please approve ${amount} USDC tokens for the contract first.`,
        error: 'INSUFFICIENT_ALLOWANCE',
        required: amount,
        current: allowance.toString(),
        action: 'APPROVE_TOKENS'
      });
    }

    // Solution 3: Check unit conversion - ensure amount is in correct decimals (USDC has 6 decimals)
    const amountBigInt = BigInt(amount);
    if (amountBigInt <= 0) {
      return res.status(400).json({
        message: 'Invalid amount: must be greater than 0',
        error: 'INVALID_AMOUNT'
      });
    }

    // Check if amount seems to be in wrong units (too small for USDC which has 6 decimals)
    if (amountBigInt < 1000000n) { // Less than 1 USDC (1,000,000 units)
      console.warn('Amount seems very small for USDC:', amountBigInt.toString());
    }

    // Solution 2: Check if contract has sufficient USDC balance (for contracts that hold funds)
    const contractBalance = await publicClient.readContract({
      address: USDC_CONTRACT_ADDRESS,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [contractAddress as `0x${string}`]
    });

    console.log('Contract USDC balance:', contractBalance.toString());
    
    // Note: This check is optional depending on contract design
    // Some contracts transfer directly from user, others require pre-deposit
    if (contractBalance === 0n) {
      console.warn('Contract has no USDC balance - this may be expected for direct transfer contracts');
    }

    // Simulate the contract call
    try {
      const result = await publicClient.simulateContract({
        address: contractAddress as `0x${string}`,
        abi: HEDWIG_PAYMENT_ABI,
        functionName: 'pay',
        args: [USDC_CONTRACT_ADDRESS, BigInt(amount), freelancer as `0x${string}`, invoiceId],
        account: userAddress as `0x${string}`
      });

      console.log('Simulation successful:', result);
      return res.status(200).json({ success: true, result: makeSerializable(result) });
    } catch (simError: any) {
      console.error('Contract simulation failed:', simError);
      
      // Handle specific error signatures
      const errorMessage = simError.message || simError.shortMessage || 'Unknown error';
      const errorData = simError.data || '';
      
      // Check for the problematic 0xe450d38c signature
      if (errorData.includes('0xe450d38c')) {
        return res.status(400).json({
          message: 'Transaction would fail due to insufficient allowance or balance. Please ensure you have approved sufficient USDC tokens and have enough balance.',
          error: 'SIMULATION_FAILED_ALLOWANCE',
          signature: '0xe450d38c',
          solutions: [
            'Approve more USDC tokens for the contract',
            'Check your USDC balance is sufficient',
            'Verify the amount is in correct units (USDC has 6 decimals)'
          ],
          details: makeSerializable(simError)
        });
      }
      
      // Handle other known error patterns
      if (errorMessage.toLowerCase().includes('insufficient')) {
        return res.status(400).json({
          message: 'Insufficient funds or allowance for this transaction',
          error: 'INSUFFICIENT_FUNDS',
          solutions: [
            'Check your USDC balance',
            'Approve sufficient USDC tokens',
            'Verify the payment amount'
          ],
          details: makeSerializable(simError)
        });
      }
      
      return res.status(400).json({
        message: `Contract simulation failed: ${errorMessage}`,
        error: 'SIMULATION_FAILED',
        details: makeSerializable(simError)
      });
    }

  } catch (error: any) {
    console.error('Simulation API error:', error);
    return res.status(500).json({
      message: `Simulation error: ${error.message || 'Unknown error'}`,
      details: makeSerializable(error)
    });
  }
}