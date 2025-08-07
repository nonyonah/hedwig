import { useState, useEffect } from 'react';

export interface ChatHistoryItem {
  id: string;
  query: string;
  response: string;
  timestamp: Date;
}

export const useChatHistory = (userId?: string) => {
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Load chat history from localStorage
  useEffect(() => {
    if (userId) {
      const stored = localStorage.getItem(`chat_history_${userId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setChatHistory(parsed.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          })));
        } catch (error) {
          console.error('Error parsing chat history:', error);
        }
      }
    }
  }, [userId]);

  // Save chat history to localStorage
  const saveChatHistory = (history: ChatHistoryItem[]) => {
    if (userId) {
      localStorage.setItem(`chat_history_${userId}`, JSON.stringify(history));
    }
  };

  // Add new chat item
  const addChatItem = (query: string, response: string) => {
    const newItem: ChatHistoryItem = {
      id: Date.now().toString(),
      query,
      response,
      timestamp: new Date()
    };

    const updatedHistory = [newItem, ...chatHistory].slice(0, 50); // Keep only last 50 items
    setChatHistory(updatedHistory);
    saveChatHistory(updatedHistory);
  };

  // Clear chat history
  const clearChatHistory = () => {
    setChatHistory([]);
    if (userId) {
      localStorage.removeItem(`chat_history_${userId}`);
    }
  };

  // Get recent chat items (for dropdown)
  const getRecentChats = (limit: number = 10) => {
    return chatHistory.slice(0, limit);
  };

  return {
    chatHistory,
    loading,
    addChatItem,
    clearChatHistory,
    getRecentChats
  };
};