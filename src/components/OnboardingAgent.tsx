'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, User, X } from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const initialMessages: Message[] = [
  {
    role: 'assistant',
    content: 'Hi there! I\'m your Albus assistant. I can help you set up your account, connect your wallet, or link your bank account. What would you like help with today?'
  }
];

export default function OnboardingAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');

  const handleSendMessage = () => {
    if (!input.trim()) return;
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    
    // Process the message and generate a response
    setTimeout(() => {
      let response = '';
      const lowerInput = input.toLowerCase();
      
      if (lowerInput.includes('wallet')) {
        response = 'To connect your wallet, click on the "Connect Existing Wallet" button. If you don\'t have a wallet, you can create a smart wallet by clicking "Create Smart Wallet". This will create a wallet that\'s easy to use and doesn\'t require you to remember a seed phrase.';
      } else if (lowerInput.includes('bank')) {
        response = 'To connect your Nigerian bank account, click on the "Connect Bank Account" button. This will open Mono Connect, which allows you to securely link your bank account. We only receive read access to your transactions and balance.';
      } else if (lowerInput.includes('help') || lowerInput.includes('how')) {
        response = 'I can help you with setting up your account, connecting your wallet, or linking your bank account. Just let me know what you need assistance with!';
      } else {
        response = 'I\'m here to help you set up your Albus account. Would you like to know more about connecting your wallet or linking your bank account?';
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    }, 1000);
    
    setInput('');
  };

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
            {messages.map((message, index) => (
              <div
                key={index}
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
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Ask me anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <Button onClick={handleSendMessage}>Send</Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}