'use client';

import { useState, useRef, useEffect } from "react";
import { Clock, Copy, RotateCcw, ThumbsDown, Share2, Send, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface AlbusChatProps {
  initialMessage?: string;
}

export default function AlbusChat({ initialMessage }: AlbusChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(!!initialMessage);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (initialMessage) {
      handleSendMessage(initialMessage, true);
    }
  }, [initialMessage]);

  const handleSendMessage = async (message: string, isInitial = false) => {
    if (!message.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      text: message,
      isUser: true,
      timestamp: new Date(),
    };

    if (!isInitial) {
      setMessages(prev => [...prev, userMessage]);
      setInputValue("");
    }

    setIsLoading(true);
    if (isInitial) setIsInitialLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          type: 'web_interface'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        const aiMessage: Message = {
          id: `ai_${Date.now()}`,
          text: data.message || 'I processed your request successfully.',
          isUser: false,
          timestamp: new Date(),
        };

        if (isInitial) {
          setMessages([userMessage, aiMessage]);
        } else {
          setMessages(prev => [...prev, aiMessage]);
        }
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        text: 'Sorry, I encountered an error processing your request. Please try again.',
        isUser: false,
        timestamp: new Date(),
      };

      if (isInitial) {
        setMessages([userMessage, errorMessage]);
      } else {
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputValue);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getCurrentGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#414651]" />
          <p className="text-[#414651]">Processing your request...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[#e9eaeb] bg-[#ffffff]">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-[#414651] hover:bg-[#f2f1ef]"
            onClick={() => router.push('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-[#0a0d12] font-medium text-lg">albus.</div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-[#414651] hover:bg-[#f2f1ef]">
            <Clock className="h-5 w-5" />
          </Button>
          <Button 
            variant="outline" 
            className="text-[#0a0d12] border-[#d5d7da] hover:bg-[#f2f1ef] bg-transparent"
            onClick={() => router.push('/wallet')}
          >
            Wallet
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 pt-20 pb-32">
        {messages.length === 0 ? (
          <div className="text-center py-20">
            <h1 className="text-2xl font-medium text-[#0a0d12] mb-2">
              {getCurrentGreeting()}, User
            </h1>
            <p className="text-[#414651]">Start a conversation with your AI assistant</p>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((message, index) => (
              <div key={message.id} className={`${message.isUser ? 'text-right' : 'text-left'}`}>
                {message.isUser ? (
                  <div className="inline-block bg-[#f2f1ef] px-4 py-2 rounded-lg text-[#0a0d12] max-w-[80%]">
                    {message.text}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-[#0a0d12] space-y-4 max-w-[90%]">
                      <div className="whitespace-pre-wrap">{message.text}</div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8"
                        onClick={() => handleSendMessage(messages[index - 1]?.text || '', false)}
                        title="Regenerate response"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8"
                        onClick={() => copyToClipboard(message.text)}
                        title="Copy response"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8"
                        title="Thumbs down"
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8"
                        onClick={() => {
                          if (navigator.share) {
                            navigator.share({
                              title: 'Albus AI Response',
                              text: message.text,
                            });
                          } else {
                            copyToClipboard(message.text);
                          }
                        }}
                        title="Share response"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="text-left">
                <div className="inline-flex items-center gap-2 bg-[#f2f1ef] px-4 py-2 rounded-lg text-[#414651]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 bg-[#ffffff] border-t border-[#e9eaeb]">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask anything..."
              className="w-full h-[74px] pr-12 text-[#414651] placeholder:text-[#414651] border-[#d5d7da] focus:border-[#0a0d12] bg-[#ffffff] rounded-xl"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#0a0d12] hover:bg-[#181d27] text-white rounded-full h-8 w-8 disabled:opacity-50"
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
