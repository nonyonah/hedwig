'use client';

import { useState, useEffect } from 'react';
import { 
  useActiveAccount,
  useDisconnect,
  useActiveWalletChain,
  useWalletBalance,
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
};

export function useWalletConnection() {
  const activeAccount = useActiveAccount(); 
  const connectionStatus = useActiveWalletConnectionStatus();
  const { connect } = useConnectModal();
  
  const address = activeAccount?.address; 

  const disconnectWallet = useDisconnect();
  const chain = useActiveWalletChain();
  
  const { data: balance, isLoading: isLoadingBalance } = useWalletBalance({ 
    client: client, 
    chain: chain,
    address: address, 
  }); 
  
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [error, setError] = useState<string | null>(null);

  // Define autoConnect function (example)
  const autoConnect = async () => {
    // Implement your auto-connection logic here
    // For example, try to connect to a previously used wallet
    try {
      // This is a placeholder. Replace with actual auto-connect logic.
      // const previouslyConnectedWallet = localStorage.getItem('previouslyConnectedWallet');
      // if (previouslyConnectedWallet) {
      //   const wallet = createWallet(previouslyConnectedWallet);
      //   await connect({ client, wallet });
      // }
      console.log("Attempting to auto-connect...");
    } catch (e) {
      console.error("Auto-connect failed", e);
      setError("Auto-connect failed");
    }
  };

  useEffect(() => {
    setIsLoading(isLoadingBalance);
    if (balance) {
      const nftCount = 0; // Placeholder for actual NFT count
      const nativeValue = parseFloat(balance.displayValue); 
      const usdPricePerToken = 0; // Placeholder: USD price for native token needs a separate source
      const usdValue = nativeValue * usdPricePerToken;
      
      const currentWalletData: WalletData = {
        nativeBalance: {
          value: nativeValue,
          usdValue: usdValue
        },
        tokenBalances: [ 
          {
            symbol: balance.symbol || null,
            name: balance.name || null,
            logo: null, 
            balance: nativeValue,
            usdValue: usdValue,
            chain: chain?.name || String(chain?.id),
          }
        ],
        nftCount: nftCount, 
        totalValueUsd: usdValue 
      };
      setWalletData(currentWalletData);
    } else if (!isLoadingBalance) {
      setWalletData(null); // Clear data if balance is not available and not loading
    }
  }, [balance, isLoadingBalance, chain]);

  // Return the state and functions
  return {
    address,
    isConnected: connectionStatus === 'connected',
    chainId: chain?.id,
    disconnect: disconnectWallet,
    walletData,
    isLoading,
    error,
    autoConnect, // Make sure to define this function
    connect, // Expose the connect function from useConnectModal
    connectionStatus
  };
}