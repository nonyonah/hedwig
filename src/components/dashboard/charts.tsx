'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, ArrowDown, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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

// Sample data for different metrics
const netWorthData = [
  { month: 'Jan', value: 42000 },
  { month: 'Feb', value: 43500 },
  { month: 'Mar', value: 41200 },
  { month: 'Apr', value: 45800 },
  { month: 'May', value: 44300 },
  { month: 'Jun', value: 45823 },
];

const tokenWorthData = [
  { month: 'Jan', value: 8500 },
  { month: 'Feb', value: 9200 },
  { month: 'Mar', value: 10500 },
  { month: 'Apr', value: 11300 },
  { month: 'May', value: 11800 },
  { month: 'Jun', value: 12234 },
];

const transactionsData = [
  { month: 'Jan', value: 850 },
  { month: 'Feb', value: 940 },
  { month: 'Mar', value: 1020 },
  { month: 'Apr', value: 1100 },
  { month: 'May', value: 1180 },
  { month: 'Jun', value: 1234 },
];

// Chart configuration for the line chart
const lineChartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--chart-1))",
  },
};

// Generate data based on timeframe
const generateTimeframeData = (metric: string, timeframe: string) => {
  // Base data structure
  const baseData = metric === 'netWorth' ? netWorthData : 
                  metric === 'tokenWorth' ? tokenWorthData : transactionsData;
  
  // Modify data based on timeframe
  switch(timeframe) {
    case 'Daily':
      return baseData.map(item => ({
        ...item,
        value: item.value * (0.9 + Math.random() * 0.2) // Slight variation
      }));
    case 'Monthly':
      return baseData.map(item => ({
        ...item,
        value: item.value * (0.95 + Math.random() * 0.1) // Less variation
      }));
    case 'Yearly':
      return baseData.map(item => ({
        ...item,
        value: item.value * (1.1 + Math.random() * 0.3) // More growth
      }));
    case 'Weekly':
    default:
      return baseData;
  }
};

// Sample data for the pie chart
const pieChartData = [
  { chain: 'base', name: 'Base', value: 28, fill: 'hsl(var(--chart-1))' },
  { chain: 'optimism', name: 'Optimism', value: 72, fill: 'hsl(var(--chart-2))' },
  { chain: 'arbitrum', name: 'Arbitrum', value: 0, fill: 'hsl(var(--chart-3))' },
  { chain: 'ethereum', name: 'Ethereum', value: 0, fill: 'hsl(var(--chart-4))' },
  { chain: 'binance', name: 'BNB Chain', value: 0, fill: 'hsl(var(--chart-5))' },
];

// Sample data for the token allocation table
const tokenAllocationData = [
  { name: 'CARV', price: '$0.323', amount: '0.0100', share: '60.20%', value: '$0.0023', base: 'Base' },
  { name: 'ETH', price: '$3,245.78', amount: '0.0050', share: '25.30%', value: '$16.23', base: 'Optimism' },
  { name: 'USDC', price: '$1.00', amount: '14.50', share: '14.50%', value: '$14.50', base: 'Base' },
];

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

