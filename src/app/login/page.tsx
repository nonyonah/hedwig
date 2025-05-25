'use client';

import { useState, useEffect } from 'react';
import { signInWithOAuth, getSession } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Check for existing session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: session, error } = await getSession();
        if (error) throw error;
        if (session) {
          router.replace('/overview');
        }
      } catch (error) {
        console.error('Error checking session:', error);
      }
    };
    
    checkSession();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithOAuth('google');
      // The redirect is handled by Supabase OAuth flow
    } catch (error) {
      console.error('Error signing in with Google:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-header">
        <div className="login-content">
          <div className="login-form">
            <div className="flex flex-col items-center gap-4 text-center">
              <Image
                src="/logo-light.svg"
                alt="Logo"
                width={48}
                height={48}
                priority
              />
              <h2 className="text-2xl font-semibold text-gray-900">Welcome to Albus</h2>
              <p className="text-gray-600 text-sm">Sign in with Google to continue</p>
            </div>
            <Button
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="google-button"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Connecting...
                </div>
              ) : (
                <>
                  <Image src="/google.svg" alt="Google" width={20} height={20} />
                  Sign in with Google
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}