'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-background p-4">
      <header className="py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to your financial dashboard</p>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Summary</CardTitle>
              <CardDescription>Overview of your financial accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Your account details will appear here.</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your latest financial activities</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Your recent transactions will appear here.</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Crypto Portfolio</CardTitle>
              <CardDescription>Your cryptocurrency holdings</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Your crypto portfolio will appear here.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}