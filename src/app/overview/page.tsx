'use client';

import { useState } from 'react';
import { DashboardCharts } from '@/components/dashboard/charts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base, optimism, arbitrum, mainnet, bsc } from 'viem/chains';
import { Input } from "@/components/ui/input";
import { useTheme } from 'next-themes';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';
import type { Chain } from 'viem/chains';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { Sidebar } from '@/components/Sidebar';

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');
  const { theme, setTheme } = useTheme();

  // Use the ThirdWeb hook
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
      {/* New Sidebar */}
      <Sidebar />

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
                address={address as string | undefined}
                chainId={chainId as number | undefined}
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
