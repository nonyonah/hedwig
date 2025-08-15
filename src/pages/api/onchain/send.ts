import type { NextApiRequest, NextApiResponse } from 'next';
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ENV
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY; // fallback to PRIVATE_KEY if provided as per snippet

// Token map (extend as needed)
const TOKENS: Record<string, { address: `0x${string}`; decimals: number }> = {
  // USDC on Base (native) - 6 decimals
  // Ref: https://www.circle.com/en/usdc-multichain/base
  USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { token = 'USDC', amount, receiveAddress } = req.body as {
      token?: 'USDC';
      amount: string; // human amount, e.g. "25.5"
      receiveAddress: `0x${string}`;
    };

    if (!TREASURY_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Missing TREASURY_PRIVATE_KEY in environment' });
    }
    if (!amount || !receiveAddress) {
      return res.status(400).json({ error: 'Missing amount or receiveAddress' });
    }
    const tokenCfg = TOKENS[token];
    if (!tokenCfg) {
      return res.status(400).json({ error: `Unsupported token: ${token}` });
    }

    // viem clients
    const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
    const account = privateKeyToAccount(TREASURY_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });

    const erc20TransferAbi = [{
      name: 'transfer',
      type: 'function',
      inputs: [ { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' } ],
      outputs: [ { name: '', type: 'bool' } ],
      stateMutability: 'nonpayable'
    }] as const;

    // Simulate and send
    const value = parseUnits(amount, tokenCfg.decimals);
    const { request } = await publicClient.simulateContract({
      address: tokenCfg.address,
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: [receiveAddress, value],
      account,
    });
    const hash = await walletClient.writeContract(request);

    return res.status(200).json({ success: true, txHash: hash });
  } catch (e: any) {
    console.error('[api/onchain/send] Error:', e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || 'Failed to send tokens' });
  }
}
