'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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
import { supabase, getSession } from '@/lib/supabase';
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

// Define supported chains and their properties
// The 'key' should match the names expected by web3icons (usually lowercase)
const supportedChains = [
  { name: 'Base', key: 'base', viemChain: base, isTestnet: true },
  { name: 'Optimism', key: 'optimism', viemChain: optimism, isTestnet: false },
  { name: 'Arbitrum', key: 'arbitrum', viemChain: arbitrum, isTestnet: false },
  { name: 'Ethereum', key: 'ethereum', viemChain: mainnet, isTestnet: true },
  { name: 'BNB Chain', key: 'binance', viemChain: bsc, isTestnet: false }, // Changed from 'bnb' to 'binance' for web3icons compatibility
];

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');
  const { user, authenticated, login, logout, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [address, setAddress] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedChainName, setSelectedChainName] = useState('All'); // Default to All option
  const [isConnecting, setIsConnecting] = useState(false);
  const { theme, setTheme } = useTheme();

  const currentChain = selectedChainName === 'All' ? supportedChains[0] : supportedChains.find(c => c.name === selectedChainName) || supportedChains[0];

  useEffect(() => {
    const loadWalletInfo = async () => {
      if (wallets.length > 0 && authenticated) {
        const wallet = wallets[0];
         if (wallet.address !== address) {
          setAddress(wallet.address);
          setDisplayName(null);
          setAvatarUrl(null);
        }

        try {
          const chainToUse = currentChain.viemChain;

          console.log(`Attempting to resolve name for ${wallet.address} on chain: ${currentChain.name}`);

          const name = await getName({
            address: wallet.address as `0x${string}`,
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
            setDisplayName(null);
            setAvatarUrl(null);
          }
        } catch (error) {
          console.error(`Error fetching ENS/Basename on ${currentChain.name}:`, error);
          setDisplayName(null);
          setAvatarUrl(null);
        }
      } else if (!authenticated || wallets.length === 0) {
        setAddress(null);
        setDisplayName(null);
        setAvatarUrl(null);
      }
    };

     const autoConnectWallet = async () => {
       if (authenticated || wallets.length > 0) {
         return;
       }
      try {
        const { data: sessionData } = await getSession();
        if (sessionData?.user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('wallet_address, last_disconnect_time')
            .eq('id', sessionData.user.id)
            .maybeSingle();

          if (profile?.wallet_address) {
            if (!profile.last_disconnect_time) {
              await login();
            } else {
              const timeSinceDisconnect = Date.now() - profile.last_disconnect_time;
              if (timeSinceDisconnect > 24 * 60 * 60 * 1000) {
                await connectWallet();
              } else {
                await login();
              }
            }
          }
        }
      } catch (error) {
        console.error('Error during auto-connect wallet:', error);
      }
    };

    loadWalletInfo();
    // autoConnectWallet(); // Re-evaluate if/when to call this

  }, [authenticated, wallets, selectedChainName, address, currentChain.viemChain]);

  const handleConnectWallet = async () => {
    try {
      setIsConnecting(true);
      if (!authenticated) {
        await connectWallet();
      } else if (wallets.length === 0) {
        await connectWallet();
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      const { data: sessionData } = await getSession();
      if (sessionData?.user?.id) {
        await supabase
          .from('profiles')
          .update({ last_disconnect_time: Date.now() })
          .eq('id', sessionData.user.id);
      }
      await logout();
      toast.success('Wallet disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  const handleChainSelect = (chainName: string) => {
    setSelectedChainName(chainName);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <div className="hidden w-64 flex-col border-r bg-white p-4 md:flex">
        <div className="mb-8">
          <Input
            type="search"
            placeholder="Search"
            className="h-9"
            prefix={<Search className="h-4 w-4 text-muted-foreground" />}

          />
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
          <div className="flex items-center gap-3 rounded-lg p-3">
            <Avatar>
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={displayName || address || 'User'} />
              ) : (
                <AvatarFallback>{(displayName || address)?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              )}
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{displayName || formatAddress(address || '')}</span>
              <span className="text-xs text-muted-foreground">{address ? formatAddress(address) : 'Not connected'}</span>
            </div>
            <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={handleDisconnectWallet}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
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
              
              {address ? (
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Connected
                </Button>
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
          <Tabs defaultValue="overview" className="mb-6">
            <TabsList className="w-full max-w-md">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="pnl">PnL</TabsTrigger>
              <TabsTrigger value="bank-assets">Bank Assets</TabsTrigger>
            </TabsList>

            {/* Content Sections */}
            <TabsContent value="overview" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                </CardHeader>
                <CardContent>Placeholder content for overview.</CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="pnl" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Profit & Loss</CardTitle>
                </CardHeader>
                <CardContent>Placeholder content for PnL.</CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="bank-assets" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Bank Assets</CardTitle>
                </CardHeader>
                <CardContent>Placeholder content for Bank Assets.</CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            <Card className="w-[310px] h-[150px]">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Worth</CardTitle>
                <span className="flex items-center text-xs font-medium text-destructive">
                  <ArrowDown className="mr-1 h-3 w-3" />
                  10%
                </span>
              </CardHeader>
              <CardContent className="px-4 pt-2">
                <div className="text-3xl font-bold">$45,823</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </CardContent>
            </Card>
            <Card className="w-[310px] h-[150px]">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Token Worth</CardTitle>
                <span className="flex items-center text-xs font-medium text-green-500">
                  <ArrowDown className="mr-1 h-3 w-3 rotate-180" />
                  8%
                </span>
              </CardHeader>
              <CardContent className="px-4 pt-2">
                <div className="text-3xl font-bold">$12,234</div>
                <p className="text-xs text-muted-foreground">+$2,345 this month</p>
              </CardContent>
            </Card>
            <Card className="w-[310px] h-[150px]">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Number of NFTs</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-2">
                <div className="text-3xl font-bold">12</div>
                <p className="text-xs text-muted-foreground">+3 this year</p>
              </CardContent>
            </Card>
            <Card className="w-[310px] h-[150px]">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-2">
                <div className="text-3xl font-bold">1,234</div>
                <p className="text-xs text-muted-foreground">+120 this year</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}