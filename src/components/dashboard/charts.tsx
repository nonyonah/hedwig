'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, ArrowDown, TrendingUp, AlertCircle } from 'lucide-react';
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
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatAddress } from '@/lib/utils';

// Import the TokenTable component
import { TokenTable } from "@/components/dashboard/TokenTable";

// Define supported chains with their colors and IDs
const supportedChains = [
  { key: 'base', name: 'Base', id: 8453, isTestnet: false, color: 'hsl(var(--chart-1))' },
  { key: 'optimism', name: 'Optimism', id: 10, isTestnet: false, color: 'hsl(var(--chart-2))' },
  { key: 'arbitrum', name: 'Arbitrum', id: 42161, isTestnet: false, color: 'hsl(var(--chart-3))' },
  { key: 'ethereum', name: 'Ethereum', id: 1, isTestnet: false, color: 'hsl(var(--chart-4))' },
  { key: 'binance', name: 'BNB Chain', id: 56, isTestnet: false, color: 'hsl(var(--chart-5))' },
];

// Chart configuration for the line chart
const lineChartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--chart-1))",
  },
};

interface PieChartPayload {
  name: string;
  value: number;
  chain: string;
  fill: string;
}

// Chart configuration for the pie chart
const chartConfig = {
  value: {
    label: "Value",
  },
  base: {
    label: "Base",
    color: "hsl(var(--chart-1))",
  },
  optimism: {
    label: "Optimism",
    color: "hsl(var(--chart-2))",
  },
  arbitrum: {
    label: "Arbitrum",
    color: "hsl(var(--chart-3))",
  },
  ethereum: {
    label: "Ethereum",
    color: "hsl(var(--chart-4))",
  },
  binance: {
    label: "BNB Chain",
    color: "hsl(var(--chart-5))",
  },
};

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
}

interface DashboardChartsProps {
  walletData: WalletData | null;
  isLoading: boolean;
  error: string | null;
  address?: string;
  chainId?: number;
}

/**
 * Dashboard charts component that displays wallet metrics
 * @param {Object} props - Component props
 * @param {WalletData|null} props.walletData - Wallet data to display
 * @param {boolean} props.isLoading - Loading state
 * @param {string|null} props.error - Error message
 * @param {string} [props.address] - Wallet address
 * @param {number} [props.chainId] - Current chain ID
 */
