'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivyWalletButton } from '@/components/PrivyWalletButton';
import { CircleArrowUp, CircleStop } from 'lucide-react';
import { useState } from 'react';

export default function DashboardPage() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      setIsSubmitting(true);
      setShowResponse(true);
      // Here you would handle the actual submission logic
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

      {showResponse ? (
        /* AI Response Screen */
        <div className="flex flex-col items-center w-full" 
             style={{
               display: 'flex',
               padding: '128px 403px 64px 404px',
               flexDirection: 'column',
               justifyContent: 'flex-end',
               alignItems: 'center',
               gap: '435px',
               alignSelf: 'stretch'
             }}>
          {/* AI Response Content */}
          <div className="w-full max-w-[600px]">
            {/* User Query Bubble */}
            <div className="mb-4 p-4 max-w-[80%] ml-auto"
                 style={{
                   borderRadius: '20px',
                   border: '1px solid var(--Gray-200, #E9EAEB)',
                   background: '#F2F1EF',
                   boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
                 }}>
              <p>{inputValue}</p>
            </div>
            
            {/* AI Response Bubble */}
            <div className="p-4 max-w-[80%]"
                 style={{
                   borderRadius: '10px',
                   border: '1px solid var(--Gray-200, #E9EAEB)',
                   background: 'var(--White, #FFF)',
                   boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
                 }}>
              <p>Building an AI agent involves several key components and decisions. Here&apos;s a practical breakdown:</p>
              <p className="mt-2">Core Architecture</p>
              <p className="mt-2">Agent Framework: Start with the basic loop - perception, reasoning, and action. Your agent needs to:</p>
              <ul className="list-disc pl-6 mt-2">
                <li>Receive inputs (text, data, API responses)</li>
                <li>Process and reason about those inputs</li>
                <li>Take actions based on its reasoning</li>
                <li>Learn from the results</li>
              </ul>
            </div>
            
            {/* Action Icons - 16px gap from AI response */}
            <div className="flex items-center gap-4 mt-4">
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 18.3333C14.6024 18.3333 18.3334 14.6024 18.3334 10C18.3334 5.39763 14.6024 1.66667 10 1.66667C5.39765 1.66667 1.66669 5.39763 1.66669 10C1.66669 14.6024 5.39765 18.3333 10 18.3333Z" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 13.3333V10" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 6.66667H10.0083" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16.6667 5L7.50002 14.1667L3.33335 10" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.8333 10H4.16669" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 4.16667V15.8333" stroke="#667085" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
            </div>
          </div>
          
          {/* Chat input at the bottom */}
          <div className="w-full max-w-[600px] relative">
            <Input 
              type="text" 
              placeholder="Ask anything..." 
              className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent h-[74px]"
              style={{ 
                borderRadius: '10px',
                border: '1px solid var(--Gray-200, #E9EAEB)',
                background: 'var(--White, #FFF)',
                boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)' 
              }}
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
        </div>
      ) : (
        /* Main content area with chat interface */
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
          
          {/* Chat input box with soft borders and shadows */}
          <div className="w-full max-w-[600px] relative">
            <Input 
              type="text" 
              placeholder="Ask anything..." 
              className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent h-[74px]"
              style={{ 
                borderRadius: '10px',
                border: '1px solid var(--Gray-200, #E9EAEB)',
                background: 'var(--White, #FFF)',
                boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)' 
              }}
              value={inputValue}
              onChange={handleInputChange}
            />
            <Button 
              size="icon" 
              className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-transparent hover:bg-gray-100 rounded-full p-2"
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
            >
              <CircleArrowUp 
                className={`h-5 w-5 ${!inputValue.trim() ? 'text-gray-300' : 'text-gray-700'}`} 
                fill="currentColor" 
                strokeWidth={0.5} 
              />
            </Button>
          </div>
          
          {/* Action buttons - 16px gap from chatbox (changed from 21px) */}
          <div className="flex flex-wrap justify-center gap-x-[21px] mt-[16px]">
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
      )}
    </div>
  );
}
