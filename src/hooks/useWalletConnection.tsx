import { useAddress, useChainId, useConnectionStatus, useConnect, useDisconnect, useBalance, useSDK } from "@thirdweb-dev/react";
import { useState, useEffect } from "react";

export interface WalletData {
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
    priceChange24h?: number;
    marketShare?: number;
    chain?: string;
  }>;
  nftCount: number;
  totalValueUsd?: number;
}

export function useWalletConnection() {
  const address = useAddress();
  const chainId = useChainId();
  const connectionStatus = useConnectionStatus();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const sdk = useSDK();
  const { data: nativeBalance } = useBalance();
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [walletData, setWalletData] = useState<WalletData | null>(null);

  // Fetch wallet data when address or chainId changes
  useEffect(() => {
    const fetchWalletData = async () => {
      if (!address || !sdk) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Get native token balance
        const nativeTokenValue = nativeBalance?.displayValue 
          ? parseFloat(nativeBalance.displayValue) 
          : 0;
        
        // In a real implementation, you would use Thirdweb's SDK to fetch token prices
        // For example: const priceData = await sdk.getTokenPrice(tokenAddress);
        const mockUsdPrice = 2000; // Example ETH price
        const nativeTokenUsdValue = nativeTokenValue * mockUsdPrice;
        
        // In a real implementation, you would use Thirdweb's SDK to fetch token balances
        // For example: const tokens = await sdk.wallet.getTokenBalances();
        const mockTokenBalances = [
          {
            symbol: "USDC",
            name: "USD Coin",
            logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
            balance: 100,
            usdValue: 100,
            priceChange24h: 0.05, // 0.05% increase
            marketShare: 15.2,
            chain: "ethereum"
          },
          {
            symbol: "LINK",
            name: "Chainlink",
            logo: "https://cryptologos.cc/logos/chainlink-link-logo.png",
            balance: 5,
            usdValue: 50,
            priceChange24h: -2.3, // 2.3% decrease
            marketShare: 3.8,
            chain: "ethereum"
          },
          {
            symbol: "MATIC",
            name: "Polygon",
            logo: "https://cryptologos.cc/logos/polygon-matic-logo.png",
            balance: 150,
            usdValue: 75,
            priceChange24h: 1.7, // 1.7% increase
            marketShare: 5.1,
            chain: "polygon"
          },
          {
            symbol: "BNB",
            name: "Binance Coin",
            logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png",
            balance: 0.5,
            usdValue: 125,
            priceChange24h: -0.8, // 0.8% decrease
            marketShare: 8.3,
            chain: "binance"
          }
        ];
        
        // In a real implementation, you would use Thirdweb's SDK to fetch NFT count
        // For example: const nfts = await sdk.wallet.getNFTs();
        const mockNftCount = 3;
        
        // Calculate total USD value
        const totalTokenValue = mockTokenBalances.reduce(
          (sum, token) => sum + (token.usdValue || 0), 
          0
        );
        const totalValueUsd = nativeTokenUsdValue + totalTokenValue;
        
        setWalletData({
          nativeBalance: {
            value: nativeTokenValue,
            usdValue: nativeTokenUsdValue
          },
          tokenBalances: mockTokenBalances,
          nftCount: mockNftCount,
          totalValueUsd
        });
        
      } catch (err) {
        console.error("Error fetching wallet data:", err);
        setError("Failed to fetch wallet data");
      } finally {
        setIsLoading(false);
      }
    };
    
    if (address) {
      fetchWalletData();
    } else {
      setWalletData(null);
    }
  }, [address, chainId, nativeBalance, sdk]);
  
  return {
    address,
    chainId,
    isConnected: connectionStatus === "connected",
    isConnecting: connectionStatus === "connecting",
    isDisconnected: connectionStatus === "disconnected",
    connect,
    disconnect,
    walletData,
    isLoading,
    error
  };
}