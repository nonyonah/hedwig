import { NextApiRequest, NextApiResponse } from 'next';
import { createPublicClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { makeSerializable } from '../../lib/bigintUtils';

const HEDWIG_PAYMENT_ABI = [
  {
    "inputs": [
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

    if (allowance < BigInt(amount)) {
      return res.status(400).json({
        message: `Insufficient USDC allowance. Required: ${amount}, Approved: ${allowance.toString()}`
      });
    }

    // Simulate the contract call
    try {
      const result = await publicClient.simulateContract({
        address: contractAddress as `0x${string}`,
        abi: HEDWIG_PAYMENT_ABI,
        functionName: 'pay',
        args: [BigInt(amount), freelancer as `0x${string}`, invoiceId],
        account: userAddress as `0x${string}`
      });

      console.log('Simulation successful:', result);
      return res.status(200).json({ success: true, result: makeSerializable(result) });
    } catch (simError: any) {
      console.error('Contract simulation failed:', simError);
      return res.status(400).json({
        message: `Contract simulation failed: ${simError.message || simError.shortMessage || 'Unknown error'}`,
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