import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    // For now, return mock data
    // In a real implementation, you would fetch data from Alchemy or another provider
    const mockData = {
      nativeBalance: {
        value: 1.5,
        usdValue: 3000
      },
      tokenBalances: [
        {
          symbol: 'USDC',
          name: 'USD Coin',
          logo: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
          balance: 1000,
          usdValue: 1000,
          chain: 'ethereum'
        },
        {
          symbol: 'USDT',
          name: 'Tether',
          logo: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
          balance: 500,
          usdValue: 500,
          chain: 'base'
        },
        {
          symbol: 'DAI',
          name: 'Dai',
          logo: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png',
          balance: 250,
          usdValue: 250,
          chain: 'optimism'
        }
      ],
      nftCount: 3,
      totalValueUsd: 4750,
      chainAllocation: [
        {
          chain: 'ethereum',
          name: 'Ethereum',
          value: 63,
          fill: '#a9a9a9'
        },
        {
          chain: 'base',
          name: 'Base',
          value: 21,
          fill: '#403d39'
        },
        {
          chain: 'optimism',
          name: 'Optimism',
          value: 16,
          fill: '#6b6b6b'
        }
      ]
    };

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    return NextResponse.json({ error: 'Failed to fetch wallet data' }, { status: 500 });
  }
}