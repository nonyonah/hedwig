'use client';

import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import Image from 'next/image';
import AIResponse from '@/components/ai-response';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, LogOut, Wallet } from 'lucide-react';

export default function DashboardPage() {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<Array<{type: 'user' | 'ai', content: string}>>([]);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const appPrimaryColor = '#7A70FF';

  const { ready, authenticated, user, logout, login } = usePrivy();
  const router = useRouter();

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



  // Modify the handleSubmit function
  const handleSubmit = async () => {
    if (inputValue.trim()) {
      setIsSubmitting(true);
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
        setMessages(prev => [...prev, {type: 'ai', content: aiResponse}]);
      } catch (error) {
        console.error('Error getting AI response:', error);
        setMessages(prev => [...prev, {type: 'ai', content: "Sorry, there was an error processing your request."}]);
        setIsSubmitting(false);
      }
    }
  };

  const handleCheckBalance = async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    if (!user?.wallet?.address) {
      setBalanceError('Wallet not connected');
      setBalanceLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/wallet-balance?address=${user.wallet.address}`);
      const { balance } = await res.json();
      setWalletBalance(balance);
      const analysisRes = await fetch('/api/gemini-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `I have ${balance}. What can you tell me about my balance?`,
          context: 'You are an AI assistant helping to analyze wallet balances. Provide insights on the following wallet balance.'
        })
      });
      const { result } = await analysisRes.json();
      setMessages(prev => [...prev, {type: 'ai', content: result}]);
    } catch (error) {
      console.error('Error checking balance:', error);
      setBalanceError('Failed to fetch balance');
    } finally {
      setBalanceLoading(false);
    }
  };

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
          Sign in with Wallet
        </Button>
      </div>
    );
  }

  function handleStop(): void {
    throw new Error('Function not implemented.');
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

      <div className="flex flex-col justify-end items-center flex-grow w-full" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AIResponse
          messages={messages}
          isSubmitting={isSubmitting}
          onSend={handleSubmit}
          onStop={handleStop}
          inputValue={inputValue}
          setInputValue={setInputValue}
          appPrimaryColor={appPrimaryColor}
        />
      </div>
    </div>
  );
}