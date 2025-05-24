'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Exchange the code for a session
    const handleAuthCallback = async () => {
      try {
        // Get the code from the URL
        const code = new URL(window.location.href).searchParams.get('code');
        
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
        
        // Redirect to the overview page after successful authentication
        router.push('/overview');
      } catch (error) {
        console.error('Error handling auth callback:', error);
        // Redirect to login page if there's an error
        router.push('/login');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Signing you in...</h2>
        <p className="text-gray-500">Please wait while we complete the authentication process.</p>
      </div>
    </div>
  );
}