'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AlbusChat from '@/components/AlbusChat';

function ChatContent() {
  const searchParams = useSearchParams();
  const initialMessage = searchParams?.get('message') || null;

  return <AlbusChat initialMessage={initialMessage || undefined} />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#ffffff] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#414651] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#414651]">Loading chat...</p>
        </div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}