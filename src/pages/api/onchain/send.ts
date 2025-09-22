import type { NextApiRequest, NextApiResponse } from 'next';
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { base, polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ENV
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY; // fallback to PRIVATE_KEY if provided as per snippet

// Chain configurations
const CHAIN_CONFIGS = {
  base: { chain: base, rpcUrl: BASE_RPC_URL },
  polygon: { chain: polygon, rpcUrl: POLYGON_RPC_URL },
};

// Token map with multi-chain support
const TOKENS: Record<string, Record<string, { address: `0x${string}`; decimals: number }>> = {
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    USDT: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 6 },
    cNGN: { address: '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F', decimals: 18 },
    ETH: { address: '0x0000000000000000000000000000000000000000', decimals: 18 }, // Native ETH
  },
  polygon: {
    USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    USDT: { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 },
    cNGN: { address: '0x52828daa48C1a9A06F37500882b42daf0bE04C3B', decimals: 18 },
    MATIC: { address: '0x0000000000000000000000000000000000000000', decimals: 18 }, // Native MATIC
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { token = 'USDC', amount, receiveAddress, chain = 'base' } = req.body as {
      token?: 'USDC' | 'USDT' | 'cNGN' | 'ETH' | 'MATIC';
      amount: string; // human amount, e.g. "25.5"
      receiveAddress: `0x${string}`;
      chain?: 'base' | 'polygon';
    };

    if (!TREASURY_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Missing TREASURY_PRIVATE_KEY in environment' });
    }
    if (!amount || !receiveAddress) {
      return res.status(400).json({ error: 'Missing amount or receiveAddress' });
    }
    
    const chainConfig = CHAIN_CONFIGS[chain];
    if (!chainConfig) {
      return res.status(400).json({ error: `Unsupported chain: ${chain}` });
    }
    
    const tokenCfg = TOKENS[chain]?.[token];
    if (!tokenCfg) {
      return res.status(400).json({ error: `Unsupported token: ${token} on chain: ${chain}` });
    }

    // viem clients for the specified chain
    const publicClient = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });
    const account = privateKeyToAccount(TREASURY_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

    const erc20TransferAbi = [{
      name: 'transfer',
      type: 'function',
      inputs: [ { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' } ],
      outputs: [ { name: '', type: 'bool' } ],
      stateMutability: 'nonpayable'
    }] as const;

    // Simulate and send
    const value = parseUnits(String(amount), tokenCfg.decimals);
    
    // Check if it's a native token (address is zero)
    const isNativeToken = tokenCfg.address === '0x0000000000000000000000000000000000000000';
    
    let hash: string;
    
    if (isNativeToken) {
      // Send native token (ETH, MATIC, BNB)
      hash = await walletClient.sendTransaction({
        to: receiveAddress,
        value,
      });
    } else {
      // Send ERC20 token
      const { request } = await publicClient.simulateContract({
        address: tokenCfg.address,
        abi: erc20TransferAbi,
        functionName: 'transfer',
        args: [receiveAddress, value],
        account,
      });
      hash = await walletClient.writeContract(request);
    }

    return res.status(200).json({ success: true, txHash: hash });
  } catch (e: any) {
    console.error('[api/onchain/send] Error:', e);
    return res.status(500).json({ error: e?.shortMessage || e?.message || 'Failed to send tokens' });
  }
}
