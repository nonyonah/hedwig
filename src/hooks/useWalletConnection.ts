'use client';

import { useState, useEffect } from 'react';
import { 
  useActiveAccount,
  useDisconnect,
  useActiveWalletChain,
  useActiveWalletConnectionStatus,
  useConnectModal,
} from "thirdweb/react";
import { client } from "@/providers/ThirdwebProvider";


export type WalletData = {
  nativeBalance: {
    value: number;
    usdValue?: number;
  };
  tokenBalances: Array<{
    symbol: string | null;
    name: string | null;
    logo: string | null;
    balance: number;
    usdValue?: number;
    chain?: string;
    marketShare?: number;
    priceChange24h?: number;
  }>;
  nftCount: number;
  totalValueUsd?: number;
  chainAllocation?: Array<{
    chain: string;
    name: string;
    value: number;
    fill: string;
  }>;
};

export function useWalletConnection() {
  const activeAccount = useActiveAccount(); 
  const connectionStatus = useActiveWalletConnectionStatus();
  const { connect } = useConnectModal();
  
  const address = activeAccount?.address; 

  const disconnectWallet = useDisconnect();
  const chain = useActiveWalletChain();
  
  // Remove the ThirdWeb balance hook - we don't need it
  // const { data: balance, isLoading: isLoadingBalance } = useWalletBalance({ ... });
  
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); 
  const [error, setError] = useState<string | null>(null);

  // Define autoConnect function (example)
  const autoConnect = async () => {
    try {
      console.log("Attempting to auto-connect...");
      // Your auto-connect logic here
    } catch (e) {
      console.error("Auto-connect failed", e);
      setError("Auto-connect failed");
    }
  };

  // Simplified useEffect that only depends on address and chain
  useEffect(() => {
    // Only fetch data if we have an address
    if (!address) {
      setWalletData(null);
      setIsLoading(false);
      return;
    }
    
    // Set loading state
    setIsLoading(true);
    setError(null);
    
    console.log("Fetching data from API for address:", address);
    fetch(`/api/wallet?address=${address}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log("API data received:", data);
        // Add debug logging for chain allocation
        if (data.chainAllocation) {
          console.log("Chain allocation data:", data.chainAllocation);
        } else {
          console.log("No chain allocation data received");
        }
        setWalletData(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("API fetch error:", err);
        setError(err.message);
        setIsLoading(false);
        
        // Don't set fallback data from ThirdWeb - let the UI handle the error state
        // This ensures we're not mixing data sources
        setWalletData(null);
      });
  }, [address, chain?.id]); // Only depend on address and chain ID

  // Return the state and functions
  return {
    address,
    isConnected: connectionStatus === 'connected',
    chainId: chain?.id,
    disconnect: disconnectWallet,
    walletData,
    isLoading,
    error,
    autoConnect,
    connect,
    connectionStatus
  };
}