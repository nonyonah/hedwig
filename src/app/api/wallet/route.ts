import { NextRequest, NextResponse } from 'next/server';
// Removed TokenMetadataResponse from this import
import { Network, Alchemy, AssetTransfersCategory } from 'alchemy-sdk';

import { supportedChains } from '@/lib/alchemy';

// Define an interface for the resolved chain data
// Update the ChainData interface to match your actual return type from chainDataPromises
interface ChainData {
  chain: string;
  chainId: number;
  nativeBalance?: { 
    value: number; 
    symbol: string;
    usdValue?: number 
  };
  tokenBalances: Array<{ 
    contractAddress: string; 
    tokenBalance?: string | null; 
    symbol?: string; 
    logo?: string; 
    decimals?: number; 
    name?: string; 
    usdValue?: number; 
    chain?: string; 
    balance?: number;
  }>;
  nftCount: number;
  nftContracts?: any; // You might want to type this more strictly
  transactions?: any[]; // You might want to type this more strictly
}

const createAlchemyInstance = (network: Network) => {
  const settings = {
    apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    network,
  };
  
  return new Alchemy(settings);
};


async function fetchTokenPrices(tokenContractAddresses: string[], chainKey: string): Promise<Record<string, number>> {
  console.log(`Fetching prices for ${tokenContractAddresses.length} tokens on ${chainKey}`); 
  const prices: Record<string, number> = {};
  for (const address of tokenContractAddresses) {
    prices[address] = Math.random() * 100;
  }
  return prices;
}

async function fetchNativeTokenPrice(chainKey: string): Promise<number> {

  console.log(`Fetching native token price for ${chainKey}`);
  
  if (chainKey === 'polygon') return 1; 
  return 2000; 
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  
  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }
  
  try {
    // Fetch data from all supported chains in parallel
    const chainDataPromises = supportedChains.map(async (chain) => {
      const alchemy = createAlchemyInstance(chain.network);
      
      // Fetch native balance
      const [tokenBalancesResponse, nfts, nftContracts, transactions] = await Promise.all([
        alchemy.core.getTokenBalances(address),
        alchemy.nft.getNftsForOwner(address),
        alchemy.nft.getContractsForOwner(address),
        alchemy.core.getAssetTransfers({
          fromAddress: address,
          toAddress: address, // Consider if you need both from and to, or just one
          category: [
            AssetTransfersCategory.EXTERNAL,
            AssetTransfersCategory.INTERNAL,
            AssetTransfersCategory.ERC20,
            AssetTransfersCategory.ERC721,
            AssetTransfersCategory.ERC1155,
          ],
          maxCount: 100,
          withMetadata: true,
        })
      ]);
      
      const nativeBalance = await alchemy.core.getBalance(address);
      const nativeBalanceInEth = parseFloat(nativeBalance.toString()) / 1e18;
      const nativeTokenPrice = await fetchNativeTokenPrice(chain.key);

      const tokenContractAddresses = tokenBalancesResponse.tokenBalances.map(tb => tb.contractAddress);
      // Call fetchTokenPrices without the alchemy argument
      const tokenPrices = await fetchTokenPrices(tokenContractAddresses, chain.key);
      
      const tokenDataPromises = tokenBalancesResponse.tokenBalances.map(async (token) => {
        const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
        const tokenBalance = BigInt(token.tokenBalance || '0');
        const decimals = metadata.decimals || 18;
        const balance = Number(tokenBalance) / Math.pow(10, decimals);
        const usdPrice = tokenPrices[token.contractAddress] || 0;
        
        return {
          symbol: metadata.symbol,
          name: metadata.name,
          logo: metadata.logo,
          balance,
          usdValue: balance * usdPrice,
          chain: chain.key,
          contractAddress: token.contractAddress
        };
      });
      
      const tokenData = await Promise.all(tokenDataPromises);
      
      return {
        chain: chain.key,
        chainId: chain.id,
        nativeBalance: {
          value: nativeBalanceInEth,
          symbol: chain.key === 'ethereum' || chain.key === 'optimism' || 
                 chain.key === 'arbitrum' || chain.key === 'base' ? 'ETH' : 
                 chain.key === 'polygon' ? 'MATIC' : 'ETH',
          usdValue: nativeBalanceInEth * nativeTokenPrice 
        },
        tokenBalances: tokenData,
        nftCount: nfts.totalCount,
        nftContracts: nftContracts.contracts,
        transactions: transactions.transfers
      };
    });
    
    const chainDataResults = await Promise.allSettled(chainDataPromises);
    
    // Then use the ChainData interface here
    const successfulResults = chainDataResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<ChainData>).value);
    
    const tokenBalances = successfulResults.flatMap(result => result.tokenBalances || []);
    const nftCount = successfulResults.reduce((sum, result) => sum + (result.nftCount || 0), 0);
    const totalNativeValue = successfulResults.reduce(
      (sum, result) => sum + (result.nativeBalance?.usdValue || 0), 0
    );
    const totalTokenValue = tokenBalances.reduce(
      (sum, token) => sum + (token.usdValue || 0), 0
    );
    
    const chainValues: Record<string, number> = {};
    // Changed 'let' to 'const' for totalValue
    const totalValue = totalNativeValue + totalTokenValue;
    
    successfulResults.forEach(result => {
      if (result.nativeBalance?.usdValue) {
        chainValues[result.chain] = (chainValues[result.chain] || 0) + result.nativeBalance.usdValue;
      }
    });
    
    tokenBalances.forEach(token => {
      if (token.usdValue && token.chain) {
        chainValues[token.chain] = (chainValues[token.chain] || 0) + token.usdValue;
      }
    });
    
    const chainAllocation = Object.entries(chainValues).map(([chain, value]) => {
      const chainInfo = supportedChains.find(c => c.key === chain);
      
      let fill_color = '#403d39'; // Default to primary color
      // Ensure chainInfo.color is a non-empty string before using it
      if (chainInfo && 'color' in chainInfo && typeof chainInfo.color === 'string' && chainInfo.color) {
        fill_color = chainInfo.color;
      }

      return {
        chain: chainInfo ? chainInfo.key : chain,
        name: chainInfo ? chainInfo.name : chain.charAt(0).toUpperCase() + chain.slice(1),
        value: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
        fill: fill_color
      };
    });
    
    const response = {
      nativeBalance: {
        value: successfulResults.reduce((sum, result) => sum + (result.nativeBalance?.value || 0), 0),
        usdValue: totalNativeValue
      },
      tokenBalances,
      nftCount,
      totalValueUsd: totalNativeValue + totalTokenValue,
      chainAllocation,
      chains: successfulResults.map(result => ({
        chain: result.chain,
        chainId: result.chainId,
        nativeBalance: result.nativeBalance,
        tokenCount: (result.tokenBalances || []).length,
        nftCount: result.nftCount || 0
      }))
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    // It's good practice to check the error type before accessing properties
    let errorMessage = 'Failed to fetch wallet data';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}