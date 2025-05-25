'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.hash.substring(1)
        );

        if (error) throw error;

        // Get the session to confirm authentication
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // Successful authentication, redirect to overview
          router.replace('/overview');
        } else {
          throw new Error('No session available after authentication');
        }
      } catch (error) {
        console.error('Auth error:', error);
        router.replace('/login');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}