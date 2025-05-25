'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleCallback = async () => {
      try {
        // Get code from URL
        const code = new URL(window.location.href).searchParams.get('code');

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          const { data: { session } } = await supabase.auth.getSession();

          // Check if user has completed onboarding
          const isNewUser = !session?.user?.user_metadata?.onboarded;
          
          if (isNewUser) {
            router.replace('/onboarding');
          } else {
            router.replace('/overview');
          }
        }
      } catch (error) {
        console.error('Error:', error);
        router.replace('/login');
      }
    };

    handleCallback();
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