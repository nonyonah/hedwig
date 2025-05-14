'use client';

import { useState, useEffect } from 'react';
import { 
  useActiveWallet,
  useActiveAccount,
  useDisconnect,
  useActiveWalletChain,
  useWalletBalance,
  useActiveWalletConnectionStatus,
  useConnectModal,
} from "thirdweb/react";
import { client } from "@/providers/ThirdwebProvider";
import { createWallet } from "thirdweb/wallets";


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
  const activeWallet = useActiveWallet(); 
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

  const nftCount = 0;
  const isLoadingNFTs = false;

  // New function to automatically connect wallet
  const autoConnect = async () => {
    // Only attempt to connect if not already connected
    if (connectionStatus !== "connected" && !activeWallet) {
      try {
        // Define the wallets to show in the connect modal (same as in signin page)
        const wallets = [
          createWallet("io.metamask"),
          createWallet("com.coinbase.wallet"),
          createWallet("me.rainbow"),
        ];
        
        // Use the connect function without showing the modal
        await connect({ 
          client: client,
          wallets
          // Remove the autoSelect parameter as it's not supported
        });
        
        return true;
      } catch (error) {
        console.error('Auto-connect failed:', error);
        return false;
      }
    }
    return connectionStatus === "connected";
  };

  useEffect(() => {
    const fetchWalletData = async () => {
      // Ensure all necessary data is available
      if (!address || connectionStatus !== "connected" || !chain) {
        setWalletData(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true); 
      try {
        if (balance) {
         
          const nativeValueBigInt = balance.value;
          const nativeValue = parseFloat(balance.displayValue); 
          
         
          // const usdPricePerToken = balance.price || 0; // 'price' does not exist on GetBalanceResult
          const usdPricePerToken = 0; // Placeholder: USD price for native token needs a separate source
          const usdValue = nativeValue * usdPricePerToken;
          
          const currentWalletData: WalletData = {
            nativeBalance: {
              value: nativeValue,
              usdValue: usdValue
            },
            tokenBalances: [ // This is simplified to only show native balance as a token
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
            totalValueUsd: usdValue // Simplified: In reality, sum of all token USD values
          };
          
          setWalletData(currentWalletData);
        } else if (!isLoadingBalance) {
          // If balance is not available and not loading, set to a default/empty state
           setWalletData({
            nativeBalance: { value: 0, usdValue: 0 },
            tokenBalances: [],
            nftCount: 0,
            totalValueUsd: 0,
          });
        }
      } catch (err) {
        console.error("Error fetching wallet data:", err);
        setError("Failed to fetch wallet data");
        setWalletData(null);
      } finally {
        // Overall loading state depends on balance loading
        setIsLoading(isLoadingBalance); 
      }
    };

    fetchWalletData();
  }, [address, connectionStatus, chain, balance, isLoadingBalance, nftCount]);

  const disconnect = async () => {
    // Corrected disconnect call
    if (disconnectWallet.disconnect && activeWallet) { 
      await disconnectWallet.disconnect(activeWallet); 
    }
  };

  return {
    address,
    isConnected: connectionStatus === "connected",
    chainId: chain?.id,
    disconnect, // Return the local function instead of disconnectWallet
    walletData,
    isLoading,
    error,
    autoConnect, // Export the new function
  };
}