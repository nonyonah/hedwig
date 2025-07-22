import { NextRequest, NextResponse } from 'next/server';
import { getTransactionHistory, TransactionHistoryFilter } from '@/lib/transactionHistoryService';

/**
 * API route for fetching transaction history directly from blockchain explorers
 * @route POST /api/transactions/history
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, network, startDate, endDate, direction, tokenAddress } = body;

    // Validate required parameters
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    if (!network) {
      return NextResponse.json(
        { error: 'Network is required' },
        { status: 400 }
      );
    }

    // Create filter for transaction history
    const filter: TransactionHistoryFilter = {
      address: walletAddress,
      network,
      startDate,
      endDate,
      direction: direction || 'both',
      tokenAddress
    };

    // Fetch transaction history
    const transactions = await getTransactionHistory(filter);

    return NextResponse.json({
      walletAddress,
      network,
      transactions,
      count: transactions.length,
      period: {
        startDate: startDate || 'all time',
        endDate: endDate || 'present'
      }
    });
  } catch (error: any) {
    console.error('[API] Error fetching transaction history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch transaction history' },
      { status: 500 }
    );
  }
}

/**
 * API route for getting information about the transaction history endpoint
 * @route GET /api/transactions/history
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/transactions/history',
    description: 'Fetch transaction history directly from blockchain explorers',
    method: 'POST',
    parameters: {
      walletAddress: 'Required. The wallet address to fetch transactions for',
      network: 'Required. The blockchain network (e.g., ethereum-mainnet, base-mainnet, solana-mainnet)',
      startDate: 'Optional. ISO date string for the start date',
      endDate: 'Optional. ISO date string for the end date',
      direction: 'Optional. Transaction direction: incoming, outgoing, or both (default: both)',
      tokenAddress: 'Optional. Filter by specific token address'
    },
    supportedNetworks: [
      'ethereum-mainnet',
      'ethereum-sepolia',
      'base-mainnet',
      'base-sepolia',
      'solana-mainnet',
      'solana-devnet',
      'polygon',
      'arbitrum',
      'optimism'
    ],
    examples: [
      {
        description: 'Fetch all transactions for a wallet on Ethereum mainnet',
        request: {
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          network: 'ethereum-mainnet'
        }
      },
      {
        description: 'Fetch incoming transactions for a wallet on Base mainnet in the last month',
        request: {
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          network: 'base-mainnet',
          direction: 'incoming',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        description: 'Fetch transactions for a specific token on Solana mainnet',
        request: {
          walletAddress: 'SoLANaWaLLetAddReSS123456789abcdefghijklmnopq',
          network: 'solana-mainnet',
          tokenAddress: 'SoLTokenAddReSS123456789abcdefghijklmnopqrstuvwxyz'
        }
      }
    ]
  });
}