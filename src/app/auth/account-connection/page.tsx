'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Remove unused CardFooter import
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { loadAndInitMonoConnect, saveBankConnection, hasBankAccount } from '@/lib/mono-connect';
import AuthenticatedConnectButton from '@/components/AuthenticatedConnectButton';
// Remove this stray component render
// <AuthenticatedConnectButton />
import { useWalletConnection } from '@/hooks/useWalletConnection';
// Add Image import for Next.js optimization
import Image from 'next/image';

export default function AccountConnectionPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useUser();
  // Remove unused variables or use _ prefix to indicate they're intentionally unused
  const { /* isConnected, address */ } = useWalletConnection(); // Only get connection status, not autoConnect
  const [bankConnected, setBankConnected] = useState(false);
  // Remove unused state or use it somewhere
  // const [isWalletOnlySignIn, setIsWalletOnlySignIn] = useState(false);
  
  // Check if user is authenticated and redirect if not
  useEffect(() => {
    // If not authenticated, redirect to sign in page
    if (!isAuthenticated && !user) {
      router.push('/auth/signin');
    }
  }, [isAuthenticated, user, router]);

  // Check for existing bank connection
  useEffect(() => {
    const checkUserAccounts = async () => {
      if (user?.id) {
        // Check if user has a bank account connected
        const hasBank = await hasBankAccount();
        setBankConnected(hasBank);
        
        // Check if this is a wallet-only sign in
        // setIsWalletOnlySignIn(walletParam === 'true'); // Remove if not used
        
        // If user has a bank account, redirect to dashboard
        if (hasBank) {
          router.push('/overview');
        }
      }
    };

    checkUserAccounts();
  }, [user, router]);

  // Use the consolidated Mono Connect approach
  const openMonoWidget = useCallback(async () => {
    try {
      const monoInstance = await loadAndInitMonoConnect(
        async (code) => {
          console.log(`Linked successfully: ${code}`);
          
          // Update the user's profile to mark bank as connected
          if (user?.id) {
            const success = await saveBankConnection(code);
            if (success) {
              setBankConnected(true);
              // Redirect to dashboard after successful connection
              router.push('/overview');
            }
          }
        },
        () => console.log('Widget closed')
      );
      
      if (monoInstance) {
        monoInstance.open();
      }
    } catch (error) {
      console.error('Error loading Mono Connect:', error);
    }
  }, [user, router]);

  // Remove unused function
  // const handleContinue = () => {
  //   router.push('/overview');
  // };

  const handleSkipBankConnection = () => {
    router.push('/overview');
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-background">
      {/* Header with wallet button */}
      <div className="w-full p-4 border-b">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              A
            </div>
            <span className="font-semibold">Albus</span>
          </div>
          <div className="flex items-center gap-2">
            <AuthenticatedConnectButton />
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Let&apos;s link your account</CardTitle>
            <CardDescription>
              Get a complete picture of your finances with your accounts and wallets in one place
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bank Account Connection Section - removed heading and description */}
            <div className="space-y-4">
              {!bankConnected ? (
                <div className="flex flex-col gap-3">
                  <Button 
                    onClick={openMonoWidget} 
                    variant="outline"
                    className="w-full"
                  >
                    Link Account
                  </Button>
                  
                  <div className="flex items-center justify-center text-xs text-gray-500 mt-1">
                    <span>powered by</span>
                    <Image 
                      src="/mono (2).svg" 
                      alt="Mono" 
                      width={16} 
                      height={16} 
                      className="ml-1" 
                    />
                  </div>
                  
                  <button 
                    onClick={handleSkipBankConnection} 
                    className="text-sm text-gray-500 hover:text-gray-700 mt-2 text-center w-full"
                  >
                    Skip
                  </button>
                </div>
              ) : (
                <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
                  Bank account connected successfully!
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}