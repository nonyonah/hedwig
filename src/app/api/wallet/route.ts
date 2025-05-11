import { NextRequest, NextResponse } from 'next/server';
import { getTokenBalances, getNFTs, getTokenPrices, formatWalletData } from '@/lib/alchemy';

// Define the token interface based on your Alchemy data structure
interface TokenData {
  contractAddress: string;
  tokenBalance: string;
  metadata: any;
  chain?: string;
}

// Define the chain data interface
interface ChainData {
  chain: string;
  chainId: number;
  nativeBalance: any;
  tokens: TokenData[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }
  
  try {
    // Fetch token balances
    const tokenData = await getTokenBalances(address);
    
    // Fetch NFTs
    const nftData = await getNFTs(address);
    
    // Get list of tokens to fetch prices for
    const tokensForPrices = tokenData.flatMap((chainData: ChainData) => 
      chainData.tokens.map((token: TokenData) => ({
        contractAddress: token.contractAddress,
        chain: chainData.chain,
      }))
    );
    
    // Fetch token prices
    const prices = await getTokenPrices(tokensForPrices);
    
    // Format data for dashboard
    const formattedData = formatWalletData(tokenData, nftData, prices);
    
    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    return NextResponse.json({ error: 'Failed to fetch wallet data' }, { status: 500 });
  }
}