'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import LineChart from '@/components/dashboard/LineChart';
import ClientsTable from '@/components/dashboard/ClientsTable';
import MetricItem from '@/components/dashboard/MetricItem'; // Added import for MetricItem
import Header from '@/components/Header';


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
    status: "Paid" | "Unpaid" | "Overdue";
    lastPayment: string;
    walletAddress: string; // Changed 'id' to 'walletAddress' to match Client interface
  }[] = [
    { name: 'Olivia Rhye', lastInvoice: 'May 15, 2025', amountDue: '$420', status: 'Paid', lastPayment: 'Apr 10, 2025', walletAddress: '0x1480...9037' },
    { name: 'Phoenix Baker', lastInvoice: 'May 10, 2025', amountDue: '$420', status: 'Paid', lastPayment: 'May 12, 2025', walletAddress: '0xe880...0683' },
    { name: 'Lana Steiner', lastInvoice: 'Apr 28, 2025', amountDue: '$150', status: 'Unpaid', lastPayment: 'May 12, 2025', walletAddress: '0x8f47...8909' },
    { name: 'Demi Wilkinson', lastInvoice: 'Apr 28, 2025', amountDue: '$150', status: 'Overdue', lastPayment: 'Mar 30, 2025', walletAddress: '0x1c42...f589' },
  ];

  return (
    <div className="bg-white min-h-screen">
      {/* Top Header - Already includes conditional sub-navigation from previous changes */}
      <Header />
      
      {/* REMOVE Old Secondary Navigation - This section will be deleted */}
      {/* 
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
      */}

      <div className="container mx-auto px-[108px] py-8">
        {/* Header with welcome and actions */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, Nonso</h1>
            <p className="text-gray-600">Track and manage your clients and invoices.</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* REMOVE "Add Expense" Button - This button will be deleted 
            <Button variant="outline" className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50">
              <span className="flex items-center">
                Add Expense
              </span>
            </Button>
            */}
            <Button className="bg-purple-600 hover:bg-purple-700 text-white">
              <span className="flex items-center">
                <Plus className="mr-2 h-4 w-4" />
                Create Invoice
              </span>
            </Button>
          </div>
        </div>
        
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <MetricItem 
            title="Total Earned This Month"
            value="2,420"
            percentageChange={40} // Corrected to number
            isPositiveChange={true}
            comparisonPeriod="vs last month"
            // chartSrc="/path/to/your/chart-image.svg" // Optional: replace with actual chart image path
          />
          <MetricItem 
            title="Pending Invoices"
            value="1,210"
            percentageChange={10} // Corrected to number
            isPositiveChange={false}
            comparisonPeriod="vs last month"
            // chartSrc="/path/to/your/chart-image.svg" // Optional: replace with actual chart image path
          />
          <MetricItem 
            title="Expenses This Month"
            value="316"
            percentageChange={20} // Corrected to number
            isPositiveChange={true}
            comparisonPeriod="vs last month"
            // chartSrc="/path/to/your/chart-image.svg" // Optional: replace with actual chart image path
          />
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
