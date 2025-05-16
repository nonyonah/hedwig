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
  // For the first error on line 58, either remove the variable or prefix it with an underscore
  // Option 1: Remove it completely
  // const isLoadingNFTs = false;
  
  // Option 2: Prefix with underscore to indicate intentional non-use
  const _isLoadingNFTs = false;
  
  // For the second error on line 101, either remove the variable or use it somewhere
  // Option 1: Remove the variable declaration
  // const nativeValueBigInt = balance.value;
  const nativeValue = parseFloat(balance.displayValue);
  
  // Option 2: Prefix with underscore to indicate intentional non-use
  const _nativeValueBigInt = balance.value;
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
}