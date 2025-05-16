'use client';

import { useState, useEffect } from 'react';
import { DashboardCharts } from '@/components/dashboard/charts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from "@/components/ui/button";
// Change to just:
import { base } from 'viem/chains';

// Remove these unused imports:
// - Input from "@/components/ui/input"
// - formatAddress from '@/lib/utils'
// - Chain from 'viem/chains'
// - CreditCard from 'lucide-react'
// - CardFooter from "@/components/ui/card"
// - TableCaption from "@/components/ui/table"

// Remove or comment out these unused variables:
// - timeframe, setTimeframe
// - theme, setTheme
// - isConnected
// - handleDisconnectWallet
// - copyAddressToClipboard
import { useTheme } from 'next-themes';
import { formatAddress } from '@/lib/utils';
import { toast } from 'sonner';
import type { Chain } from 'viem/chains';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { CreditCard } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, Filter } from "lucide-react";
import OnboardingAgentWrapper from '@/components/OnboardingAgentWrapper';

function DashboardContent() {
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
    error: dataError,
    autoConnect
  } = useWalletConnection();

  // Auto-connect wallet when page loads
  useEffect(() => {
    const connectWallet = async () => {
      await autoConnect();
    };
    
    connectWallet();
  }, [autoConnect]);

  const handleDisconnectWallet = async () => {
    try {
      await disconnect();
      toast.success("Wallet disconnected successfully");
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      toast.error("Failed to disconnect wallet");
    }
  };

  const copyAddressToClipboard = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard");
    }
  };

  return (
    // Remove the flex container since we're using the layout's container
    <div className="bg-background">
      {/* Remove the sidebar */}
      
      {/* Main Content */}
      <div className="overflow-auto">
        <div className="container mx-auto p-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                Welcome
              </h1>

              <p className="text-muted-foreground">Here&apos;s a comprehensive view of your accounts and wallets</p>
            </div>
            <div className="flex items-center gap-2">
              <ConnectWalletButton />
              {/* Connect Bank button removed */}
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            // In the Tabs section, update the TabsList to include History and NFTs
            <TabsList className="grid w-full max-w-md grid-cols-5">
              // In the Tabs section, update the TabsList to include History and NFTs
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="bank">Bank Assets</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="nfts">NFTs</TabsTrigger>
              <TabsTrigger value="pnl">PnL</TabsTrigger>
            </TabsList>
            
            {/* Add new TabsContent sections for History and NFTs */}
            <TabsContent value="history" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>View all your recent transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-4">
                    <Select defaultValue="all">
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Transactions</SelectItem>
                        <SelectItem value="send">Send</SelectItem>
                        <SelectItem value="receive">Receive</SelectItem>
                        <SelectItem value="buy">Buy</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Apr 23, 2023</TableCell>
                        <TableCell>Send</TableCell>
                        <TableCell>-0.5 ETH</TableCell>
                        <TableCell><Badge>Completed</Badge></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Apr 22, 2023</TableCell>
                        <TableCell>Receive</TableCell>
                        <TableCell>+1.2 ETH</TableCell>
                        <TableCell><Badge>Completed</Badge></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Apr 20, 2023</TableCell>
                        <TableCell>Buy</TableCell>
                        <TableCell>+0.3 ETH</TableCell>
                        <TableCell><Badge>Completed</Badge></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="nfts" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>NFT Collection</CardTitle>
                  <CardDescription>View all your NFTs across different chains</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="aspect-square rounded-lg bg-muted mb-3"></div>
                        <h3 className="font-medium">NFT #1234</h3>
                        <p className="text-sm text-muted-foreground">Collection Name</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="aspect-square rounded-lg bg-muted mb-3"></div>
                        <h3 className="font-medium">NFT #5678</h3>
                        <p className="text-sm text-muted-foreground">Collection Name</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="aspect-square rounded-lg bg-muted mb-3"></div>
                        <h3 className="font-medium">NFT #9012</h3>
                        <p className="text-sm text-muted-foreground">Collection Name</p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
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
            <TabsContent value="bank" className="mt-6">
              <div className="space-y-6">
                {/* Stats Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card className="h-36">
                    <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
                      <span className="flex items-center text-xs font-medium text-red-500">
                        <ArrowDown className="mr-1 h-3 w-3" />
                        10%
                      </span>
                    </CardHeader>
                    <CardContent className="px-4 pt-2">
                      <div className="text-3xl font-bold">45,823</div>
                      <p className="text-xs text-muted-foreground">$1,873 last year</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="h-36">
                    <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Income</CardTitle>
                      <span className="flex items-center text-xs font-medium text-green-500">
                        <ArrowDown className="mr-1 h-3 w-3 rotate-180" />
                        10%
                      </span>
                    </CardHeader>
                    <CardContent className="px-4 pt-2">
                      <div className="text-3xl font-bold">$2,000</div>
                      <p className="text-xs text-muted-foreground">$1,873</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="h-36">
                    <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Accounts</CardTitle>
                      <span className="flex items-center text-xs font-medium text-green-500">
                        <ArrowDown className="mr-1 h-3 w-3 rotate-180" />
                        10%
                      </span>
                    </CardHeader>
                    <CardContent className="px-4 pt-2">
                      <div className="text-3xl font-bold">5</div>
                      <p className="text-xs text-muted-foreground">$1,873</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="h-36">
                    <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Transactions</CardTitle>
                      <span className="flex items-center text-xs font-medium text-red-500">
                        <ArrowDown className="mr-1 h-3 w-3" />
                        10%
                      </span>
                    </CardHeader>
                    <CardContent className="px-4 pt-2">
                      <div className="text-3xl font-bold">200</div>
                      <p className="text-xs text-muted-foreground"></p>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Total Income Chart */}
                <Card className="p-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                    <div>
                      <h3 className="text-lg font-medium">Total Income</h3>
                      <p className="text-sm text-muted-foreground">Shows your total income across your accounts</p>
                    </div>
                    <Select defaultValue="weekly">
                      <SelectTrigger className="w-[180px] h-8 mt-2 md:mt-0">
                        <SelectValue placeholder="Weekly" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Chart placeholder - you'll need to implement the actual chart */}
                  <div className="w-full h-[300px] bg-muted/20 rounded-md flex items-center justify-center">
                    {/* This is where you'd implement your chart component */}
                    <div className="text-muted-foreground">Income chart will be displayed here</div>
                  </div>
                </Card>
                
                {/* Transactions Table */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Transactions</CardTitle>
                    </div>
                    <Button variant="outline" size="icon">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Transaction ID</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Narration</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src="/placeholder-avatar.jpg" alt="Avatar" />
                                <AvatarFallback>AE</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">20,000</div>
                                <div className="text-xs text-muted-foreground">NGN</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">Debit</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">67db34bbf467ad...</TableCell>
                          <TableCell>
                            <div>2023-03-19</div>
                            <div className="text-xs text-muted-foreground">10:40</div>
                          </TableCell>
                          <TableCell>VIA GTWORLD TXD...</TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">41,858</div>
                            <div className="text-xs text-muted-foreground">NGN</div>
                          </TableCell>
                        </TableRow>
                        {/* You can add more rows as needed */}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
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

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
      {/* Add the OnboardingAgentWrapper here instead */}
      <OnboardingAgentWrapper />
    </ProtectedRoute>
  );
}
