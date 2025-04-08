'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// Re-add Supabase imports
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simplified callback handler without Supabase
    const handleAuthCallback = async () => {
      try {
        // Check if OAuth error is present in URL
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        if (errorParam) {
          toast.error(`OAuth Error: ${errorDescription || errorParam}`);
          router.push('/auth/signin');
          return;
        }

        // Check for auth code from URL
        const code = searchParams.get('code');
        if (!code) {
          toast.error('Authentication code missing from callback.');
          router.push('/auth/signin');
          return;
        }
        
        // Exchange the code for a session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          toast.error(`Session exchange failed: ${exchangeError.message}`);
          router.push('/auth/signin');
          return;
        }
        
        // Get the session again to be sure and get user ID
        // Destructure data, then access data.session
        const { data, error: sessionError } = await supabase.auth.getSession();
        const session = data.session; // Extract session from data object

        if (sessionError || !session) {
          toast.error(`Failed to retrieve session: ${sessionError?.message || 'No session found.'}`);
          router.push('/auth/signin');
          return;
        }
        
        // Check if a profile exists for this user
        // The trigger should have created one, but we double-check
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id') // Only need to select 'id' or any column to check existence
          // Access session.user.id correctly now
          .eq('id', session.user.id)
          .maybeSingle(); // Use maybeSingle to handle null (no profile) gracefully

        if (profileError) {
          // Log error but proceed, maybe profile query failed temporarily
          console.error('Error checking profile:', profileError.message);
          // Decide redirect: dashboard might be okay if profile check fails sometimes
          // Or redirect to account-connection if profile is strictly needed first
          toast.warning("Couldn't verify profile, proceeding to dashboard.");
          router.push('/dashboard'); 
          return;
        }
        
        // Determine redirect based on profile existence
        if (profile) {
          // Profile exists (likely existing user or trigger worked)
          toast.success('Welcome back!');
          router.push('/dashboard');
        } else {
          // Profile does NOT exist (shouldn't happen if trigger works, but handle as new user)
          toast.info("Let's complete your setup.");
          router.push('/auth/account-connection');
        }

      } catch (err) {
        console.error('Auth callback error:', err);
        toast.error('Something went wrong during authentication.');
        router.push('/auth/signin');
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [router, searchParams]);

  return loading ? (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Processing login...
    </div>
  ) : null;
}