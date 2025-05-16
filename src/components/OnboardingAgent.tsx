'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, X } from 'lucide-react';
import { useChat } from 'ai/react';
import { useUser } from '@/hooks/useUser';
import { useWalletConnection } from '@/hooks/useWalletConnection';

// 1. Remove or comment out the unused Message type
// type Message = {
//   role: 'user' | 'assistant';
//   content: string;
// };

// 2. Either remove SYSTEM_PROMPT or use it somewhere in the component
// If it's needed in the API route but not directly in this component,
// you can export it for use elsewhere:
export const SYSTEM_PROMPT = `
You're Albus, a smart AI onboarding agent for a web-based finance dashboard that tracks stablecoins and Nigerian bank accounts. Your job is to help users connect their wallet and bank in the simplest way possible.

Use this context:
- Users sign in using google or apple which also creates a smart wallet for them.
- Each user must have a smart wallet. If they don't, it should be automatically created using Thirdweb's embedded wallet SDK.
- Users also need to link their Nigerian bank account using Mono Connect.

Your goals:
- Welcome the user and explain that Albus tracks both on-chain and fiat money.
- Ensure they've logged in with email or Google.
- Check if their crypto wallet is connected. If not, offer to set it up instantly.
- Prompt the user to connect their bank account via Mono if they haven't already.
- Confirm when both wallet and bank are connected, and show them their dashboard.
- Provide financial insights by analyzing transaction patterns across both crypto and fiat accounts.
- Suggest budget improvements and highlight unusual transactions.

Be friendly, clear, and confident. Use short sentences and always offer a button or action to move forward, e.g. "Click 'Connect Wallet'" or "Tap 'Link My Bank'".

If they ask questions like "What is Mono?" or "Why do I need a wallet?", give simple, beginner-friendly explanations.
`;

// Update the component props to include pageContext
export default function OnboardingAgent({ 
  agentKit, 
  pageContext = 'other' 
}: { 
  agentKit: {
    id?: string;
    name?: string;
    [key: string]: unknown;
  }, // Replace 'any' with this interface
  pageContext?: 'overview' | 'signin' | 'other' 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useUser();
  const { address, isConnected, walletData, autoConnect } = useWalletConnection();
  const [bankConnected, setBankConnected] = useState(false);

  // Use the Vercel AI SDK's useChat hook with Coinbase Agent and page context
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: getWelcomeMessage(pageContext)
      }
    ],
    body: {
      // Pass user context to the API
      userContext: {
        isLoggedIn: !!user,
        hasWallet: isConnected,
        walletAddress: address || null,
        walletData: walletData || null,
        hasBankConnected: bankConnected,
        agent: agentKit, // Pass the Coinbase agent to the API
        pageContext // Pass the current page context
      }
    }
  });

  // Function to get context-aware welcome message
  function getWelcomeMessage(context: string) {
    switch(context) {
      case 'overview':
        return 'Welcome to your dashboard! I can help you understand your finances or assist with any questions about your accounts.';
      case 'signin':
        return 'Welcome to Albus! I can help you sign in and set up your account. Would you like to connect with Google, Apple, or an existing wallet?';
      default:
        return 'Hi there! I\'m your Albus assistant. How can I help you today?';
    }
  }

  // Function to handle wallet connection
  const handleConnectWallet = async () => {
    await autoConnect();
  };

  // Function to handle bank connection
  const handleConnectBank = async () => {
    // Implement Mono Connect logic here
    // After successful connection:
    setBankConnected(true);
  };

  // Quick action buttons for common tasks
  const quickActions = [
    { label: 'Connect Wallet', action: handleConnectWallet, show: !isConnected },
    { label: 'Link Bank Account', action: handleConnectBank, show: !bankConnected }
  ];

  return (
    <>
      {/* Chat button */}
      <Button
        className="fixed bottom-4 right-4 rounded-full w-12 h-12 p-0 shadow-lg"
        onClick={() => setIsOpen(true)}
      >
        <Bot size={24} />
      </Button>
      
      {/* Chat window */}
      {isOpen && (
        <Card className="fixed bottom-20 right-4 w-80 h-96 shadow-xl flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm font-medium">Albus Assistant</CardTitle>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-3 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    message.role === 'assistant'
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </CardContent>
          
          {/* Quick action buttons */}
          {quickActions.some(action => action.show) && (
            <div className="px-3 py-2 border-t border-b flex gap-2 overflow-x-auto">
              {quickActions.filter(action => action.show).map((action, index) => (
                <Button key={index} variant="outline" size="sm" onClick={action.action}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          
          <div className="p-3 border-t">
            <form 
              className="flex gap-2" 
              onSubmit={handleSubmit}
            >
              <Input
                placeholder="Ask me anything..."
                value={input}
                onChange={handleInputChange}
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading}>Send</Button>
            </form>
          </div>
        </Card>
      )}
    </>
  );
}