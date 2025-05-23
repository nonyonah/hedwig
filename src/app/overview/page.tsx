'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivyWalletButton } from '@/components/PrivyWalletButton';

export default function DashboardPage() {
  return (
    <div className="bg-white min-h-screen">
      {/* Simple header with logo and wallet button */}
      <header className="flex flex-col items-center w-full bg-white px-[108px]">
        <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between">
          <div className="flex items-center gap-x-8">
            <div className="font-bold text-xl">albus</div>
          </div>

          <div className="flex items-center gap-4">
            <PrivyWalletButton />
          </div>
        </div>
      </header>

      {/* Main content area with chat interface */}
      <div className="flex flex-col items-center px-[108px]" 
           style={{
             display: 'flex',
             height: '688px',
             paddingTop: '115px',
             flexDirection: 'column',
             alignItems: 'center',
             gap: '32px',
             flexShrink: 0,
             alignSelf: 'stretch'
           }}>
        <div className="text-center max-w-[600px] mb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Good evening, Nonso</h1>
          <p className="text-gray-600">How can I help you today?</p>
        </div>
        
        {/* Chat input box with soft borders and shadows */}
        <div className="w-full max-w-[600px] relative">
          <Input 
            type="text" 
            placeholder="Ask anything..." 
            className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            style={{ boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)' }}
          />
          <Button 
            size="icon" 
            className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-transparent hover:bg-gray-100 rounded-full p-2"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 18.3333C14.6024 18.3333 18.3334 14.6024 18.3334 10C18.3334 5.39763 14.6024 1.66667 10 1.66667C5.39765 1.66667 1.66669 5.39763 1.66669 10C1.66669 14.6024 5.39765 18.3333 10 18.3333Z" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 13.3333V10" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 6.66667H10.0083" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
        </div>
        
        {/* Action buttons */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
            Create Invoice
          </Button>
          <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
            View Summary
          </Button>
          <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
            Send Reminder
          </Button>
          <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
            Swap
          </Button>
        </div>
      </div>
    </div>
  );
}