export function DashboardCharts() {
  const [timeframe, setTimeframe] = useState('Weekly');
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [chainAllocation, setChainAllocation] = useState(pieChartData);
  const [selectedMetric, setSelectedMetric] = useState('netWorth');
  
  // Get the appropriate data based on selected metric and timeframe
  const getChartData = () => {
    // If authenticated and wallet connected, show real data (simulated)
    if (authenticated && wallets.length > 0) {
      return generateTimeframeData(selectedMetric, timeframe);
    }
    
    // Default data when not connected
    switch(selectedMetric) {
      case 'netWorth':
        return netWorthData;
      case 'tokenWorth':
        return tokenWorthData;
      case 'transactions':
        return transactionsData;
      default:
        return netWorthData;
    }
  };
  
  // Get the chart title based on selected metric
  const getChartTitle = () => {
    switch(selectedMetric) {
      case 'netWorth':
        return 'Total Net Worth';
      case 'tokenWorth':
        return 'Token Worth';
      case 'transactions':
        return 'Transactions';
      default:
        return 'Total Net Worth';
    }
  };
  
  // Get the chart description based on selected metric
  const getChartDescription = () => {
    switch(selectedMetric) {
      case 'netWorth':
        return 'Shows your total net worth on and off-chain';
      case 'tokenWorth':
        return 'Shows your token value over time';
      case 'transactions':
        return 'Shows your transaction count over time';
      default:
        return 'Shows your total net worth on and off-chain';
    }
  };
  
  // Update chain allocation data when wallet is connected
  // Update data when timeframe changes or wallet connection status changes
  useEffect(() => {
    // Set max listeners to avoid MaxListenersExceededWarning
    if (typeof window !== 'undefined') {
      // Find EventEmitter instances from WalletConnect and increase their max listeners
      const increaseMaxListeners = () => {
        // This targets the common EventEmitter pattern in WalletConnect
        if (window.ethereum) {
          // Access the EventEmitter's setMaxListeners method if available
          if (window.ethereum.setMaxListeners) {
            // Increase the max listeners limit to prevent warnings
            window.ethereum.setMaxListeners(20); // Set a higher limit than default (10)
          }
          
          // For providers that don't expose setMaxListeners but use Node's EventEmitter
          // Try to access the internal _events property that some providers expose
          if (window.ethereum._events && typeof window.ethereum._events === 'object') {
            // Some providers store their event emitter instance here
            const emitter = window.ethereum._events;
            if (emitter.setMaxListeners) {
              emitter.setMaxListeners(20);
            }
          }
        }
        
        // Handle WalletConnect specific event emitters if present
        // WalletConnect often creates its own event emitters
        // Use type assertion to safely access WalletConnectProvider
        const walletConnectProvider = (window as any).WalletConnectProvider;
        if (walletConnectProvider && typeof walletConnectProvider.setMaxListeners === 'function') {
          walletConnectProvider.setMaxListeners(20);
        }
      };
      
      // Apply the fix
      increaseMaxListeners();
    }
    
    if (authenticated && wallets.length > 0) {
      // In a real implementation, you would fetch token data from the wallet
      // and calculate the allocation by chain
      // For now, we'll simulate this with sample data
      
      // This would be replaced with actual API calls to get token balances by chain
      const updatedAllocation = [
        { chain: 'base', name: 'Base', value: 35, fill: 'hsl(var(--chart-1))' },
        { chain: 'optimism', name: 'Optimism', value: 45, fill: 'hsl(var(--chart-2))' },
        { chain: 'arbitrum', name: 'Arbitrum', value: 10, fill: 'hsl(var(--chart-3))' },
        { chain: 'ethereum', name: 'Ethereum', value: 8, fill: 'hsl(var(--chart-4))' },
        { chain: 'binance', name: 'BNB Chain', value: 2, fill: 'hsl(var(--chart-5))' },
      ];
      
      setChainAllocation(updatedAllocation);
    } else {
      // Reset to default data when wallet is disconnected
      setChainAllocation(pieChartData);
    }
    
    // Cleanup function to prevent memory leaks and listener buildup
    return () => {
      if (typeof window !== 'undefined' && window.ethereum && window.ethereum.removeAllListeners) {
        window.ethereum.removeAllListeners();
      }
    };
  }, [authenticated, wallets, timeframe]); // Added timeframe dependency

  return (
    <div className="space-y-6">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card 
          className={`h-[150px] cursor-pointer transition-all ${selectedMetric === 'netWorth' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setSelectedMetric('netWorth')}
        >
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
        <Card 
          className={`h-[150px] cursor-pointer transition-all ${selectedMetric === 'tokenWorth' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setSelectedMetric('tokenWorth')}
        >
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
        <Card className="h-[150px]">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Number of NFTs</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-2">
            <div className="text-3xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">+3 this year</p>
          </CardContent>
        </Card>
        <Card 
          className={`h-[150px] cursor-pointer transition-all ${selectedMetric === 'transactions' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setSelectedMetric('transactions')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-2">
            <div className="text-3xl font-bold">1,234</div>
            <p className="text-xs text-muted-foreground">+120 this year</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Line Chart */}
        <Card className="border border-[#E9EAEB] md:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-medium">{getChartTitle()}</CardTitle>
              <p className="text-xs text-muted-foreground">{getChartDescription()}</p>
            </div>
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
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ChartContainer
                config={lineChartConfig}
                className="h-full w-full"
              >
                <LineChart
                  data={getChartData()}
                  margin={{
                    top: 15,
                    right: 25,
                    left: 25,
                    bottom: 15,
                  }}
                >
                  <CartesianGrid 
                    strokeDasharray="3 3" 
                    vertical={false} 
                    stroke="hsl(var(--border))" 
                    opacity={0.5}
                  />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))" 
                    tickLine={true}
                    axisLine={true}
                    tickMargin={10}
                    tickFormatter={(value) => value.slice(0, 3)}
                    fontSize={12}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                    tickLine={true}
                    axisLine={true}
                    tickMargin={10}
                    fontSize={12}
                    width={65}
                    domain={['auto', 'auto']}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <ChartTooltipContent>
                            <div className="text-sm font-medium">{payload[0].payload.month}</div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: "hsl(var(--primary))" }}
                                />
                                <span>Value</span>
                              </div>
                              <div className="font-medium">${Number(payload[0].value).toLocaleString()}</div>
                            </div>
                          </ChartTooltipContent>
                        )
                      }
                      return null
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ 
                      stroke: 'hsl(var(--primary))', 
                      strokeWidth: 2, 
                      r: 6, 
                      fill: 'hsl(var(--background))' 
                    }}
                    animationDuration={800}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="border border-[#E9EAEB] md:col-span-4 flex flex-col">
          <CardHeader className="items-center pb-0">
            <CardTitle className="text-base font-medium">Chain Allocation</CardTitle>
            <p className="text-xs text-muted-foreground">
              {authenticated && wallets.length > 0 
                ? "Shows your token allocation across multiple chains" 
                : "Connect wallet to see your chain allocation"}
            </p>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[250px]"
            >
              <PieChart>
                <Pie 
                  data={chainAllocation.filter(item => item.value > 0)} 
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  fill="#8884d8"
                >
                  {chainAllocation.filter(item => item.value > 0).map((entry) => (
                    <Cell key={`cell-${entry.chain}`} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="chain" />}
                  className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
                />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Token Allocation Table */}
      <Card className="border border-[#E9EAEB]">
        <CardHeader>
          <CardTitle className="text-base font-medium">Token Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price (24h)</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Share</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokenAllocationData.map((token, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{token.name}</TableCell>
                  <TableCell>{token.price}</TableCell>
                  <TableCell>{token.amount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className="bg-primary h-2.5 rounded-full" 
                          style={{ width: token.share }}
                        ></div>
                      </div>
                      {token.share}
                    </div>
                  </TableCell>
                  <TableCell>{token.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}