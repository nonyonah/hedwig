'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// Re-add Supabase imports
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { usePrivy } from '@privy-io/react-auth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const { authenticated } = usePrivy();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        if (!authenticated) {
          toast.error('Authentication failed');
          router.push('/auth/signin');
          return;
        }

        // Get the session from Supabase
        const { data, error: sessionError } = await supabase.auth.getSession();
        const session = data.session;

        if (sessionError || !session) {
          toast.error(`Failed to retrieve session: ${sessionError?.message || 'No session found.'}`);
          router.push('/auth/signin');
          return;
        }

        // Check if a profile exists for this user
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error checking profile:', profileError.message);
          toast.warning("Couldn't verify profile, proceeding to dashboard.");
          router.push('/dashboard');
          return;
        }

        if (profile) {
          toast.success('Welcome back!');
          router.push('/dashboard');
        } else {
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
  }, [router, authenticated]);

  return loading ? (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Processing login...
    </div>
  ) : null;
}