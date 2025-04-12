'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState('weekly');

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Hi Nonso</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline" className="bg-purple-100 hover:bg-purple-200">Base</Button>
          <Button variant="default" className="bg-purple-600 hover:bg-purple-700">Connected</Button>
        </div>
      </div>
      <p className="text-muted-foreground">Here's a comprehensive view of your accounts and wallets</p>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pnl">PnL</TabsTrigger>
          <TabsTrigger value="bank-assets">Bank Assets</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Net Worth</CardTitle>
                <div className="rounded bg-red-100 px-2 py-1 text-xs text-red-600">-10%</div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">45,823</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Token Worth</CardTitle>
                <div className="rounded bg-red-100 px-2 py-1 text-xs text-red-600">-10%</div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">45,823</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bank Balances</CardTitle>
                <div className="rounded bg-red-100 px-2 py-1 text-xs text-red-600">-10%</div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">45,823</div>
                <p className="text-xs text-muted-foreground">$1,873 last year</p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Total Net Worth</CardTitle>
                  <select 
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <CardDescription>Shows your total net worth on and off-chain</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  {/* This would be replaced with a real chart component */}
                  <div className="h-full w-full rounded-md bg-purple-100 flex items-center justify-center">
                    <p className="text-purple-600">Net Worth Chart (Line Chart)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Chain Allocation</CardTitle>
                <CardDescription>Shows your token allocation across multiple chains</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  {/* This would be replaced with a real chart component */}
                  <div className="h-full w-full rounded-md bg-purple-50 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-purple-600">Pie Chart</p>
                      <p className="text-xs text-muted-foreground">Base: 28%</p>
                      <p className="text-xs text-muted-foreground">Optimism: 72%</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Bank Balance</CardTitle>
              <CardDescription>Shows your token allocation across multiple chains</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center">
                  <div className="mr-2 h-8 w-8 rounded-full bg-red-500 flex items-center justify-center text-white">GT</div>
                  <div className="flex-1">GT Bank</div>
                  <div>₦2,500</div>
                </div>
                <div className="flex items-center">
                  <div className="mr-2 h-8 w-8 rounded-full bg-purple-800 flex items-center justify-center text-white">K</div>
                  <div className="flex-1">Kuda Bank</div>
                  <div>₦2,500</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Token Allocation</CardTitle>
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
                  <TableRow>
                    <TableCell className="font-medium">
                      <div>
                        <div>CARV</div>
                        <div className="text-xs text-muted-foreground">Base</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>$0.323</div>
                        <div className="text-xs text-red-600">14.06%</div>
                      </div>
                    </TableCell>
                    <TableCell>0.0100</TableCell>
                    <TableCell>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: '60%' }}></div>
                      </div>
                      <div className="text-xs mt-1">60.20%</div>
                    </TableCell>
                    <TableCell>$0.0023</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit and Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <p>PnL content will go here</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="bank-assets">
          <Card>
            <CardHeader>
              <CardTitle>Bank Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Bank assets content will go here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}