import { NextRequest, NextResponse } from 'next/server';
import { getPaymentStats, getRecentPayments } from '@/lib/paymentTracker';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    const includeRecent = searchParams.get('includeRecent') === 'true';
    const recentLimit = parseInt(searchParams.get('recentLimit') || '10');

    // Validate required parameters
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress query parameter is required' },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    console.log('[API] Getting payment stats for wallet:', walletAddress);

    // Get payment statistics
    const stats = await getPaymentStats(walletAddress);

    let recentPayments = null;
    if (includeRecent) {
      recentPayments = await getRecentPayments(walletAddress, recentLimit);
    }

    return NextResponse.json({
      success: true,
      walletAddress,
      stats,
      ...(recentPayments && { recentPayments })
    });

  } catch (error) {
    console.error('[API] Error fetching payment stats:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch payment statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}