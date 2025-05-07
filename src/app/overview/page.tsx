'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { useTheme } from 'next-themes';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';
import type { Chain } from 'viem/chains'; // Import Chain type
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { useWalletConnection } from '@/hooks/useWalletConnection';

// Define supported chains and their properties including id and the viem Chain object
const supportedChains: { name: string; key: string; id: number; viemChain: Chain; isTestnet: boolean }[] = [
  { name: 'Base', key: 'base', id: base.id, viemChain: base, isTestnet: false },
  { name: 'Optimism', key: 'optimism', id: optimism.id, viemChain: optimism, isTestnet: false },
  { name: 'Arbitrum', key: 'arbitrum', id: arbitrum.id, viemChain: arbitrum, isTestnet: false },
  { name: 'Ethereum', key: 'ethereum', id: mainnet.id, viemChain: mainnet, isTestnet: false },
  { name: 'BNB Chain', key: 'binance', id: bsc.id, viemChain: bsc, isTestnet: false },
];

// Refined WalletData type based on ThirdWeb responses
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

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');
  const { theme, setTheme } = useTheme();

  // Replace Wagmi hooks with ThirdWeb hooks from useWalletConnection
  const { 
    address,
    isConnected,
    chainId,
    disconnect,
    walletData, 
    isLoading: isLoadingData, 
    error: dataError 
  } = useWalletConnection();

  const handleDisconnectWallet = async () => {
    if (disconnect) {
      await disconnect();
      toast.success("Wallet disconnected successfully");
    }
  };

  const copyAddressToClipboard = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard");
    }
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
              <h1 className="text-2xl font-bold">
                Welcome
              </h1>
              <p className="text-muted-foreground">Here's a comprehensive view of your accounts and wallets</p>
            </div>
            <div className="flex items-center gap-2">
              <ConnectWalletButton />
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
