import { NextRequest, NextResponse } from 'next/server';
import { getEarningsSummary, getSpendingSummary, formatEarningsForAgent, parseEarningsQuery } from '@/lib/earningsService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, walletAddress } = body;

    // Validate required parameters
    if (!query) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      );
    }

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

    console.log('[API] Processing natural language query:', query);

    // Parse the natural language query
    const parsedFilter = parseEarningsQuery(query);
    
    if (!parsedFilter) {
      return NextResponse.json(
        { error: 'Could not parse the query. Please try rephrasing.' },
        { status: 400 }
      );
    }

    // Set the wallet address from the request
    parsedFilter.walletAddress = walletAddress.toLowerCase();

    // Determine if this is about spending or earnings
    const lowerQuery = query.toLowerCase();
    const isSpendingQuery = lowerQuery.includes('spent') || 
                           lowerQuery.includes('paid') || 
                           lowerQuery.includes('spending') ||
                           lowerQuery.includes('payments made') ||
                           lowerQuery.includes('money sent');

    console.log('[API] Parsed filter:', parsedFilter);
    console.log('[API] Is spending query:', isSpendingQuery);

    // Get the appropriate summary with insights enabled
    const summary = isSpendingQuery 
      ? await getSpendingSummary(parsedFilter)
      : await getEarningsSummary(parsedFilter, true); // Enable insights for better user experience

    // Format for natural language response
    const naturalResponse = formatEarningsForAgent(summary, isSpendingQuery ? 'spending' : 'earnings');

    return NextResponse.json({
      success: true,
      query,
      parsedFilter,
      type: isSpendingQuery ? 'spending' : 'earnings',
      data: summary,
      response: naturalResponse
    });

  } catch (error) {
    console.error('[API] Error in natural language query:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process query',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Example queries for documentation
export async function GET() {
  return NextResponse.json({
    message: 'Natural Language Earnings Query API',
    description: 'Process natural language queries about earnings and spending',
    examples: [
      {
        query: "How much have I earned this week?",
        description: "Get earnings for the last 7 days"
      },
      {
        query: "Show my earnings in USDC on Base",
        description: "Get USDC earnings on Base network"
      },
      {
        query: "How much did I receive last month?",
        description: "Get earnings for the previous month"
      },
      {
        query: "What did I spend on Polygon this year?",
        description: "Get spending on Polygon network this year"
      },
      {
        query: "How much USDT have I earned all time?",
        description: "Get all-time USDT earnings"
      }
    ],
    usage: {
      method: "POST",
      body: {
        query: "Natural language query about earnings or spending",
        walletAddress: "0x... (required)"
      }
    }
  });
}