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
import { ChevronDown } from 'lucide-react';
import { NetworkIcon } from '@web3icons/react';

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
  const [selectedChainName, setSelectedChainName] = useState(supportedChains[0].name); // Default to Base
  const [isConnecting, setIsConnecting] = useState(false);

  const currentChain = supportedChains.find(c => c.name === selectedChainName) || supportedChains[0];

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
    <div className="flex-1 space-y-4 p-8 pt-6 w-full max-w-full">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          {displayName ? `Hi ${displayName.split('.')[0]}` : address ? `Hi ${formatAddress(address)}` : 'Welcome'}
        </h2>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center justify-center p-2" size="icon" title={currentChain.name}>
                <NetworkIcon chainId={currentChain.key} size={24} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {supportedChains.map((chain) => (
                <DropdownMenuItem
                  key={chain.name}
                  onClick={() => handleChainSelect(chain.name)}
                  className="flex items-center gap-2"
                  title={chain.name}
                >
                  <NetworkIcon chainId={chain.key} size={20} />
                  <span className="sr-only">{chain.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {address ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" className="flex items-center gap-2">
                  {avatarUrl ? (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={avatarUrl} alt={displayName || address} />
                      <AvatarFallback>{(displayName || address).slice(0, 2)}</AvatarFallback>
                    </Avatar>
                  ) : (
                     <Avatar className="h-6 w-6">
                       <AvatarFallback>{(displayName || address)?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                     </Avatar>
                   )}
                  <span className="truncate max-w-[150px]">{displayName || formatAddress(address)}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDisconnectWallet}>
                  Disconnect Wallet
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="default"
              onClick={handleConnectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground">Here's a comprehensive view of your accounts and wallets</p>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pnl">PnL</TabsTrigger>
          <TabsTrigger value="bank-assets">Bank Assets</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
           <Card>
             <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
             <CardContent>Placeholder content for overview.</CardContent>
           </Card>
         </TabsContent>
          <TabsContent value="pnl">
            <Card>
              <CardHeader><CardTitle>Profit & Loss</CardTitle></CardHeader>
              <CardContent>Placeholder content for PnL.</CardContent>
            </Card>
          </TabsContent>
           <TabsContent value="bank-assets">
             <Card>
               <CardHeader><CardTitle>Bank Assets</CardTitle></CardHeader>
               <CardContent>Placeholder content for bank assets.</CardContent>
             </Card>
           </TabsContent>
      </Tabs>
    </div>
  );
}