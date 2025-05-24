'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircleArrowUp, CircleStop, RefreshCw, Copy, ThumbsUp, ThumbsDown, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { UserAvatar } from '@/components/UserAvatar';
import { User } from '@supabase/supabase-js';
import { getSession } from '@/lib/supabase';
import Image from 'next/image';

export default function DashboardPage() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [displayedResponse, setDisplayedResponse] = useState('');
  const [fullResponse, setFullResponse] = useState(
    "Building an AI agent involves several key components and decisions. Here&apos;s a practical breakdown:\n\nCore Architecture\n\nAgent Framework: Start with the basic loop - perception, reasoning, and action. Your agent needs to:\n- Receive inputs (text, data, API responses)\n- Process and reason about those inputs\n- Take actions based on its reasoning\n- Learn from the results"
  );
  const [user, setUser] = useState<User | null>(null);
  const [greeting, setGreeting] = useState('Good day');

  useEffect(() => {
    // Get time-based greeting
    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good morning';
      if (hour < 18) return 'Good afternoon';
      return 'Good evening';
    };
    
    setGreeting(getGreeting());
    
    // Load user data
    const loadUser = async () => {
      try {
        const { data: session } = await getSession();
        setUser(session?.user || null);
      } catch (error) {
        console.error('Error loading user:', error);
      }
    };
    
    loadUser();
  }, []);
  
  // Get user's first name
  const getFirstName = () => {
    if (!user) return '';
    
    // Try to get name from user metadata
    const fullName = user.user_metadata?.full_name || '';
    if (fullName) {
      return fullName.split(' ')[0];
    }
    
    // Fallback to email
    return user.email?.split('@')[0] || '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      setIsSubmitting(true);
      setShowResponse(true);
      setIsTyping(true);
      // Reset displayed response for new typing animation
      setDisplayedResponse('');
      
      // Here you would handle the actual submission logic
      // For example, when you get a response from your API:
      // setFullResponse(responseFromAPI);
      
      // For testing, you could set a mock response:
      setFullResponse("This is a new response based on your input: " + inputValue);
    }
  };

  const handleStop = () => {
    setIsSubmitting(false);
    setIsTyping(false);
    // Show full response immediately when stopped
    setDisplayedResponse(fullResponse);
  };

  // Typing animation effect
  useEffect(() => {
    if (isTyping && displayedResponse.length < fullResponse.length) {
      const timer = setTimeout(() => {
        setDisplayedResponse(fullResponse.substring(0, displayedResponse.length + 1));
      }, 20); // Adjust speed as needed
      return () => clearTimeout(timer);
    } else if (displayedResponse.length >= fullResponse.length) {
      setIsTyping(false);
      setIsSubmitting(false);
    }
  }, [isTyping, displayedResponse, fullResponse]);

  return (
    <div className="bg-white min-h-screen flex flex-col">
      {/* Simple header with logo and wallet button */}
      <header className="flex flex-col items-center w-full bg-white px-[108px]">
        <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between">
          <div className="flex items-center gap-x-8">
            <div className="font-bold text-xl">
              <Image src="/logo.png" alt="Albus Logo" width={80} height={40} priority />
            </div>
          </div>

          {/* Replace this line in the header section: */}
          <div className="flex items-center gap-4">
            <UserAvatar />
          </div>
        </div>
      </header>

      {showResponse ? (
        /* AI Response Screen */
        <div className="flex flex-col items-center w-full flex-grow relative" 
             style={{
               padding: '0 108px',
             }}>
          {/* Back button to return to homepage */}
          <div className="w-full max-w-[600px] mt-6 mb-2">
            <Button 
              variant="ghost" 
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 p-2"
              onClick={() => setShowResponse(false)}
            >
              <ArrowLeft size={16} />
              <span>Back to homepage</span>
            </Button>
          </div>
          
          {/* AI Response Content - Takes up most of the screen */}
          <div className="w-full max-w-[600px] flex-grow overflow-y-auto py-4">
            {/* User Query Bubble - Adaptive width based on content, no shadow */}
            <div className="mb-4 p-4 inline-block ml-auto"
                 style={{
                   borderRadius: '20px',
                   border: '1px solid var(--Gray-200, #E9EAEB)',
                   background: '#F2F1EF',
                   // Shadow removed
                 }}>
              <p>{inputValue}</p>
            </div>
            
            {/* AI Response - No bubble, directly on white background */}
            <div className="p-4 max-w-[80%]">
              {displayedResponse.split('\n').map((line, index) => {
                if (line.startsWith('- ')) {
                  return <li key={index} className="ml-6">{line.substring(2)}</li>;
                } else if (line.trim() === '') {
                  return <br key={index} />;
                } else {
                  return <p key={index} className={index > 0 ? "mt-2" : ""}>{line}</p>;
                }
              })}
              {isTyping && <span className="inline-block w-2 h-4 bg-gray-500 ml-1 animate-pulse">|</span>}
            </div>
            
            {/* Action Icons - 21px gap from AI response, 8px between icons */}
            <div className="flex items-center gap-[8px] mt-[21px]">
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <RefreshCw size={16} className="text-gray-600" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <Copy size={16} className="text-gray-600" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <ThumbsUp size={16} className="text-gray-600" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full p-2">
                <ThumbsDown size={16} className="text-gray-600" />
              </Button>
            </div>
          </div>
          
          {/* Chat input fixed at the bottom */}
          <div className="w-full max-w-[600px] sticky bottom-8 mb-8">
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
        <div className="flex flex-col items-center px-[108px] transition-all duration-500" 
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
          {/* In the main content area, update the greeting */}
          <div className="text-center max-w-[600px]">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{greeting}, {getFirstName()}</h1>
            <p className="text-gray-600">How can I help you today?</p>
          </div>
          
          {/* Chat input box with soft borders and shadows */}
          <div className="w-full max-w-[600px] relative">
            <Input 
              type="text" 
              placeholder="Ask anything..." 
              className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent h-[74px] transition-all duration-300"
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
          
          {/* Action buttons - 16px gap from chatbox */}
          <div className="flex flex-wrap justify-center gap-x-[16px] mt-[16px]">
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
