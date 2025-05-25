'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithOAuth, getSession } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    async function checkSession() {
      try {
        const { data: session } = await getSession();
        if (session?.user) {
          // User is already logged in, redirect to overview
          router.replace('/overview');
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Email sign in logic here
      // After successful sign in, user will be redirected by Supabase
    } catch (error) {
      console.error('Error signing in with email:', error);
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithOAuth('google');
      // The redirect is handled by Supabase OAuth flow
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="flex flex-col items-center w-full bg-white px-[32px]">
        <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between">
          <div className="flex items-center gap-x-8">
            <div>
              <Image src="/logo.png" alt="Albus Logo" width={80} height={40} priority />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center">
          <h1 className="text-2xl font-semibold text-center mb-2">Log into your account</h1>
          <p className="text-gray-500 text-center mb-8">Let Albus handle the numbers while you focus on the work.</p>

          <Button 
            variant="outline" 
            className="w-full mb-6 flex items-center justify-center gap-2 text-[#1F1F1F] hover:bg-gray-50"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: '448px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              background: 'white',
              boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.8055 10.2275C19.8055 9.51764 19.7516 8.83471 19.6363 8.17188H10.2002V11.8886H15.6016C15.3787 13.0907 14.6571 14.1046 13.5964 14.7715V17.1813H16.7923C18.6896 15.4613 19.8055 13.0676 19.8055 10.2275Z" fill="#4285F4"/>
              <path d="M10.2002 20C12.897 20 15.1714 19.1188 16.7923 17.1813L13.5964 14.7715C12.7077 15.3642 11.5534 15.7031 10.2002 15.7031C7.5793 15.7031 5.34235 13.9831 4.55927 11.6H1.26172V14.0868C2.87502 17.5431 6.30341 20 10.2002 20Z" fill="#34A853"/>
              <path d="M4.55927 11.6C4.36927 11.0073 4.26235 10.3765 4.26235 9.72313C4.26235 9.06979 4.36927 8.43896 4.55927 7.84625V5.35938H1.26172C0.57079 6.67188 0.179688 8.15417 0.179688 9.72313C0.179688 11.2921 0.57079 12.7744 1.26172 14.0869L4.55927 11.6Z" fill="#FBBC05"/>
              <path d="M10.2002 3.74375C11.6804 3.74375 12.9963 4.24167 14.0339 5.22292L16.8964 2.36042C15.1714 0.754167 12.897 -0.03125 10.2002 -0.03125C6.30341 -0.03125 2.87502 2.42562 1.26172 5.88188L4.55927 8.36875C5.34235 6.01354 7.5793 4.29354 10.2002 4.29354V3.74375Z" fill="#EA4335"/>
            </svg>
            <span className="ml-2">Continue with Google</span>
          </Button>

          <div className="w-full">
            <p className="text-sm font-medium mb-2">Email</p>
            <form onSubmit={handleEmailSignIn} className="w-full">
              <Input 
                type="email" 
                placeholder="Type your email" 
                className="w-full mb-4 px-4" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '448px',
                  height: '36px',
                  borderRadius: '8px',
                  border: '1px solid var(--Gray-300, #D5D7DA)',
                  background: 'var(--Gray-25, #FDFDFD)',
                  boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
                }}
              />
              <Button 
                type="submit" 
                className="w-full text-white"
                disabled={loading}
                style={{
                  width: '448px',
                  height: '36px',
                  borderRadius: '8px',
                  background: '#22577a',
                  boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
                }}
              >
                Continue with email
              </Button>
            </form>
          </div>

          <p className="text-xs text-gray-500 text-center mt-8">
            By clicking &quot;Sign in with Google&quot; or &quot;Continue with email&quot;
            you agree to our <a href="#" className="underline">Terms of Use</a> and <a href="#" className="underline">Privacy policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}