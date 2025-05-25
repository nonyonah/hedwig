'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuthCallback() {
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

        // Always redirect to overview for Google OAuth users
        router.replace('/overview');
      } catch (error) {
        console.error('Error:', error);
        router.replace('/login');
      }
    }

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Signing you in...</h2>
        <p className="text-gray-500">Please wait while we complete the process.</p>
      </div>
    </div>
  );
}