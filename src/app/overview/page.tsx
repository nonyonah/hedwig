'use client';

import { useState, useEffect } from 'react';
import { DashboardCharts } from '@/components/dashboard/charts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from "@/components/ui/button";
import { useTheme } from 'next-themes';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import { useWalletConnection } from '@/hooks/useWalletConnection';
// Remove MonoConnectButton import
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
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

export default function DashboardPage() {
  const [] = useState('weekly');
  useTheme();

  // Use the ThirdWeb hook
  const { 
    address,
    chainId,
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

  // Inside your DashboardPage component
  return (
    <div className="bg-background">
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
            </div>
          </div>
  
          {/* Add debug information */}
          {address && (
            <div className="mb-4 p-2 bg-muted rounded-md">
              <p className="text-sm">Connected Address: {address}</p>
              <p className="text-sm">Chain ID: {chainId}</p>
              <p className="text-sm">Data Loading: {isLoadingData ? 'Yes' : 'No'}</p>
              <p className="text-sm">Data Available: {walletData ? 'Yes' : 'No'}</p>
            </div>
          )}
          
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-5">
              <TabsTrigger className="font-medium" value="overview">Overview</TabsTrigger>
              <TabsTrigger className="font-medium" value="bank">Bank Assets</TabsTrigger>
              <TabsTrigger className="font-medium" value="history">History</TabsTrigger>
              <TabsTrigger className="font-medium" value="nfts">NFTs</TabsTrigger>
              <TabsTrigger className="font-medium" value="pnl">PnL</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="mt-6">
              {/* Pass all necessary props to DashboardCharts */}
              <DashboardCharts 
                walletData={walletData}
                isLoading={isLoadingData}
                error={dataError}
                address={address}
                chainId={chainId}
              />
            </TabsContent>
            
            {/* Other TabsContent sections */}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
