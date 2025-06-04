'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, CircleStop, RefreshCw, Copy, ThumbsUp, ThumbsDown, ArrowLeft, LogOut, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DashboardPage() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [displayedResponse, setDisplayedResponse] = useState('');
  const [fullResponse, setFullResponse] = useState(
    "Building an AI agent involves several key components and decisions. Here&apos;s a practical breakdown:\n\nCore Architecture\n\nAgent Framework: Start with the basic loop - perception, reasoning, and action. Your agent needs to:\n- Receive inputs (text, data, API responses)\n- Process and reason about those inputs\n- Take actions based on its reasoning\n- Learn from the results"
  );
  const { ready, authenticated, user, logout, login } = usePrivy();
  const router = useRouter();
  const [greeting, setGreeting] = useState('Good day');

  type Invoice = { id: string; description: string; status: string; };

  // New state for wallet, clients, invoice, chain, and agent message
  const [walletBalance, setWalletBalance] = useState<string | null>(null);

  const [] = useState<Invoice | null>(null);
  const [] = useState<string | null>(null);
  const [] = useState(false);
  // Removed clientsLoading state
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  // Removed selectedChain and setShowChainModal state variables
  const [agentMessage] = useState<string | null>(null);

  useEffect(() => {
    // Get time-based greeting
    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good morning';
      if (hour < 18) return 'Good afternoon';
      return 'Good evening';
    };
    setGreeting(getGreeting());
  }, []);

  // Removed fetchClients useEffect

  // Get user's first name or part of wallet address
  const getDisplayName = () => {
    if (user?.wallet) {
      const address = user.wallet.address;
      if (address) {
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
      }
    }
    if (user?.email?.address) {
      return user.email.address.split('@')[0];
    }
    if (user?.google?.name) {
      return user.google.name.split(' ')[0];
    }
    return 'User';
  };

  const handleCopyAddress = () => {
    if (user?.wallet?.address) {
      navigator.clipboard.writeText(user.wallet.address);
    }
  };

  const handleDisconnect = async () => {
    await logout();
    router.push('/login');
  };

  const generateGradient = (address: string | undefined) => {
    if (!address) return 'linear-gradient(to right, #e0e0e0, #f5f5f5)';
    const hash = address
      .split('')
      .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) & 0xffffff, 0)
      .toString(16)
      .padStart(6, '0');
    const color1 = `#${hash.substring(0, 2)}88${hash.substring(2, 4)}`;
    const color2 = `#${hash.substring(4, 6)}AA${hash.substring(0, 2)}`;
    return `linear-gradient(to right, ${color1}, ${color2})`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Add this to your state variables at the top of the component
  const [messages, setMessages] = useState<Array<{type: 'user' | 'ai', content: string}>>([]);
  
  // Modify the handleSubmit function
  const handleSubmit = async () => {
    if (inputValue.trim()) {
      setIsSubmitting(true);
      setShowResponse(true);
      setIsTyping(true);
      setDisplayedResponse('');
      
      // Add user message to the chat
      const userMessage = inputValue;
      setMessages(prev => [...prev, {type: 'user', content: userMessage}]);
      
      // Clear input after sending
      setInputValue('');
      
      try {
        // Make API call to get AI response
        const response = await fetch('/api/gemini-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userMessage })
        });
        
        if (!response.ok) {
          throw new Error('Failed to get AI response');
        }
        
        const data = await response.json();
        const aiResponse = data.result || "Sorry, I couldn't generate a response.";
        setFullResponse(aiResponse);
        
        // Add AI response to the chat
        setMessages(prev => [...prev, {type: 'ai', content: aiResponse}]);
      } catch (error) {
        console.error('Error getting AI response:', error);
        setFullResponse("Sorry, there was an error processing your request.");
        
        // Add error message to the chat
        setMessages(prev => [...prev, {type: 'ai', content: "Sorry, there was an error processing your request."}]);
        setIsTyping(false);
        setIsSubmitting(false);
      }
    }
  };

  const handleStop = () => {
    setIsSubmitting(false);
    setIsTyping(false);
    setDisplayedResponse(fullResponse);
  };

  // Typing animation effect
  useEffect(() => {
    if (isTyping && displayedResponse.length < fullResponse.length) {
      const timer = setTimeout(() => {
        setDisplayedResponse(fullResponse.substring(0, displayedResponse.length + 1));
      }, 20);
      return () => clearTimeout(timer);
    } else if (displayedResponse.length >= fullResponse.length) {
      setIsTyping(false);
      setIsSubmitting(false);
    }
  }, [isTyping, displayedResponse, fullResponse]);


  // Handler for checking wallet balance (using Gemini)
  const handleCheckBalance = async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    if (!user?.wallet?.address) {
      setBalanceError('Wallet not connected');
      setBalanceLoading(false);
      return;
    }
    try {
      // First get the raw balance
      const res = await fetch(`/api/wallet-balance?address=${user.wallet.address}`);
      const { balance } = await res.json();
      setWalletBalance(balance);
      
      // Then get Gemini's analysis of the balance
      const analysisRes = await fetch('/api/gemini-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `I have ${balance}. What can you tell me about my balance?`,
          context: 'You are an AI assistant helping to analyze wallet balances. Provide insights on the following wallet balance.'
        })
      });
      const { result } = await analysisRes.json();
      setFullResponse(result);
      setShowResponse(true);
    } catch (error) {
      console.error('Error checking balance:', error);
      setBalanceError('Failed to fetch balance');
    } finally {
      setBalanceLoading(false);
    }
  };

  // Removed handleGenerateInvoice function

  // Mark invoice as paid

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p>Loading...</p>
      </div>
    );
  }

  if (ready && !authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Image src="/logo.png" alt="Albus Logo" width={120} height={60} priority className="mb-8" />
        <p className="text-xl mb-4">Please sign in to access the dashboard.</p>
        <Button onClick={login} className="flex items-center gap-2">
          <Wallet size={16} className="mr-1" />
          Sign In with Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen flex flex-col">
      <header className="flex flex-col items-center w-full bg-white px-[32px]">
        <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between">
          <div className="flex items-center gap-x-8">
            <div className="font-bold text-xl">
              <Image src="/logo.png" alt="Albus Logo" width={80} height={40} priority />
            </div>
          </div>
          <div className="flex items-center gap-4">
            {ready && authenticated && user?.wallet ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full mr-2"
                      style={{ background: generateGradient(user.wallet.address) }}
                    />
                    <span>{getDisplayName()}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-4 py-2 text-xs text-gray-500">
                    {balanceLoading
                      ? 'Loading balance...'
                      : balanceError
                      ? balanceError
                      : walletBalance
                      ? `Balance: ${walletBalance}`
                      : 'No balance'}
                  </div>
                  <DropdownMenuItem onClick={handleCheckBalance} className="cursor-pointer">
                    Check Balance
                  </DropdownMenuItem>
                  {/* Removed Swap Tokens dropdown menu item */}
                  <DropdownMenuItem onClick={handleCopyAddress} className="cursor-pointer">
                    <Copy size={14} className="mr-2" />
                    Copy address
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer">
                    <LogOut size={14} className="mr-2" />
                    Disconnect wallet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : ready && !authenticated ? (
              <Button variant="outline" onClick={login} className="flex items-center gap-2">
                <Wallet size={16} className="mr-1" />
                Sign In
              </Button>
            ) : (
              <div className="w-24 h-10 bg-gray-200 rounded animate-pulse"></div>
            )}
          </div>
        </div>
      </header>

      {agentMessage && (
        <div className="text-center text-sm text-purple-700 my-2">{agentMessage}</div>
      )}

      {showResponse ? (
        <div className="flex flex-col items-center w-full flex-grow relative px-[108px]">
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
          <div className="w-full max-w-[600px] flex-grow overflow-y-auto py-4" style={{ minHeight: 200 }}>
            <div className="flex flex-col gap-4 w-full">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-4 max-w-[80%] rounded-2xl border border-gray-200 shadow-sm ${msg.type === 'user' ? 'ml-auto bg-[#F2F1EF]' : 'mr-auto bg-[#E9EAEB]'}`}
                  style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', background: msg.type === 'ai' ? '#E9EAEB' : '#F2F1EF' }}
                >
                  {msg.content.split('\n').map((line, i) =>
                    line.startsWith('- ') ? (
                      <li key={i} className="ml-6">{line.substring(2)}</li>
                    ) : line.trim() === '' ? (
                      <br key={i} />
                    ) : (
                      <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
                    )
                  )}
                  {isTyping && idx === messages.length - 1 && msg.type === 'ai' && (
                    <span className="inline-block w-2 h-4 bg-gray-500 ml-1 animate-pulse">|</span>
                  )}
                </div>
              ))}
            </div>
            <Input
              type="text"
              placeholder="Ask anything..."
              className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent h-[74px] transition-all duration-300 bg-white shadow-sm break-words overflow-auto"
              style={{
                borderRadius: '10px',
                border: '1px solid var(--Gray-200, #E9EAEB)',
                transition: 'transform 0.3s ease-in-out',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word'
              }}
              value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputValue.trim()) handleSubmit();
              }
            }}
            disabled={isSubmitting}
          />
          <Button
            className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-md transition-colors duration-200 h-[58px] w-[58px] text-white bg-slate-800 hover:bg-slate-700"
            onClick={isSubmitting ? handleStop : handleSubmit}
            disabled={!inputValue.trim() && !isSubmitting}
          >
            {isSubmitting ? <CircleStop size={24} /> : <Send size={24} />}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center px-[108px] h-[688px] pt-[115px] gap-8 flex-shrink-0 self-stretch transition-all duration-500">
        <div className="text-center max-w-[600px]">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{greeting}</h1>
          <p className="text-gray-600">How can I help you today?</p>
        </div>
        <div className="w-full max-w-[600px] flex-grow overflow-y-auto py-4" style={{ minHeight: 200 }}>
          <div className="flex flex-col gap-4 w-full">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`p-4 max-w-[80%] rounded-2xl border border-gray-200 shadow-sm ${msg.type === 'user' ? 'ml-auto bg-[#F2F1EF]' : 'mr-auto bg-[#E9EAEB]'}`}
                style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
              >
                {msg.content.split('\n').map((line, i) =>
                  line.startsWith('- ') ? (
                    <li key={i} className="ml-6">{line.substring(2)}</li>
                  ) : line.trim() === '' ? (
                    <br key={i} />
                  ) : (
                    <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
                  )
                )}
                {isTyping && idx === messages.length - 1 && msg.type === 'ai' && (
                  <span className="inline-block w-2 h-4 bg-gray-500 ml-1 animate-pulse">|</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="w-full max-w-[600px] relative">
          <Input
            type="text"
            placeholder="Ask anything..."
            className="w-full py-4 px-6 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent h-[74px] transition-all duration-300 bg-white shadow-sm break-words overflow-auto"
            style={{
              borderRadius: '10px',
              border: '1px solid var(--Gray-200, #E9EAEB)',
              transition: 'transform 0.3s ease-in-out',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word'
            }}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputValue.trim()) handleSubmit();
              }
            }}
            disabled={isSubmitting}
          />
          <Button
            className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 rounded-md transition-colors duration-200 h-[58px] w-[58px] text-white bg-slate-800 hover:bg-slate-700"
            onClick={isSubmitting ? handleStop : handleSubmit}
            disabled={!inputValue.trim() && !isSubmitting}
          >
            {isSubmitting ? <CircleStop size={24} /> : <Send size={24} />}
          </Button>
        </div>
      </div>
    )}
  </div>
);
}