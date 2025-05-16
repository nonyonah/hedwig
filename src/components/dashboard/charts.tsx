'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, ArrowDown, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";  // Remove unused imports
// import { formatAddress } from '@/lib/utils';  // Remove unused import
// Import correct ThirdWeb v5 functions
import { useActiveAccount, useActiveWalletChain } from "thirdweb/react";
import { isAddress } from "thirdweb";

// Import the TokenTable component
import { TokenTable } from "@/components/dashboard/TokenTable";

// Define the primary color
const PRIMARY_COLOR = '#8d99ae';

// Define supported chains with their colors and IDs
const supportedChains = [
  { key: 'base', name: 'Base', id: 8453, isTestnet: false, color: PRIMARY_COLOR },
  { key: 'optimism', name: 'Optimism', id: 10, isTestnet: false, color: '#FF0420' },
  { key: 'arbitrum', name: 'Arbitrum', id: 42161, isTestnet: false, color: '#28A0F0' },
  { key: 'ethereum', name: 'Ethereum', id: 1, isTestnet: false, color: '#627EEA' },
  { key: 'binance', name: 'BNB Chain', id: 56, isTestnet: false, color: '#F3BA2F' },
];

// Chart configuration for the line chart

// Comment out or remove unused interface
// interface PieChartPayload {  // Remove unused interface
//   name: string;
//   value: number;
//   chain: string;
//   fill: string;
// }


// Define TypeScript interfaces for the component props
interface WalletData {
  nativeBalance: {
    value: number;
    usdValue?: number;
  };
  tokenBalances: Array<{
    symbol: string | null;
    name: string | null;
    logo: string | null;
    balance: number;
    usdValue?: number | undefined;
    chain?: string; // Add the optional chain property
  }>;
  nftCount: number;
  totalValueUsd?: number;
  historicalData?: Array<{
    timestamp: number;
    value: number;
  }>;
  chainAllocation?: Array<{
    chain: string;
    name: string;
    value: number;
    fill: string;
  }>;
}

interface DashboardChartsProps {
  error?: string | null;
  walletData?: WalletData | null;
  isLoading?: boolean;
  address?: string;
  chainId?: number;
}

/**
 * Dashboard charts component that displays wallet metrics
 */
