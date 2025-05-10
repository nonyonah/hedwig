import { useState, useEffect } from 'react';
import { getWalletBalance } from 'thirdweb/wallets';
import { client } from '@/providers/ThirdwebProvider';
import { ethereum, base, optimism, arbitrum, bsc } from "thirdweb/chains";

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
  
  useEffect(() => {
    const fetchMultichainData = async () => {
      if (!address || !client) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        
        // Use the ethereum chain object instead of a string
        const balanceResult = await getWalletBalance({
          client,
          address,
          chain: ethereum // Use the imported chain object
        });
        
        // Extract native balance - convert bigint to string then to number
        const nativeBalance = {
          value: parseFloat(balanceResult.value.toString()),
          usdValue: 0 // We don't have USD value from the API
        };
        
        // Since tokens aren't included in the result, we'll use an empty array
        const tokens: any[] = [];
        
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
        
        // Calculate total USD value (which will be 0 without price data)
        const totalValueUsd = 0;
        
        setWalletData({
          nativeBalance,
          tokenBalances: formattedTokens,
          nftCount: 0, // We don't have NFT data available with current APIs
          totalValueUsd,
          historicalData: [], // We don't have historical data available with current APIs
        });
        
        setError(null);
      } catch (err) {
        console.error('Error fetching wallet data:', err);
        setError('Failed to fetch wallet data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMultichainData();
  }, [address, days]);
  
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