export function DashboardCharts({ walletData, isLoading, error, address, chainId }: DashboardChartsProps) {
  const [timeframe, setTimeframe] = useState('Weekly');
  const [chainAllocation, setChainAllocation] = useState<Array<{chain: string, name: string, value: number, fill: string}>>([]);
  const [selectedMetric, setSelectedMetric] = useState<'netWorth' | 'tokenWorth' | 'transactions'>('netWorth');
  const [historicalData, setHistoricalData] = useState<Array<{month: string, value: number}>>([]);
  const [walletConnected, setWalletConnected] = useState(false);

  // Calculate the total USD value from wallet data
  const calculateTotalValue = () => {
    if (!walletData) return 0;
    
    // If we have totalValueUsd from the multichain query, use it
    if (walletData.totalValueUsd !== undefined) {
      return walletData.totalValueUsd;
    }
    
    // Otherwise calculate it
    const nativeValue = walletData.nativeBalance?.usdValue || 0;
    const tokenValues = walletData.tokenBalances?.reduce((sum, token) => 
      sum + (token.usdValue || 0), 0) || 0;
    
    return nativeValue + tokenValues;
  };
  
  // Check if wallet is connected
  useEffect(() => {
    setWalletConnected(!!address);
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
      // If no wallet data, show demo allocation
      const currentChain = chainId 
        ? supportedChains.find(c => c.id === chainId) 
        : supportedChains[0];
      
      const allocation = supportedChains.map(chain => ({
        chain: chain.key,
        name: chain.name,
        value: chain.key === currentChain?.key ? 60 : 10, // 60% for current chain, 10% for others
        fill: chain.color
      }));
      
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
        fill: currentChain?.color || 'hsl(var(--chart-4))'
      });
    }
    
    setChainAllocation(allocation);
  }, [walletData, chainId]);

  // Get the appropriate data based on selected metric and timeframe
  const getChartData = () => {
    // Filter data based on timeframe
    const currentMonth = new Date().getMonth();
    let filteredData = [...historicalData];
    
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
        // For transactions, we could get this from the ThirdWeb API if available
        transactions: Math.round(totalValue / 100) || 0
      };
    }
    
    // Default values when not connected or no data
    return {
      netWorth: 1000, // Example value
      tokenWorth: 700, // Example value
      nftCount: 3,    // Example value
      transactions: 10 // Example value
    };
  };

  // Get the chart title based on selected metric
  const getChartTitle = () => {
    switch(selectedMetric) {
      case 'netWorth': return 'Total Net Worth';
      case 'tokenWorth': return 'Token Worth';
      case 'transactions': return 'Transactions';
      default: return 'Total Net Worth';
    }
  };

  // Get the chart description based on selected metric
  const getChartDescription = () => {
    switch(selectedMetric) {
      case 'netWorth': return 'Shows your total net worth on and off-chain';
      case 'tokenWorth': return 'Shows your token value over time';
      case 'transactions': return 'Shows your transaction count over time';
      default: return 'Shows your total net worth on and off-chain';
    }
  };

  // Get metrics data
  const metrics = getMetrics();

  // Determine if we're loading data
  const isDataLoading = isLoading; // Remove reference to isLoadingTokens
  
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
                8%
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
        <Card className="h-36">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Number of NFTs</CardTitle>
            {isDataLoading && <Skeleton className="h-4 w-12" />}
          </CardHeader>
          <CardContent className="px-4 pt-2">
            {isDataLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : walletConnected && metrics.nftCount !== null ? (
              <>
                <div className="text-3xl font-bold">{metrics.nftCount}</div>
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
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Line Chart */}
        <Card className="border border-[#E9EAEB] md:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              {isDataLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : (
                <>
                  <CardTitle className="text-base font-medium">{getChartTitle()}</CardTitle>
                  <p className="text-xs text-muted-foreground">{getChartDescription()}</p>
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
              ) : getChartData().length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center">
                  <p className="text-muted-foreground">No data available for the selected timeframe</p>
                </div>
              ) : (
                <ChartContainer
                  config={lineChartConfig}
                  className="h-full w-full"
                >
                  <LineChart
                    data={getChartData()}
                    margin={{
                      top: 15,
                      right: 25,
                      left: 5,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis 
                      tickFormatter={(value) => 
                        selectedMetric === 'transactions' 
                          ? value.toString() 
                          : `$${value}`
                      } 
                    />
                    <Tooltip 
                      formatter={(value) => 
                        selectedMetric === 'transactions' 
                          ? [value.toString(), 'Transactions'] 
                          : [`$${value}`, selectedMetric === 'netWorth' ? 'Net Worth' : 'Token Worth']
                      }
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Pie Chart */}
        <Card className="border border-[#E9EAEB] md:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Chain Allocation</CardTitle>
            <p className="text-xs text-muted-foreground">Distribution of your assets across chains</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isDataLoading ? (
                <div className="flex flex-col space-y-2 h-full">
                  <Skeleton className="h-full w-full rounded-md" />
                </div>
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
                      innerRadius={30}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name}: ${value}%`}
                      labelLine={false}
                    >
                      {chainAllocation.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `${value}%`}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as PieChartPayload;
                          return (
                            <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow-sm">
                              <p className="font-medium">{data.name}</p>
                              <p className="text-sm">{`${data.value}% of portfolio`}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Token Table Card */}
      <Card className="border border-[#E9EAEB]">
        <CardHeader>
          <CardTitle className="text-base font-medium">Token Holdings</CardTitle>
          <CardDescription className="text-xs">
            View all your tokens across multiple chains
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TokenTable 
            tokenBalances={walletData?.tokenBalances} 
            isLoading={isLoading} 
            error={error} 
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Define interface for PieChart payload
interface PieChartPayload {
  name: string;
  value: number;
  chain: string;
  fill: string;
}

