'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Plus } from 'lucide-react';
import LineChart from '@/components/dashboard/LineChart';
import ClientsTable from '@/components/dashboard/ClientsTable';

export default function DashboardPage() {
  // Mock data for the line chart
  const weeklyData = [
    { day: 'Mon', value: 1200 },
    { day: 'Tue', value: 1300 },
    { day: 'Wed', value: 1400 },
    { day: 'Thu', value: 1200 },
    { day: 'Fri', value: 1500 },
    { day: 'Sat', value: 1800 },
    { day: 'Sun', value: 2000 },
  ];

  // Mock client data
  const clients: {
    name: string;
    lastInvoice: string;
    amountDue: string;
    status: "Paid" | "Unpaid" | "Overdue"; // Ensure this line matches the expected type
    lastPayment: string;
    id: string;
  }[] = [
    { name: 'Olivia Rhye', lastInvoice: 'May 15, 2025', amountDue: '$420', status: 'Paid', lastPayment: 'Apr 10, 2025', id: '0x1480...9037' },
    { name: 'Phoenix Baker', lastInvoice: 'May 10, 2025', amountDue: '$420', status: 'Paid', lastPayment: 'May 12, 2025', id: '0xe880...0683' },
    { name: 'Lana Steiner', lastInvoice: 'Apr 28, 2025', amountDue: '$150', status: 'Unpaid', lastPayment: 'May 12, 2025', id: '0x8f47...8909' },
    { name: 'Demi Wilkinson', lastInvoice: 'Apr 28, 2025', amountDue: '$150', status: 'Overdue', lastPayment: 'Mar 30, 2025', id: '0x1c42...f589' },
  ];

  return (
    <div className="bg-gray-50">
      {/* Secondary Navigation */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <nav className="flex space-x-6">
            <Link href="/overview" className="py-4 border-b-2 border-purple-600 font-medium text-gray-900">
              Overview
            </Link>
            <Link href="/clients" className="py-4 border-b-2 border-transparent font-medium text-gray-600 hover:text-gray-900">
              Clients
            </Link>
          </nav>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input 
              type="search" 
              placeholder="Search" 
              className="h-10 w-64 rounded-md border border-gray-300 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" 
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Header with welcome and actions */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, Nonso</h1>
            <p className="text-gray-600">Track and manage your clients and invoices.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50">
              <span className="flex items-center">
                Add Expense
              </span>
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white">
              <span className="flex items-center">
                <Plus className="mr-2 h-4 w-4" />
                Create Invoice
              </span>
            </Button>
          </div>
        </div>
        
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Earned Card */}
          <Card className="bg-white border-gray-200 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Total Earned This Month</h3>
                  <p className="text-3xl font-bold mt-1">2,420</p>
                  <div className="flex items-center mt-1">
                    <span className="flex items-center text-green-500 text-sm">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1">
                        <path d="M6 2.5V9.5M6 2.5L9 5.5M6 2.5L3 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      40%
                    </span>
                    <span className="text-gray-500 text-sm ml-1">vs last month</span>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3V3.01M8 8V8.01M8 13V13.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <div className="h-10">
                <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 30 C10 15, 20 10, 30 20 S50 25, 60 15 S80 0, 100 10 L100 30 Z" fill="rgba(34, 197, 94, 0.1)"/>
                  <path d="M0 30 C10 15, 20 10, 30 20 S50 25, 60 15 S80 0, 100 10" fill="none" stroke="#22c55e" strokeWidth="2"/>
                </svg>
              </div>
            </CardContent>
          </Card>
          
          {/* Pending Invoices Card */}
          <Card className="bg-white border-gray-200 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Pending Invoices</h3>
                  <p className="text-3xl font-bold mt-1">1,210</p>
                  <div className="flex items-center mt-1">
                    <span className="flex items-center text-red-500 text-sm">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1">
                        <path d="M6 9.5V2.5M6 9.5L3 6.5M6 9.5L9 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      10%
                    </span>
                    <span className="text-gray-500 text-sm ml-1">vs last month</span>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3V3.01M8 8V8.01M8 13V13.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <div className="h-10">
                <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 10 C20 20, 40 30, 60 20 S80 0, 100 10 L100 30 L0 30 Z" fill="rgba(239, 68, 68, 0.1)"/>
                  <path d="M0 10 C20 20, 40 30, 60 20 S80 0, 100 10" fill="none" stroke="#ef4444" strokeWidth="2"/>
                </svg>
              </div>
            </CardContent>
          </Card>
          
          {/* Expenses Card */}
          <Card className="bg-white border-gray-200 overflow-hidden">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Expenses This Month</h3>
                  <p className="text-3xl font-bold mt-1">316</p>
                  <div className="flex items-center mt-1">
                    <span className="flex items-center text-green-500 text-sm">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1">
                        <path d="M6 2.5V9.5M6 2.5L9 5.5M6 2.5L3 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      20%
                    </span>
                    <span className="text-gray-500 text-sm ml-1">vs last month</span>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-gray-500">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3V3.01M8 8V8.01M8 13V13.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <div className="h-10">
                <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 30 C10 15, 20 10, 30 20 S50 25, 60 15 S80 0, 100 10 L100 30 Z" fill="rgba(34, 197, 94, 0.1)"/>
                  <path d="M0 30 C10 15, 20 10, 30 20 S50 25, 60 15 S80 0, 100 10" fill="none" stroke="#22c55e" strokeWidth="2"/>
                </svg>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Line Chart Component */}
        <LineChart 
          data={weeklyData} 
          title="Total Earned This Month" 
          description="Shows what you earned this month" 
        />
        
        {/* Clients Table Component */}
        <ClientsTable clients={clients} />
      </div>
    </div>
  );
}
