'use client';

import { useState, useEffect } from 'react';
import { DashboardCharts } from '@/components/dashboard/charts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';
import { getName, getAvatar } from '@coinbase/onchainkit/identity';
import { base, baseSepolia, optimism, arbitrum, mainnet, sepolia, bsc } from 'viem/chains';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ChevronDown, 
  ArrowDown,
  Search,
  LayoutDashboard,
  CreditCard,
  Clock,
  ShoppingCart,
  List,
  Users,
  Settings,
  LogOut,
  Moon,
  Sun
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/theme-toggle';
import { useTheme } from 'next-themes';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Define supported chains and their properties
// The 'key' should match the names expected by web3icons (usually lowercase)
const supportedChains = [
  { name: 'Base', key: 'base', viemChain: base, isTestnet: true },
  { name: 'Optimism', key: 'optimism', viemChain: optimism, isTestnet: false },
  { name: 'Arbitrum', key: 'arbitrum', viemChain: arbitrum, isTestnet: false },
  { name: 'Ethereum', key: 'ethereum', viemChain: mainnet, isTestnet: true },
  { name: 'BNB Chain', key: 'binance', viemChain: bsc, isTestnet: false }, // Changed from 'bnb' to 'binance' for web3icons compatibility
];

// Initialize QueryClient for React Query
const queryClient = new QueryClient();

// Export the dashboard page directly - no longer wrapped with PrivyProvider
export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');
  const [address, setAddress] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedChainName, setSelectedChainName] = useState('All'); // Default to All option
  const [isConnecting, setIsConnecting] = useState(false);
  const { theme, setTheme } = useTheme();
  
  // Use Privy hooks for authentication and wallet management
  const { login, logout, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  
  // Get the connected wallet address
  const connectedAddress = user?.wallet?.address || null;
  const isConnected = authenticated && !!connectedAddress;

  const currentChain = selectedChainName === 'All' ? supportedChains[0] : supportedChains.find(c => c.name === selectedChainName) || supportedChains[0];

  // Effect to handle wallet connection and ENS/avatar resolution
  useEffect(() => {
    const loadWalletInfo = async () => {
      if (isConnected && connectedAddress) {
        if (connectedAddress !== address) {
          setAddress(connectedAddress);
          setDisplayName(null);
          setAvatarUrl(null);
        }

        try {
          const chainToUse = currentChain.viemChain;
          console.log(`Attempting to resolve name for ${connectedAddress} on chain: ${currentChain.name}`);

          const name = await getName({
            address: connectedAddress as `0x${string}`,
            chain: chainToUse
          });

          console.log(`Resolved name on ${currentChain.name}:`, name);

          if (name) {
            setDisplayName(name);
            try {
              console.log(`Fetching avatar for name: ${name} on chain: ${currentChain.name}`);
              const avatar = await getAvatar({
                ensName: name,
                chain: chainToUse
              });
              console.log(`Resolved avatar:`, avatar);
              setAvatarUrl(avatar || null);
            } catch (avatarError) {
              console.error('Error fetching avatar:', avatarError);
              setAvatarUrl(null);
            }
          } else {
            // If no name found, use formatted address
            setDisplayName(formatAddress(connectedAddress));
            setAvatarUrl(null);
          }
        } catch (error) {
          console.error(`Error fetching ENS/Basename on ${currentChain.name}:`, error);
          // Use formatted address as fallback
          setDisplayName(formatAddress(connectedAddress));
          setAvatarUrl(null);
        }
      } else if (!isConnected) {
        setAddress(null);
        setDisplayName(null);
        setAvatarUrl(null);
      }
    };

    loadWalletInfo();
  }, [isConnected, connectedAddress, selectedChainName, address, currentChain.viemChain]);

  const handleConnectWallet = async () => {
    try {
      setIsConnecting(true);
      await login();
      toast.success('Wallet connected successfully');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await logout();
      setAddress(null);
      setDisplayName(null);
      setAvatarUrl(null);
      toast.success('Wallet disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  const handleChainSelect = (chainName: string) => {
    setSelectedChainName(chainName);
  };

  // Function to copy wallet address to clipboard
  const copyAddressToClipboard = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied to clipboard');
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
          {/* Removed wallet info from sidebar */}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{displayName ? `Hi ${displayName.split('.')[0]}` : address ? `Hi ${formatAddress(address)}` : 'Welcome'}</h1>
              <p className="text-muted-foreground">Here's a comprehensive view of your accounts and wallets</p>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="bg-primary/10 text-primary hover:bg-primary/20">
                    {selectedChainName !== 'All' && (
                      <img 
                        src={`/chains/${supportedChains.find(chain => chain.name === selectedChainName)?.key}.svg`} 
                        alt={selectedChainName + ' icon'} 
                        width={20} 
                        height={20} 
                        className="mr-2 rounded-full object-cover" 
                      />
                    )}
                    {selectedChainName} <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    key="all"
                    onClick={() => handleChainSelect('All')}
                    title="All"
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium">All</span>
                  </DropdownMenuItem>
                  {supportedChains.map((chain) => (
                    <DropdownMenuItem
                      key={chain.name}
                      onClick={() => handleChainSelect(chain.name)}
                      title={chain.name}
                      className="flex items-center gap-2"
                    >
                      <img src={`/chains/${chain.key}.svg`} alt={chain.name + ' icon'} width={20} height={20} className="rounded-full object-cover" />
                      <span className="font-medium">{chain.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {isConnected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2">
                      {avatarUrl ? (
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={avatarUrl} alt={displayName || address || 'User'} />
                          <AvatarFallback>{(displayName || address)?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{(displayName || address)?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                        </Avatar>
                      )}
                      <span className="max-w-[100px] truncate">{displayName || formatAddress(address || '')}</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={copyAddressToClipboard}>
                      Copy Address
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDisconnectWallet}>
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleConnectWallet}
                  disabled={isConnecting}
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </Button>
              )}
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
              <DashboardCharts />
            </TabsContent>
            <TabsContent value="pnl" className="mt-6">
              {/* PnL content will be added here */}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}