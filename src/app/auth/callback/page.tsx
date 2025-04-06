'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Handle the OAuth callback
    const handleAuthCallback = async () => {
      try {
        // Get the session to check if the user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // User is authenticated, redirect to account connection page
          router.push('/auth/account-connection');
        } else {
          // If no session, redirect to sign in page
          router.push('/auth/signin');
        }
      } catch (error) {
        console.error('Error in auth callback:', error);
        // On error, redirect to sign in page
        router.push('/auth/signin');
      }
    };

    handleAuthCallback();
  }, [router]);

  // Return null instead of showing a loading screen
  // This makes the page invisible while the redirect happens
  return null;
}