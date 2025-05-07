'use client';

import { useState, useEffect } from 'react';
import { useAddress, useChainId, useDisconnect, useConnectionStatus } from "thirdweb/react";

// Define the WalletData type
export type WalletData = {
  nativeBalance: {
    value: number;
    usdValue?: number;
  };
  tokenBalances: {
    symbol: string | null;
    name: string | null;
    logo: string | null;
    balance: number;
    usdValue?: number;
    chain?: string;
    marketShare?: number;
    priceChange24h?: number;
  }[];
  nftCount: number;
  totalValueUsd?: number;
};

export function useWalletConnection() {
  const address = useAddress();
  const chainId = useChainId();
  const connectionStatus = useConnectionStatus();
  const { disconnect } = useDisconnect();
  
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectionStatus === "connected";

  useEffect(() => {
    const fetchWalletData = async () => {
      if (!isConnected || !address || !chainId) {
        setWalletData(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // For now, we'll use mock data
        // In a real implementation, you would use ThirdWeb SDK to fetch real data
        const mockData: WalletData = {
          nativeBalance: {
            value: 1.25,
            usdValue: 2500,
          },
          tokenBalances: [
            {
              symbol: "ETH",
              name: "Ethereum",
              logo: null,
              balance: 1.25,
              usdValue: 2500,
              chain: "ethereum",
              marketShare: 60,
              priceChange24h: 2.5,
            },
            {
              symbol: "USDC",
              name: "USD Coin",
              logo: null,
              balance: 1000,
              usdValue: 1000,
              chain: "base",
              marketShare: 25,
              priceChange24h: 0.1,
            },
            {
              symbol: "MATIC",
              name: "Polygon",
              logo: null,
              balance: 500,
              usdValue: 400,
              chain: "polygon",
              marketShare: 10,
              priceChange24h: -1.2,
            },
            {
              symbol: "UNI",
              name: "Uniswap",
              logo: null,
              balance: 50,
              usdValue: 250,
              chain: "ethereum",
              marketShare: 5,
              priceChange24h: 5.3,
            },
          ],
          nftCount: 3,
          totalValueUsd: 4150,
        };

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setWalletData(mockData);
      } catch (err) {
        console.error("Error fetching wallet data:", err);
        setError("Failed to fetch wallet data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchWalletData();
  }, [address, chainId, isConnected]);

  return {
    address,
    isConnected,
    chainId,
    disconnect,
    walletData,
    isLoading,
    error,
  };
}