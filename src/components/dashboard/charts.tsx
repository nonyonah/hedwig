'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, ArrowDown } from 'lucide-react';
import { useState } from 'react';
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

// Sample data for the line chart
const lineChartData = [
  { name: 'Mon', value: 4000 },
  { name: 'Tue', value: 3000 },
  { name: 'Wed', value: 5000 },
  { name: 'Thu', value: 2780 },
  { name: 'Fri', value: 1890 },
  { name: 'Sat', value: 2390 },
  { name: 'Sun', value: 3490 },
];

// Sample data for the pie chart
const pieChartData = [
  { name: 'Base', value: 28 },
  { name: 'Optimism', value: 72 },
];

// Sample data for the token allocation table
const tokenAllocationData = [
  { name: 'CARV', price: '$0.323', amount: '0.0100', share: '60.20%', value: '$0.0023', base: 'Base' },
  { name: 'ETH', price: '$3,245.78', amount: '0.0050', share: '25.30%', value: '$16.23', base: 'Optimism' },
  { name: 'USDC', price: '$1.00', amount: '14.50', share: '14.50%', value: '$14.50', base: 'Base' },
];

// Colors for the pie chart
const COLORS = ['#7F56D9', '#E9D5FF'];

export function DashboardCharts() {
  const [timeframe, setTimeframe] = useState('Weekly');

  return (
    <div className="space-y-6">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="h-[150px]">
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
        <Card className="h-[150px]">
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
        <Card className="h-[150px]">
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
              <CardTitle className="text-base font-medium">Total Net Worth</CardTitle>
              <p className="text-xs text-muted-foreground">Shows your total net worth on and off-chain</p>
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
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={lineChartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9EAEB" vertical={false} />
                  <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#7F56D9"
                    strokeWidth={2}
                    dot={{ r: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="border border-[#E9EAEB] md:col-span-4">
          <CardHeader>
            <CardTitle className="text-base font-medium">Chain Allocation</CardTitle>
            <p className="text-xs text-muted-foreground">Shows your token allocation across multiple chains</p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
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