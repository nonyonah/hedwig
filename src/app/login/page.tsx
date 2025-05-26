'use client';

import { useState, useEffect } from 'react';
// import { signInWithOAuth } from '@/lib/supabase'; // Removed
// import { createBrowserClient } from '@supabase/ssr'; // Removed, Supabase client for auth not needed here
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth'; // Import Privy
import { Wallet } from 'lucide-react'; // Wallet Icon

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login, authenticated, ready } = usePrivy(); // Get Privy functions and state

  useEffect(() => {
    if (ready && authenticated) {
      router.replace('/overview');
    }
  }, [ready, authenticated, router]);

  const handlePrivyLogin = async () => {
    setLoading(true);
    try {
      login(); // Call Privy's login function
      // Privy handles the redirect or modal internally.
      // The useEffect above will redirect upon successful authentication.
    } catch (error) {
      console.error('Error with Privy login:', error);
      setLoading(false);
    }
    // setLoading(false) might not be reached if login() causes a page change or modal that doesn't resolve immediately.
    // Privy's `ready` and `authenticated` state should be primary indicators.
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header with logo */}
      <header className="flex flex-col items-center w-full bg-white px-[32px]">
        <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between">
          <div className="flex items-center gap-x-8">
            <div>
              <Image src="/logo.png" alt="Albus Logo" width={80} height={40} priority />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center">
          {/* Title and subtitle */}
          <h1 className="text-2xl font-semibold text-center mb-2">Log into your account</h1>
          <p className="text-gray-500 text-center mb-8">Let Albus handle the numbers while you focus on the work.</p>

          {/* Privy Sign-in Button */}
          <Button 
            variant="outline" 
            className="w-[448px] h-[36px] mb-6 flex items-center justify-center gap-2 bg-white border border-gray-300 text-black hover:bg-gray-50"
            onClick={handlePrivyLogin}
            disabled={!ready || loading} // Disable if Privy is not ready or already loading
          >
            <Wallet size={20} className="mr-2" /> {/* Wallet Icon */}
            <span className="ml-2">Sign in with your wallet</span>
          </Button>

          {/* Terms and Privacy - Update text if needed */}
          <p className="text-xs text-gray-500 text-center mt-8">
            By clicking &quot;Sign in with your wallet&quot; you agree to our{' '}
            <a href="#" className="underline">Terms of Use</a> and{' '}
            <a href="#" className="underline">Privacy policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}