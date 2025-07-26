'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AlbusInterface() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    try {
      // Here we'll integrate with the agent API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: query,
          type: 'web_interface'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Handle the response - for now, we'll show an alert
        // In the future, this could navigate to a chat interface or show results
        alert(`Agent response: ${data.message || 'Request processed successfully'}`);
      } else {
        throw new Error('Failed to process request');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Sorry, there was an error processing your request. Please try again.');
    } finally {
      setIsLoading(false);
      setQuery("");
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'Create Invoice':
        setQuery("Create an invoice");
        break;
      case 'View Summary':
        setQuery("Show me my earnings summary");
        break;
      case 'Send Reminder':
        setQuery("Send payment reminder");
        break;
      case 'Swap':
        setQuery("I want to swap tokens");
        break;
      default:
        break;
    }
  };

  const getCurrentGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-[#ffffff]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="text-lg font-medium text-[#000000]">albus.</div>
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[#535862]" />
          <Button
            variant="outline"
            className="w-[106px] h-10 text-[#535862] hover:bg-[#e9eaeb] border-[#d5d7da] bg-transparent rounded-lg"
            onClick={() => router.push('/wallet')}
          >
            Wallet
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center px-6 pt-20">
        {/* Greeting Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-medium text-[#000000] mb-2">
            {getCurrentGreeting()}, User
          </h1>
          <p className="text-[#535862] text-lg">How can I help you today?</p>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSubmit} className="relative w-full max-w-2xl mb-8">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything..."
            className="w-full h-14 px-6 pr-14 text-lg border-[#d5d7da] rounded-xl bg-[#ffffff] placeholder:text-[#535862] focus:border-[#d5d7da] focus:ring-1 focus:ring-[#d5d7da]"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 top-2 h-10 w-10 rounded-full bg-[#535862] hover:bg-[#414651] text-white disabled:opacity-50"
            disabled={!query.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {['Create Invoice', 'View Summary', 'Send Reminder', 'Swap'].map((action) => (
            <Button
              key={action}
              variant="outline"
              className="w-[117px] h-8 px-6 py-2 rounded-full border-[#d5d7da] text-[#262624] hover:bg-[#e9eaeb] hover:border-[#d5d7da] bg-transparent text-sm"
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
            >
              {action}
            </Button>
          ))}
        </div>

        {/* Status Message */}
        {isLoading && (
          <div className="mt-8 text-center">
            <p className="text-[#535862] text-sm">Processing your request...</p>
          </div>
        )}
      </main>
    </div>
  );
}
