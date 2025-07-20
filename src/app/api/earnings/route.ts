import { NextRequest, NextResponse } from 'next/server';
import { getEarningsSummary, getSpendingSummary, formatEarningsForAgent, parseEarningsQuery, EarningsFilter } from '@/lib/earningsService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, token, network, timeframe, startDate, endDate, type = 'earnings', format = 'json' } = body;

    // Validate required parameters
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
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

    // Validate timeframe if provided
    const validTimeframes = ['last7days', 'lastMonth', 'last3months', 'lastYear', 'allTime'];
    if (timeframe && !validTimeframes.includes(timeframe)) {
      return NextResponse.json(
        { error: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate type
    if (type && !['earnings', 'spending'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "earnings" or "spending"' },
        { status: 400 }
      );
    }

    // Build filter object
    const filter: EarningsFilter = {
      walletAddress: walletAddress.toLowerCase(),
      token: token?.toUpperCase(),
      network: network,
      timeframe: timeframe || 'allTime',
      startDate,
      endDate
    };

    console.log('[API] Getting earnings summary with filter:', filter);

    // Get the appropriate summary
    const summary = type === 'spending' 
      ? await getSpendingSummary(filter)
      : await getEarningsSummary(filter);

    // Return formatted response based on format preference
    if (format === 'natural') {
      const naturalResponse = formatEarningsForAgent(summary, type);
      return NextResponse.json({
        success: true,
        data: summary,
        naturalLanguage: naturalResponse
      });
    }

    return NextResponse.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('[API] Error in earnings summary:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch earnings summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const walletAddress = searchParams.get('walletAddress');
    const token = searchParams.get('token');
    const network = searchParams.get('network');
    const timeframe = searchParams.get('timeframe');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type') || 'earnings';
    const format = searchParams.get('format') || 'json';

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

    // Validate timeframe if provided
    const validTimeframes = ['last7days', 'lastMonth', 'last3months', 'lastYear', 'allTime'];
    if (timeframe && !validTimeframes.includes(timeframe)) {
      return NextResponse.json(
        { error: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate type
    if (type && !['earnings', 'spending'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "earnings" or "spending"' },
        { status: 400 }
      );
    }

    // Build filter object
    const filter: EarningsFilter = {
      walletAddress: walletAddress.toLowerCase(),
      token: token?.toUpperCase() || undefined,
      network: network || undefined,
      timeframe: (timeframe as EarningsFilter['timeframe']) || 'allTime',
      startDate: startDate || undefined,
      endDate: endDate || undefined
    };

    console.log('[API] Getting earnings summary with filter:', filter);

    // Get the appropriate summary
    const summary = type === 'spending' 
      ? await getSpendingSummary(filter)
      : await getEarningsSummary(filter);

    // Return formatted response based on format preference
    if (format === 'natural') {
      const naturalResponse = formatEarningsForAgent(summary, type as 'earnings' | 'spending');
      return NextResponse.json({
        success: true,
        data: summary,
        naturalLanguage: naturalResponse
      });
    }

    return NextResponse.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('[API] Error in earnings summary:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch earnings summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}