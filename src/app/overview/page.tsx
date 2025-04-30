'use client';

import { useState, useEffect } from 'react';
import { DashboardCharts } from '@/components/dashboard/charts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { base, optimism, arbitrum, mainnet, bsc } from 'viem/chains';
import {
  Search,
  LayoutDashboard,
  CreditCard,
  Clock,
  ShoppingCart,
  List,
  Users,
  Settings,
  // Removed LogOut, Copy as they are no longer used directly here
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { useTheme } from 'next-themes';
import { ConnectKitButton, useModal } from 'connectkit';
import { useAccount, useChainId, useDisconnect } from 'wagmi';
// Remove OnchainKit identity imports
// import { getName, getAvatar } from '@coinbase/onchainkit/identity';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';
import { Alchemy, Network, Utils } from 'alchemy-sdk'; // Import Alchemy SDK
import type { Chain } from 'viem/chains'; // Import Chain type


// Define supported chains and their properties including id and the viem Chain object
const supportedChains: { name: string; key: string; id: number; viemChain: Chain; isTestnet: boolean }[] = [
  { name: 'Base', key: 'base', id: base.id, viemChain: base, isTestnet: false },
  { name: 'Optimism', key: 'optimism', id: optimism.id, viemChain: optimism, isTestnet: false },
  { name: 'Arbitrum', key: 'arbitrum', id: arbitrum.id, viemChain: arbitrum, isTestnet: false },
  { name: 'Ethereum', key: 'ethereum', id: mainnet.id, viemChain: mainnet, isTestnet: false },
  { name: 'BNB Chain', key: 'binance', id: bsc.id, viemChain: bsc, isTestnet: false },
];

// Refined WalletData type based on potential Alchemy responses
type WalletData = {
  nativeBalance: {
    value: number; // Value in native currency (e.g., ETH)
    usdValue?: number; // Optional USD value
  };
  tokenBalances: {
    symbol: string | null;
    name: string | null;
    logo: string | null;
    balance: number; // Formatted balance (considering decimals)
    usdValue?: number; // Optional USD value
  }[];
  nftCount: number;
  totalValueUsd?: number; // Optional total portfolio value in USD
  // Add other relevant data points as needed
};

// Function to map wagmi chainId to Alchemy Network enum
const getAlchemyNetwork = (chainId: number): Network | undefined => {
  switch (chainId) {
    case mainnet.id: return Network.ETH_MAINNET;
    case base.id: return Network.BASE_MAINNET;
    case optimism.id: return Network.OPT_MAINNET;
    case arbitrum.id: return Network.ARB_MAINNET;
    // Add other supported chains here
    // e.g., case polygon.id: return Network.MATIC_MAINNET;
    default: return undefined; // Or throw an error if unsupported
  }
};

// Updated function to fetch wallet data using Alchemy
const fetchWalletData = async (address: string, chainId: number): Promise<WalletData> => {
  console.log(`Fetching data via Alchemy for address ${address} on chain ${chainId}...`);

  const network = getAlchemyNetwork(chainId);
  if (!network) {
    throw new Error(`Unsupported chainId for Alchemy: ${chainId}`);
  }

  // Configure Alchemy SDK
  // IMPORTANT: Replace 'YOUR_ALCHEMY_API_KEY' with your actual key,
  // preferably loaded from environment variables (e.g., process.env.NEXT_PUBLIC_ALCHEMY_API_KEY)
  const config = {
    apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || 'YOUR_ALCHEMY_API_KEY',
    network: network,
  };
  const alchemy = new Alchemy(config);

  try {
    // --- Fetch Native Balance ---
    const nativeBalanceBigInt = await alchemy.core.getBalance(address, 'latest');
    const nativeBalanceFormatted = parseFloat(Utils.formatEther(nativeBalanceBigInt));
    // TODO: Fetch native currency price (e.g., ETH price) to calculate usdValue

    // --- Fetch Token Balances ---
    const balancesResponse = await alchemy.core.getTokenBalances(address);
    const nonZeroBalances = balancesResponse.tokenBalances.filter((token) => {
      return token.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000';
    });

    const tokenDataPromises = nonZeroBalances.map(async (token) => {
      try {
        const metadata = await alchemy.core.getTokenMetadata(token.contractAddress);
        const balance = parseFloat(Utils.formatUnits(token.tokenBalance ?? '0', metadata.decimals ?? 18));
        // TODO: Fetch individual token prices to calculate usdValue
        return {
          symbol: metadata.symbol,
          name: metadata.name,
          logo: metadata.logo,
          balance: balance,
          usdValue: undefined, // Placeholder for USD value
        };
      } catch (metaError) {
        console.warn(`Could not fetch metadata for token ${token.contractAddress}:`, metaError);
        // Fallback if metadata fails
        return {
          symbol: 'Unknown',
          name: 'Unknown Token',
          logo: null,
          balance: 0, // Or try to format without decimals if possible
          usdValue: undefined,
        };
      }
    });

    const tokenBalances = await Promise.all(tokenDataPromises);

    // --- Fetch NFT Count ---
    // Note: getNftsForOwner can be paginated and might require multiple calls for large collections
    const nftsResponse = await alchemy.nft.getNftsForOwner(address, { pageSize: 1 }); // Fetch only 1 to get totalCount efficiently
    const nftCount = nftsResponse.totalCount;

    // --- Calculate Total Value (Placeholder) ---
    // TODO: Sum up nativeBalance.usdValue and all tokenBalances.usdValue
    const totalValueUsd = undefined;

    return {
      nativeBalance: {
        value: nativeBalanceFormatted,
        usdValue: undefined, // Placeholder
      },
      tokenBalances: tokenBalances,
      nftCount: nftCount,
      totalValueUsd: totalValueUsd, // Placeholder
    };

  } catch (error) {
    console.error("Error fetching data from Alchemy:", error);
    throw new Error("Failed to fetch wallet data from Alchemy."); // Re-throw for the calling useEffect to catch
  }
};


export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');
  // Remove displayName and avatarUrl state
  // const [displayName, setDisplayName] = useState<string | null>(null);
  // const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const modal = useModal();
  const { disconnect } = useDisconnect();

  // State for wallet data, loading, and errors
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Remove the useEffect hook for OnchainKit identity resolution
  // useEffect(() => {
  //   const resolveIdentity = async () => {
  //     if (isConnected && address && chainId) {
  //       // Find the corresponding viem Chain object from supportedChains
  //       const currentChain = supportedChains.find(c => c.id === chainId)?.viemChain;
  //
  //       if (!currentChain) {
  //         console.warn(`Identity resolution not supported for chainId: ${chainId}`);
  //         setDisplayName(null); // Reset if chain is not supported for identity
  //         setAvatarUrl(null);
  //         return; // Exit if chain is not found/supported
  //       }
  //
  //       try {
  //         // Pass the found viem Chain object
  //         const name = await getName({ address, chain: currentChain });
  //         // Revert: Pass the resolved name (or address if name is null) to getAvatar
  //         const avatar = await getAvatar({ name: name || address, chain: currentChain });
  //         setDisplayName(name);
  //         setAvatarUrl(avatar);
  //       } catch (error) {
  //         console.error("Error resolving identity:", error);
  //         setDisplayName(null);
  //         setAvatarUrl(null);
  //       }
  //     } else {
  //       setDisplayName(null);
  //       setAvatarUrl(null);
  //     }
  //   };
  //   resolveIdentity();
  // }, [isConnected, address, chainId]);

  // Effect to fetch wallet data using the updated function
  useEffect(() => {
    const loadWalletData = async () => {
      if (isConnected && address && chainId) {
        setIsLoadingData(true);
        setDataError(null);
        setWalletData(null);
        try {
          // Call the updated fetchWalletData function
          const data = await fetchWalletData(address, chainId);
          setWalletData(data);
        } catch (error: any) {
          console.error("Error fetching wallet data:", error);
          const errorMessage = error.message || "Failed to load wallet data.";
          setDataError(errorMessage);
          toast.error(errorMessage);
        } finally {
          setIsLoadingData(false);
        }
      } else {
        setWalletData(null);
        setIsLoadingData(false);
        setDataError(null);
      }
    };

    loadWalletData();
  }, [isConnected, address, chainId]);


  const handleDisconnectWallet = async () => {
    // ... existing handleDisconnectWallet code ...
  };

  const copyAddressToClipboard = () => {
    // ... existing copyAddressToClipboard code ...
  };


  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <div className="hidden w-64 flex-col border-r bg-white p-4 md:flex">
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search"
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="space-y-4">
          <div className="px-2 py-1">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">General</h3>
            <nav className="space-y-1">
              <Button
                variant="secondary"
                className="w-full justify-start bg-primary/10 text-primary hover:bg-primary/20"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <CreditCard className="mr-2 h-4 w-4" />
                Accounts
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Clock className="mr-2 h-4 w-4" />
                Transactions
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <ShoppingCart className="mr-2 h-4 w-4" />
                NFTs
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <List className="mr-2 h-4 w-4" />
                Watchlist
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Users className="mr-2 h-4 w-4" />
                Support
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </nav>
          </div>
        </div>
        <div className="mt-auto">
           <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-sm font-medium text-muted-foreground">Theme</h3>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              {/* Remove displayName usage from the welcome message */}
              <h1 className="text-2xl font-bold">
                Welcome
              </h1>
              <p className="text-muted-foreground">Here's a comprehensive view of your accounts and wallets</p>
            </div>
            <div className="flex items-center gap-2">
              <ConnectKitButton />
            </div>
          </div>


          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="pnl">PnL</TabsTrigger>
            </TabsList>

            {/* Content Sections */}
            <TabsContent value="overview" className="mt-6">
              {/* Pass fetched data, loading state, and error state to DashboardCharts */}
              <DashboardCharts
                walletData={walletData}
                isLoading={isLoadingData}
                error={dataError}
                address={address}
                chainId={chainId}
              />
            </TabsContent>
            <TabsContent value="pnl" className="mt-6">
              {/* PnL content will be added here */}
              <p>PnL Content Placeholder</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}