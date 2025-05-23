'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivyWalletButton } from '@/components/PrivyWalletButton';
import { CircleArrowUp, CircleStop } from 'lucide-react';
import { useState } from 'react';

export default function DashboardPage() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      setIsSubmitting(true);
      // Here you would handle the actual submission logic
      // For now, we're just toggling the icon state
    }
  };

  const handleStop = () => {
    setIsSubmitting(false);
    // Here you would handle stopping the submission
  };

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
        <div className="text-center max-w-[600px]">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Good evening, Nonso</h1>
          <p className="text-gray-600">How can I help you today?</p>
        </div>
        
        {/* Chat input box with soft borders and shadows - 32px gap from text above is handled by parent container */}
        <div className="w-full max-w-[600px] relative">
          <Input 
            type="text" 
            placeholder="Ask anything..." 
            className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent h-[74px]"
            style={{ boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)' }}
            value={inputValue}
            onChange={handleInputChange}
          />
          <Button 
            size="icon" 
            className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-transparent hover:bg-gray-100 rounded-full p-2"
            onClick={isSubmitting ? handleStop : handleSubmit}
            disabled={!inputValue.trim() && !isSubmitting}
          >
            {isSubmitting ? (
              <CircleStop 
                className="h-5 w-5" 
                fill="currentColor" 
                strokeWidth={0.5} 
              />
            ) : (
              <CircleArrowUp 
                className={`h-5 w-5 ${!inputValue.trim() ? 'text-gray-300' : 'text-gray-700'}`} 
                fill="currentColor" 
                strokeWidth={0.5} 
              />
            )}
          </Button>
        </div>
        
        {/* Action buttons - 21px gap from chatbox */}
        <div className="flex flex-wrap justify-center gap-x-[21px] mt-[21px]">
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
