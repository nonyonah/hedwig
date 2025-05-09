import { useState, useEffect } from 'react';
import { useThirdweb } from 'thirdweb/react';
import { client } from '@/providers/ThirdwebProvider';

// Define the structure of token data
export interface TokenData {
  symbol: string | null;
  name: string | null;
  logo: string | null;
  balance: number;
  usdValue?: number;
  chain?: string;
  priceChange24h?: number;
}

// Define the structure of wallet data
export interface WalletData {
  nativeBalance: {
    value: number;
    usdValue?: number;
  };
  tokenBalances: TokenData[];
  nftCount: number;
  totalValueUsd?: number;
  historicalData?: Array<{
    timestamp: number;
    value: number;
  }>;
}

export function useMultichainData(address: string | undefined, days: number = 30) {
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { sdk } = useThirdweb();
  
  useEffect(() => {
    const fetchMultichainData = async () => {
      if (!address || !sdk) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        
        // Use multichain query to get data across all chains
        const response = await sdk.multichain.query({
          queries: [
            {
              queryKey: ["native-balance", address],
              queryFn: async () => {
                return await sdk.wallet.getNativeBalance({
                  address: address,
                  includePrice: true,
                });
              },
            },
            {
              queryKey: ["tokens", address],
              queryFn: async () => {
                return await sdk.wallet.getTokenBalances({
                  address: address,
                  includePrice: true,
                });
              },
            },
            {
              queryKey: ["nfts", address],
              queryFn: async () => {
                return await sdk.wallet.getNFTs({
                  address: address,
                });
              },
            },
            {
              queryKey: ["portfolio-history", address, days],
              queryFn: async () => {
                return await sdk.wallet.getPortfolioHistory({
                  address: address,
                  days: days,
                });
              },
            }
          ],
        });
        
        // Process the response data
        const nativeBalance = response[0].data || { value: 0 };
        const tokens = response[1].data || [];
        const nfts = response[2].data || [];
        const history = response[3].data || [];
        
        // Format tokens with chain information
        const formattedTokens = tokens.map((token: any) => ({
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown Token',
          logo: token.logo || null,
          balance: parseFloat(token.balance || '0'),
          usdValue: token.usdValue || 0,
          chain: token.chainId ? mapChainIdToName(token.chainId) : 'unknown',
          priceChange24h: token.priceChange24h || 0,
        }));
        
        // Calculate total USD value
        const nativeValue = nativeBalance.usdValue || 0;
        const tokenValue = formattedTokens.reduce((sum: number, token: TokenData) => sum + (token.usdValue || 0), 0);
        const totalValueUsd = nativeValue + tokenValue;
        
        setWalletData({
          nativeBalance: {
            value: parseFloat(nativeBalance.value || '0'),
            usdValue: nativeBalance.usdValue || 0,
          },
          tokenBalances: formattedTokens,
          nftCount: nfts.length,
          totalValueUsd: totalValueUsd,
          historicalData: history,
        });
        
        setError(null);
      } catch (err) {
        console.error('Error fetching multichain data:', err);
        setError('Failed to fetch wallet data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMultichainData();
  }, [address, days, sdk]);
  
  return { walletData, isLoading, error };
}

// Helper function to map chain IDs to readable names
function mapChainIdToName(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: 'ethereum',
    10: 'optimism',
    56: 'binance',
    137: 'polygon',
    42161: 'arbitrum',
    8453: 'base',
  };
  
  return chainMap[chainId] || 'unknown';
}