'use client';

import { useState, useEffect } from 'react';
import { DashboardCharts } from '@/components/dashboard/charts';
// Removed unused Card components
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Removed unused Table components
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
// Removed formatAddress import as it's no longer needed here
// import { formatAddress } from '@/lib/utils';
import { base, optimism, arbitrum, mainnet, bsc } from 'viem/chains';
// Removed toast import
// import { toast } from 'sonner';
// Removed OnchainKit imports
// import { Avatar as OnchainAvatar } from '@coinbase/onchainkit/identity';
// Removed UI Avatar imports
// import { Avatar as UIAvatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// Removed DropdownMenu imports
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
import {
  // Removed ChevronDown, LogOut
  Search,
  LayoutDashboard,
  CreditCard,
  Clock,
  ShoppingCart,
  List,
  Users,
  Settings,
  // Removed Moon, Sun
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { useTheme } from 'next-themes';
import { ConnectKitButton, useModal } from 'connectkit';
// Removed useDisconnect hook
import { useAccount, useChainId } from 'wagmi';
// Removed getName and getAvatar imports
// import { getName, getAvatar } from '@coinbase/onchainkit/identity';

// Define supported chains and their properties including id
// Note: While we removed the custom dropdown, keeping this definition might be useful
// if other parts of the app need chain information based on wagmi's chainId.
const supportedChains = [
  { name: 'Base', key: 'base', id: base.id, viemChain: base, isTestnet: false },
  { name: 'Optimism', key: 'optimism', id: optimism.id, viemChain: optimism, isTestnet: false },
  { name: 'Arbitrum', key: 'arbitrum', id: arbitrum.id, viemChain: arbitrum, isTestnet: false },
  { name: 'Ethereum', key: 'ethereum', id: mainnet.id, viemChain: mainnet, isTestnet: false },
  { name: 'BNB Chain', key: 'binance', id: bsc.id, viemChain: bsc, isTestnet: false },
];

// Export the dashboard page directly
export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');
  // Removed displayName and avatarUrl state
  // const [displayName, setDisplayName] = useState<string | null>(null);
  // const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  const { isConnected, address } = useAccount();
  const chainId = useChainId(); // Keep chainId from wagmi for potential use elsewhere
  const modal = useModal(); // Keep modal hook if needed for other custom triggers

  // Removed useEffect for fetching wallet info (ENS/Avatar)
  // useEffect(() => { ... loadWalletInfo ... }, [isConnected, address, chainId]);

  // Removed handleDisconnectWallet function
  // const handleDisconnectWallet = async () => { ... };

  // Removed copyAddressToClipboard function
  // const copyAddressToClipboard = () => { ... };

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
          {/* Removed wallet info from sidebar */}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              {/* Simplified Header Greeting */}
              <h1 className="text-2xl font-bold">Welcome</h1>
              <p className="text-muted-foreground">Here's a comprehensive view of your accounts and wallets</p>
            </div>
            <div className="flex gap-2">
              {/* Removed Chain Selector Dropdown */}

              {/* Use the default ConnectKitButton */}
              <ConnectKitButton />

              {/* Removed the separate DropdownMenu for copy/disconnect */}
              {/* {isConnected && ( <DropdownMenu> ... </DropdownMenu> )} */}
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
              {/* Pass necessary props like address and chainId if DashboardCharts needs them */}
              <DashboardCharts /* address={address} chainId={chainId} */ />
            </TabsContent>
            <TabsContent value="pnl" className="mt-6">
              {/* PnL content will be added here */}
              <p>PnL Content Placeholder</p> {/* Added placeholder */}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}