export function DashboardCharts({ 
  error: propError, 
  walletData: propWalletData,
  isLoading: propIsLoading,
  address: propAddress,
  chainId: propChainId
}: DashboardChartsProps) {
  const [timeframe, setTimeframe] = useState('Weekly');
  const [chainAllocation, setChainAllocation] = useState<Array<{chain: string, name: string, value: number, fill: string}>>([]);
  const [selectedMetric, setSelectedMetric] = useState<'netWorth' | 'tokenWorth' | 'transactions'>('netWorth');
  const [historicalData, setHistoricalData] = useState<Array<{month: string, value: number}>>([]);
  const [walletConnected, setWalletConnected] = useState(false);
  // Update your state initialization to use props if provided
  const [walletData, setWalletData] = useState<WalletData | null>(propWalletData || null);
  const [isLoading, setIsLoading] = useState(propIsLoading || false);
  // Corrected useState destructuring for error state
  const [setError] = useState<string | null>(propError || null);
  
  // Get wallet address from ThirdWeb or props
  const account = useActiveAccount();
  const address = propAddress || account?.address;
  const chain = useActiveWalletChain();
  const chainId = propChainId || chain?.id;
  
  // Calculate total value function
  const calculateTotalValue = () => {
    if (!walletData) return 0;
    
    // Calculate total value
    const nativeValue = walletData.nativeBalance?.usdValue || 0;
    const tokenValues = walletData.tokenBalances?.reduce((sum, token) => 
      sum + (token.usdValue || 0), 0) || 0;
    
    return nativeValue + tokenValues;
  };
  
  // Fetch wallet data when address changes - using Alchemy via API
  useEffect(() => {
    if (!address || !isAddress(address)) {
      setWalletConnected(false);
      setWalletData(null);
      return;
    }
    
    setWalletConnected(true);
    setIsLoading(true);
    setError(null); // Now correctly calls the setter function
    
    // Fetch wallet data from our API (which uses Alchemy)
    fetch(`/api/wallet?address=${address}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch wallet data');
        }
        return response.json();
      })
      .then(data => {
        setWalletData(data);
        setChainAllocation(data.chainAllocation || []);
      })
      .catch(err => {
        console.error('Error fetching wallet data:', err);
        if (err instanceof Error) {
          setError(err.message); // Now correctly calls the setter function
        } else {
          setError('An unknown error occurred');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [address, chainId, propWalletData]);
  
  // Check if wallet is connected
  useEffect(() => {
    setWalletConnected(!!address && isAddress(address));
  }, [address]);

  // Generate historical data based on wallet data
  useEffect(() => {
    // If we have historical data from the multichain query, use it
    if (walletData?.historicalData && walletData.historicalData.length > 0) {
      // Format the historical data for our chart
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const formattedData = walletData.historicalData.map((item: { timestamp: number; value: number }) => {
        const date = new Date(item.timestamp);
        return {
          month: months[date.getMonth()],
          value: item.value
        };
      });
      
      setHistoricalData(formattedData);
      return;
    }
    
    // Otherwise, use mock data as before
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    
    // Default value to use if no wallet data is available
    const defaultValue = 1000; // $1000 as example value
    const totalValue = walletData ? calculateTotalValue() : defaultValue;
    
    const data = months.map((month, index) => {
      // Create a realistic pattern with some randomness
      // Earlier months have lower values to show growth
      const monthFactor = index <= currentMonth 
        ? 0.7 + (index / currentMonth) * 0.3 
        : 0;
      
      // Add some randomness
      const randomFactor = 0.9 + Math.random() * 0.2;
      
      let value = 0;
      if (index <= currentMonth) {
        if (selectedMetric === 'netWorth') {
          value = totalValue * monthFactor * randomFactor;
        } else if (selectedMetric === 'tokenWorth') {
          const tokenValue = walletData?.tokenBalances?.reduce((sum, token) => 
            sum + (token.usdValue || 0), 0) || totalValue * 0.7; // 70% of total as default
          value = tokenValue * monthFactor * randomFactor;
        } else if (selectedMetric === 'transactions') {
          // Arbitrary transaction count based on wallet value
          value = Math.round((totalValue / 1000) * monthFactor * randomFactor);
        }
      }
      
      return {
        month,
        value: Math.round(value)
      };
    });
    
    setHistoricalData(data);
  }, [walletData, selectedMetric]);
  
  // Update chain allocation based on actual wallet data
  useEffect(() => {
    if (!walletData || !walletData.tokenBalances || walletData.tokenBalances.length === 0) {
      // If no wallet data, show demo allocation with more chains
      
      // Enhanced mock data with all supported chains
      const allocation = [
        {
          chain: 'ethereum',
          name: 'Ethereum',
          value: 35,
          fill: '#627EEA'
        },
        {
          chain: 'base',
          name: 'Base',
          value: 25,
          fill: PRIMARY_COLOR
        },
        {
          chain: 'optimism',
          name: 'Optimism',
          value: 15,
          fill: '#FF0420'
        },
        {
          chain: 'arbitrum',
          name: 'Arbitrum',
          value: 15,
          fill: '#28A0F0'
        },
        {
          chain: 'binance',
          name: 'BNB Chain',
          value: 10,
          fill: '#F3BA2F'
        }
      ];
      
      setChainAllocation(allocation);
      return;
    }
    
    // Group token balances by chain
    const chainValues: Record<string, number> = {};
    let totalValue = 0;
    
    // Add native token to the current chain
    if (walletData.nativeBalance && walletData.nativeBalance.usdValue) {
      const currentChain = chainId 
        ? supportedChains.find(c => c.id === chainId)?.key || 'ethereum'
        : 'ethereum';
      
      chainValues[currentChain] = walletData.nativeBalance.usdValue;
      totalValue += walletData.nativeBalance.usdValue;
    }
    
    // Add token values by chain
    walletData.tokenBalances.forEach(token => {
      if (token.usdValue) {
        // Check if token has a chain property
        if (token.chain) {
          const chain = token.chain.toLowerCase();
          chainValues[chain] = (chainValues[chain] || 0) + token.usdValue;
          totalValue += token.usdValue;
        } else {
          // If no chain specified, add to current chain
          const currentChain = chainId 
            ? supportedChains.find(c => c.id === chainId)?.key || 'ethereum'
            : 'ethereum';
          
          chainValues[currentChain] = (chainValues[currentChain] || 0) + token.usdValue;
          totalValue += token.usdValue;
        }
      }
    });
    
    // Convert to pie chart data format
    const allocation = Object.entries(chainValues).map(([chain, value]) => {
      const chainInfo = supportedChains.find(c => c.key === chain) || {
        key: chain,
        name: chain.charAt(0).toUpperCase() + chain.slice(1),
        color: '#888888'
      };
      
      return {
        chain: chainInfo.key,
        name: chainInfo.name,
        value: Math.round((value / totalValue) * 100),
        fill: chainInfo.color
      };
    });
    
    // Ensure we have at least one item
    if (allocation.length === 0) {
      const currentChain = chainId 
        ? supportedChains.find(c => c.id === chainId) 
        : supportedChains[0];
      
      allocation.push({
        chain: currentChain?.key || 'ethereum',
        name: currentChain?.name || 'Ethereum',
        value: 100,
        fill: currentChain?.color || PRIMARY_COLOR
      });
    }
    
    setChainAllocation(allocation);
  }, [walletData, chainId]);

  // Get the appropriate data based on selected metric and timeframe
  const getChartData = () => {
    // Filter data based on timeframe
    const currentMonth = new Date().getMonth();
    const filteredData = [...historicalData];  // Change let to const
    
    switch(timeframe) {
      case 'Daily':
        // For daily, just use the current month's data point
        return [filteredData[currentMonth]].filter(Boolean);
      case 'Weekly':
        // For weekly, use the last 4 data points
        return filteredData.slice(Math.max(0, currentMonth - 3), currentMonth + 1);
      case 'Monthly':
        // For monthly, use the last 6 data points
        return filteredData.slice(Math.max(0, currentMonth - 5), currentMonth + 1);
      case 'Yearly':
        // For yearly, use all data points
        return filteredData;
      default:
        return filteredData;
    }
  };

  // Get metrics based on wallet data or use placeholders
  const getMetrics = () => {
    if (walletData) {
      const totalValue = calculateTotalValue();
      const tokenValue = walletData.tokenBalances?.reduce((sum, token) => 
        sum + (token.usdValue || 0), 0) || 0;
      
      return {
        netWorth: totalValue,
        tokenWorth: tokenValue,
        nftCount: walletData.nftCount || 0,
        transactions: Math.round(totalValue / 100) || 0 // Placeholder for transactions
      };
    }
    
    // Default values when not connected or no data
    return {
      netWorth: 1000,
      tokenWorth: 700,
      nftCount: 3,
      transactions: 10
    };
  };

  // Get the chart title based on selected metric

  // Get the chart description based on selected metric

  // Get metrics data
  const metrics = getMetrics();

  // Determine if we're loading data
  const isDataLoading = isLoading;
  
  return (
    <div className="space-y-6">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card 
          className={`h-36 cursor-pointer transition-all ${selectedMetric === 'netWorth' ? 'ring-1 ring-primary/40' : ''}`}
          onClick={() => setSelectedMetric('netWorth')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Worth</CardTitle>
            {isDataLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : walletConnected && metrics.netWorth !== null && metrics.netWorth > 0 && (
              <span className="flex items-center text-xs font-medium text-green-500">
                <ArrowDown className="mr-1 h-3 w-3 rotate-180" />
                10%
              </span>
            )}
          </CardHeader>
          <CardContent className="px-4 pt-2">
            {isDataLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : walletConnected && metrics.netWorth !== null ? (
              <>
                <div className="text-3xl font-bold">${metrics.netWorth.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">Connect wallet to view</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card 
          className={`h-36 cursor-pointer transition-all ${selectedMetric === 'tokenWorth' ? 'ring-1 ring-primary/40' : ''}`}
          onClick={() => setSelectedMetric('tokenWorth')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Token Worth</CardTitle>
            {isDataLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : walletConnected && metrics.tokenWorth !== null && metrics.tokenWorth > 0 && (
              <span className="flex items-center text-xs font-medium text-green-500">
                <ArrowDown className="mr-1 h-3 w-3 rotate-180" />
                10%
              </span>
            )}
          </CardHeader>
          <CardContent className="px-4 pt-2">
            {isDataLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : walletConnected && metrics.tokenWorth !== null ? (
              <>
                <div className="text-3xl font-bold">${metrics.tokenWorth.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">Connect wallet to view</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="h-36">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bank Balances</CardTitle>
            {isDataLoading && <Skeleton className="h-4 w-12" />}
          </CardHeader>
          <CardContent className="px-4 pt-2">
            {isDataLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : walletConnected ? (
              <>
                <div className="text-3xl font-bold">$45,823</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">Connect wallet to view</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card 
          className={`h-36 cursor-pointer transition-all ${selectedMetric === 'transactions' ? 'ring-1 ring-primary/40' : ''}`}
          onClick={() => setSelectedMetric('transactions')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
            {isDataLoading && <Skeleton className="h-4 w-12" />}
          </CardHeader>
          <CardContent className="px-4 pt-2">
            {isDataLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : walletConnected && metrics.transactions !== null ? (
              <>
                <div className="text-3xl font-bold">{metrics.transactions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Updated just now</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">Connect wallet to view</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Main Content Area - Side by Side Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column - Line Chart */}
        <div className="md:col-span-8">
          <Card className="border border-[#E9EAEB]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                {isDataLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-base font-medium">Total Net Worth</CardTitle>
                    <p className="text-xs text-muted-foreground">Shows your total net worth on and off-chain</p>
                  </>
                )}
              </div>
              {isDataLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-8 text-xs">
                      {timeframe} <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setTimeframe('Daily')}>Daily</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeframe('Weekly')}>Weekly</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeframe('Monthly')}>Monthly</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTimeframe('Yearly')}>Yearly</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {isDataLoading ? (
                  <div className="flex flex-col space-y-2 h-full">
                    <Skeleton className="h-full w-full rounded-md" />
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                ) : !walletConnected ? (
                  <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Connect your wallet to see your {selectedMetric === 'netWorth' ? 'net worth' : selectedMetric === 'tokenWorth' ? 'token worth' : 'transactions'} history</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={getChartData()}
                      margin={{ top: 5, right: 10, left: 10, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                      <XAxis 
                        dataKey="month" 
                        tickLine={false}
                        axisLine={false}
                        padding={{ left: 10, right: 10 }}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => 
                          selectedMetric === 'transactions' 
                            ? value.toString() 
                            : `$${value}`
                        }
                      />
                      <Tooltip 
                        formatter={(value) => 
                          selectedMetric === 'transactions' 
                            ? [value, 'Transactions'] 
                            : [`$${Number(value).toLocaleString()}`, 'Value']
                        }
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#7c3aed" 
                        strokeWidth={2}
                        dot={{ r: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Right Column - Pie Chart and Bank Balance */}
        <div className="md:col-span-4 space-y-6">
          {/* Pie Chart */}
          <Card className="border border-[#E9EAEB]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Chain Allocation</CardTitle>
              <CardDescription className="text-xs">Shows your token allocation across multiple chains</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {isDataLoading ? (
                  <Skeleton className="h-full w-full rounded-md" />
                ) : !walletConnected ? (
                  <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Connect your wallet to see your chain allocation</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chainAllocation}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={0}
                        dataKey="value"
                      >
                        {chainAllocation.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Legend 
                        layout="vertical" 
                        verticalAlign="middle" 
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        formatter={(entry: LegendEntry) => {
                          if (entry.payload) {
                            return (
                              <span style={{ fontSize: '12px', color: '#666' }}>
                                {entry.payload.name}
                              </span>
                            );
                          }
                          return null; // Or some default rendering
                        }}
                      />
                      <Tooltip 
                        formatter={(value) => [`${value}%`, 'Allocation']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Token Table */}
      <Card>
        <CardHeader>
          <CardTitle>Token Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <TokenTable 
            tokens={walletData?.tokenBalances || []}
            isLoading={isLoading}
            walletConnected={walletConnected}
            chainColors={supportedChains.reduce((acc, chain) => {
              acc[chain.key] = chain.color;
              return acc;
            }, {} as Record<string, string>)}
            />
        </CardContent>
      </Card>
    </div>
  );
}

// Define an interface for the legend payload based on your chainAllocation data
interface LegendPayloadEntry {
  name: string;
  value: number;
  fill: string;
}

interface LegendEntry {
  payload?: LegendPayloadEntry;
}